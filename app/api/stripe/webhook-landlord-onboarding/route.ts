import { NextResponse, type NextRequest } from 'next/server';
import type Stripe from 'stripe';
import { createSupabaseAdminClient } from '@/lib/supabase';
import { getStripe } from '@/lib/stripe';
import { createGhlContact, addContactTag, enrollInWorkflow } from '@/lib/ghl';
import { sendAgreement } from '@/lib/agreement-sender';

/**
 * POST /api/stripe/webhook-landlord-onboarding — records landlord onboarding-fee
 * payments (both the in-wizard hosted-Checkout flow's Sessions and the public
 * inline-Card-Element checkout pages' PaymentIntents) and keeps the recurring
 * Standard/Portfolio subscription's status in sync.
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
 *
 * Agreement flow:
 *   After payment succeeds, sendAgreement() is called (best-effort, non-blocking).
 *   It renders the correct tier PDF, uploads to Supabase Storage, inserts a
 *   signing_requests row, and emails the client a signing link.
 *   Failures are logged but never fail the webhook (200 is always returned to Stripe).
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
    tags: ['Rental911', 'landlord', GHL_ONBOARDING_TAGS[tier] ?? tier],
  });
  if (!ok || !contactId) return;
  await addContactTag(contactId, 'onboarding-fee-paid');
  await enrollInWorkflow(contactId, process.env.GHL_ONBOARDING_WORKFLOW_ID);
}

// ─── Checkout Session (hosted checkout flow) ──────────────────────────────────

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

  // ── GHL sync (best-effort) ────────────────────────────────────────────────
  if (landlord) {
    try {
      await notifyGhl(landlord, updated.tier);
    } catch (err) {
      console.error('[stripe/webhook-landlord-onboarding] GHL sync failed (non-blocking):', err);
    }
  }

  // ── Auto-send agreement for signing (best-effort) ─────────────────────────
  // Contact info comes from the users table (landlord has an account at checkout time).
  if (landlord?.email && landlord?.full_name) {
    try {
      const result = await sendAgreement({
        tier: updated.tier,
        clientName: landlord.full_name,
        clientEmail: landlord.email,
      });
      if (!result.ok) {
        console.error('[stripe/webhook-landlord-onboarding] sendAgreement failed (checkout):', result.error);
      }
    } catch (err) {
      console.error('[stripe/webhook-landlord-onboarding] sendAgreement threw (checkout, non-blocking):', err);
    }
  }
}

// ─── Checkout Session expired ─────────────────────────────────────────────────

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

// ─── Subscription status sync ─────────────────────────────────────────────────

/** Keeps users.subscription_status fresh — same mirroring pattern as account.updated → stripe_charges_enabled. */
async function handleSubscriptionUpdated(subscription: Stripe.Subscription) {
  const admin = createSupabaseAdminClient();
  const { error } = await admin
    .from('users')
    .update({ subscription_status: subscription.status })
    .eq('stripe_subscription_id', subscription.id);
  if (error) throw new Error(`users subscription_status update failed: ${error.message}`);
}

// ─── PaymentIntent (inline Card Element checkout pages) ───────────────────────

/**
 * The public checkout pages (inline Card Element, `app/checkout/*`) charge
 * the one-time portion via a directly confirmed PaymentIntent rather than a
 * Checkout Session — there's no account yet at charge time, so `landlord_id`
 * is typically null and contact info comes from the payment row's own
 * contact columns rather than a `users` lookup.
 */
async function handlePaymentIntentSucceeded(intent: Stripe.PaymentIntent) {
  const paymentId = intent.metadata?.rental911_landlord_onboarding_payment_id;
  if (!paymentId) {
    // Not one of ours (e.g. a `stripe trigger` synthetic event, or rent/vendor traffic).
    return;
  }

  const admin = createSupabaseAdminClient();

  // Guarded by status='pending' so a redelivered event is a no-op.
  const { data: updated, error: paymentError } = await admin
    .from('landlord_onboarding_payments')
    .update({
      status: 'paid',
      paid_at: new Date().toISOString(),
      stripe_payment_intent_id: intent.id,
    })
    .eq('id', paymentId)
    .eq('status', 'pending')
    .select('tier, landlord_id, contact_email, contact_name, contact_phone')
    .maybeSingle();
  if (paymentError) throw new Error(`landlord_onboarding_payments update failed: ${paymentError.message}`);
  if (!updated) return; // already processed (retry) or row not in 'pending' state

  if (updated.landlord_id) {
    await admin.from('users').update({ onboarding_fee_status: 'paid' }).eq('id', updated.landlord_id);
  }

  // ── GHL sync (best-effort) ────────────────────────────────────────────────
  if (updated.contact_email) {
    try {
      await notifyGhl(
        { email: updated.contact_email, full_name: updated.contact_name, phone: updated.contact_phone },
        updated.tier
      );
    } catch (err) {
      console.error('[stripe/webhook-landlord-onboarding] GHL sync failed (non-blocking):', err);
    }
  }

  // ── Auto-send agreement for signing (best-effort) ─────────────────────────
  // Contact info comes from the payment row (no user account required at this stage).
  if (updated.contact_email && updated.contact_name) {
    try {
      const result = await sendAgreement({
        tier: updated.tier,
        clientName: updated.contact_name,
        clientEmail: updated.contact_email,
      });
      if (!result.ok) {
        console.error('[stripe/webhook-landlord-onboarding] sendAgreement failed (payment_intent):', result.error);
      }
    } catch (err) {
      console.error('[stripe/webhook-landlord-onboarding] sendAgreement threw (payment_intent, non-blocking):', err);
    }
  }
}

/**
 * No DB write — the row stays 'pending' so the same client-side flow can
 * retry against a fresh PaymentIntent. The action that created the charge
 * already surfaces the failure to the client directly for immediate UX.
 */
async function handlePaymentIntentFailed(intent: Stripe.PaymentIntent) {
  console.warn('[stripe/webhook-landlord-onboarding] payment_intent.payment_failed', intent.id, intent.last_payment_error?.message);
}

// ─── Route handler ────────────────────────────────────────────────────────────

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
      case 'payment_intent.succeeded':
        await handlePaymentIntentSucceeded(event.data.object);
        break;
      case 'payment_intent.payment_failed':
        await handlePaymentIntentFailed(event.data.object);
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
