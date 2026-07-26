import { NextResponse, type NextRequest } from 'next/server';
import type Stripe from 'stripe';
import { createSupabaseAdminClient } from '@/lib/supabase';
import { getStripe } from '@/lib/stripe';

/**
 * POST /api/stripe/webhook-vendor-membership — records vendor membership
 * Checkout charges.
 *
 * A separate endpoint (and signing secret) from /api/stripe/webhook on
 * purpose: that endpoint is registered as a Connect webhook for landlords'
 * rent payments (direct charges on their connected accounts, arriving with
 * `event.account` set). Vendors have no Stripe Connect account — a membership
 * charge is a plain platform-account charge — so it needs its own,
 * account-scoped endpoint registration rather than a case bolted onto the
 * Connect-scoped switch statement.
 *
 * Writes with the service-role client: Stripe is unauthenticated to us, so
 * there is no session to satisfy RLS.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  const paymentId = session.metadata?.rental911_vendor_membership_payment_id;
  const vendorId = session.metadata?.rental911_vendor_id;
  if (!paymentId || !vendorId) {
    console.warn('[stripe/webhook-vendor-membership] checkout.session.completed missing metadata', session.id);
    return;
  }

  const admin = createSupabaseAdminClient();

  // Guarded by status='pending' so a redelivered event is a no-op.
  const { data: updated, error: paymentError } = await admin
    .from('vendor_membership_payments')
    .update({
      status: 'paid',
      paid_at: new Date().toISOString(),
      stripe_payment_intent_id:
        typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id ?? null,
    })
    .eq('id', paymentId)
    .eq('status', 'pending')
    .select('id')
    .maybeSingle();
  if (paymentError) throw new Error(`vendor_membership_payments update failed: ${paymentError.message}`);
  if (!updated) return; // already processed (retry) or row not in 'pending' state

  const { data: vendor, error: vendorFetchError } = await admin
    .from('vendors')
    .select('membership_start_date')
    .eq('id', vendorId)
    .maybeSingle();
  if (vendorFetchError) throw new Error(`vendors fetch failed: ${vendorFetchError.message}`);

  const { error: vendorUpdateError } = await admin
    .from('vendors')
    .update({
      membership_status: 'active',
      // Never overwritten on renewals — only set on the first-ever payment.
      ...(vendor?.membership_start_date ? {} : { membership_start_date: new Date().toISOString().slice(0, 10) }),
    })
    .eq('id', vendorId);
  if (vendorUpdateError) throw new Error(`vendors update failed: ${vendorUpdateError.message}`);
}

async function handleCheckoutExpired(session: Stripe.Checkout.Session) {
  const paymentId = session.metadata?.rental911_vendor_membership_payment_id;
  const vendorId = session.metadata?.rental911_vendor_id;
  if (!paymentId || !vendorId) {
    console.warn('[stripe/webhook-vendor-membership] checkout.session.expired missing metadata', session.id);
    return;
  }

  const admin = createSupabaseAdminClient();

  const { error: paymentError } = await admin
    .from('vendor_membership_payments')
    .update({ status: 'expired' })
    .eq('id', paymentId)
    .eq('status', 'pending');
  if (paymentError) throw new Error(`vendor_membership_payments update failed: ${paymentError.message}`);

  // Only revert vendors still in 'pending_payment' — an already-active vendor
  // (unused renewal link) is left untouched, never downgraded.
  const { error: vendorError } = await admin
    .from('vendors')
    .update({ membership_status: 'not_started' })
    .eq('id', vendorId)
    .eq('membership_status', 'pending_payment');
  if (vendorError) throw new Error(`vendors update failed: ${vendorError.message}`);
}

export async function POST(request: NextRequest) {
  const signature = request.headers.get('stripe-signature');
  const webhookSecret = process.env.STRIPE_MEMBERSHIP_WEBHOOK_SECRET;

  if (!webhookSecret || !signature) {
    console.error('[stripe/webhook-vendor-membership] missing signature or STRIPE_MEMBERSHIP_WEBHOOK_SECRET');
    return NextResponse.json({ error: 'Webhook not configured.' }, { status: 400 });
  }

  const rawBody = await request.text();

  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'signature verification failed';
    console.error('[stripe/webhook-vendor-membership] rejected:', message);
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
      default:
        // Acknowledge everything else so Stripe stops retrying it.
        break;
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'handler failed';
    console.error('[stripe/webhook-vendor-membership] %s failed:', event.type, message);
    return NextResponse.json({ error: message }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
