import { NextResponse, type NextRequest } from 'next/server';
import type Stripe from 'stripe';
import { createSupabaseAdminClient } from '@/lib/supabase';
import { getStripe } from '@/lib/stripe';
import { createGhlContact, addContactTag, enrollInWorkflow } from '@/lib/ghl';

/**
 * POST /api/stripe/webhook-landlord-onboarding — records landlord onboarding-fee
 * Checkout Sessions and keeps the recurring Standard/Portfolio subscription's
 * status in sync.
 *
 * A separate endpoint (and signing secret) from /api/stripe/webhook (Connect,
 * rent) and /api/stripe/webhook-vendor-membership (account, vendor billing) —
 * same reasoning as the vendor one: these are plain platform-account charges,
 * not Connect events.
 *
 * Does NOT touch users.access_level — that stays a manual admin gate tied to
 * the confirmation call, independent of whether the fee has been paid.
 *
 * Writes with the service-role client: Stripe is unauthenticated to us, so
 * there is no session to satisfy RLS.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const GHL_ONBOARDING_TAGS: Record<string, string> = {
  standard: 'Standard Landlord Rescue',
  placement_only: 'Placement Only',
  portfolio: 'Portfolio Investor',
};

async function notifyGhl(
  landlord: { email: string; full_name: string | null; phone: string | null },
  tier: string
) {
  const { ok, contactId } = await createGhlContact({
    email: landlord.email,
    name: landlord.full_name,
    phone: landlord.phone,
    role: 'landlord',
    tags: ['landlord', GHL_ONBOARDING_TAGS[tier] ?? tier],
  });
  if (!ok || !contactId) return;
  await addContactTag(contactId, 'onboarding-fee-paid');
  await enrollInWorkflow(contactId, process.env.GHL_ONBOARDING_WORKFLOW_ID);
}

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  const paymentId = session.metadata?.rental911_landlord_onboarding_payment_id;
  const landlordId = session.metadata?.rental911_landlord_id;
  if (!paymentId || !landlordId) {
    console.warn('[stripe/webhook-landlord-onboarding] checkout.session.completed missing metadata', session.id);
    return;
  }

  const admin = createSupabaseAdminClient();
  const customerId = typeof session.customer === 'string' ? session.customer : session.customer?.id ?? null;
  const subscriptionId =
    typeof session.subscription === 'string' ? session.subscription : session.subscription?.id ?? null;

  let subscriptionStatus: string | null = null;
  if (subscriptionId) {
    const subscription = await getStripe().subscriptions.retrieve(subscriptionId);
    subscriptionStatus = subscription.status;
  }

  // Guarded by status='pending' so a redelivered event is a no-op.
  const { data: updated, error: paymentError } = await admin
    .from('landlord_onboarding_payments')
    .update({
      status: 'paid',
      paid_at: new Date().toISOString(),
      stripe_customer_id: customerId,
      stripe_subscription_id: subscriptionId,
    })
    .eq('id', paymentId)
    .eq('status', 'pending')
    .select('tier')
    .maybeSingle();
  if (paymentError) throw new Error(`landlord_onboarding_payments update failed: ${paymentError.message}`);
  if (!updated) return; // already processed (retry) or row not in 'pending' state

  const { data: landlord, error: landlordUpdateError } = await admin
    .from('users')
    .update({
      onboarding_fee_status: 'paid',
      stripe_customer_id: customerId,
      stripe_subscription_id: subscriptionId,
      subscription_status: subscriptionStatus,
    })
    .eq('id', landlordId)
    .select('email, full_name, phone')
    .maybeSingle();
  if (landlordUpdateError) throw new Error(`users update failed: ${landlordUpdateError.message}`);

  if (landlord) {
    try {
      await notifyGhl(landlord, updated.tier);
    } catch (err) {
      // GHL sync is best-effort — never fail the webhook over it.
      console.error('[stripe/webhook-landlord-onboarding] GHL sync failed (non-blocking):', err);
    }
  }
}

async function handleCheckoutExpired(session: Stripe.Checkout.Session) {
  const paymentId = session.metadata?.rental911_landlord_onboarding_payment_id;
  const landlordId = session.metadata?.rental911_landlord_id;
  if (!paymentId || !landlordId) {
    console.warn('[stripe/webhook-landlord-onboarding] checkout.session.expired missing metadata', session.id);
    return;
  }

  const admin = createSupabaseAdminClient();

  const { error: paymentError } = await admin
    .from('landlord_onboarding_payments')
    .update({ status: 'expired' })
    .eq('id', paymentId)
    .eq('status', 'pending');
  if (paymentError) throw new Error(`landlord_onboarding_payments update failed: ${paymentError.message}`);

  const { error: landlordError } = await admin
    .from('users')
    .update({ onboarding_fee_status: 'not_started' })
    .eq('id', landlordId)
    .eq('onboarding_fee_status', 'pending_payment');
  if (landlordError) throw new Error(`users update failed: ${landlordError.message}`);
}

/** Keeps users.subscription_status fresh — same mirroring pattern as account.updated → stripe_charges_enabled. */
async function handleSubscriptionUpdated(subscription: Stripe.Subscription) {
  const admin = createSupabaseAdminClient();
  const { error } = await admin
    .from('users')
    .update({ subscription_status: subscription.status })
    .eq('stripe_subscription_id', subscription.id);
  if (error) throw new Error(`users subscription_status update failed: ${error.message}`);
}

export async function POST(request: NextRequest) {
  const signature = request.headers.get('stripe-signature');
  const webhookSecret = process.env.STRIPE_ONBOARDING_WEBHOOK_SECRET;

  if (!webhookSecret || !signature) {
    console.error('[stripe/webhook-landlord-onboarding] missing signature or STRIPE_ONBOARDING_WEBHOOK_SECRET');
    return NextResponse.json({ error: 'Webhook not configured.' }, { status: 400 });
  }

  const rawBody = await request.text();

  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'signature verification failed';
    console.error('[stripe/webhook-landlord-onboarding] rejected:', message);
    return NextResponse.json({ error: `Invalid signature: ${message}` }, { status: 400 });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutCompleted(event.data.object);
        break;
      case 'checkout.session.expired':
        await handleCheckoutExpired(event.data.object);
        break;
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
        await handleSubscriptionUpdated(event.data.object);
        break;
      default:
        // Acknowledge everything else so Stripe stops retrying it.
        break;
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'handler failed';
    console.error('[stripe/webhook-landlord-onboarding] %s failed:', event.type, message);
    return NextResponse.json({ error: message }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
