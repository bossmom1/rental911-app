import { NextResponse, type NextRequest } from 'next/server';
import type Stripe from 'stripe';
import { createSupabaseAdminClient } from '@/lib/supabase';
import { getStripe } from '@/lib/stripe';

/**
 * POST /api/stripe/webhook — records rent payments and payout-account state.
 *
 * Writes with the service-role client: Stripe is unauthenticated to us, so
 * there is no user session to satisfy RLS.
 *
 * Idempotency matters — Stripe retries deliveries, and for ACH the same payment
 * arrives twice by design (checkout.session.completed while still `processing`,
 * then payment_intent.succeeded days later when it settles). Rows are keyed on
 * stripe_checkout_session_id (unique index) so retries update rather than duplicate.
 */

// Stripe needs the unparsed body to verify the signature.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const centsToDollars = (cents: number | null | undefined) =>
  typeof cents === 'number' ? cents / 100 : null;

const today = () => new Date().toISOString().slice(0, 10);

/** First of the month the charge was created in — gives the history table a Due date. */
function periodStart(unixSeconds: number): string {
  const d = new Date(unixSeconds * 1000);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1))
    .toISOString()
    .slice(0, 10);
}

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  const admin = createSupabaseAdminClient();
  const leaseId = session.metadata?.rental911_lease_id ?? null;
  const tenantId = session.metadata?.rental911_tenant_id ?? null;

  if (!leaseId || !tenantId) {
    console.warn('[stripe/webhook] session %s missing Rental911 metadata', session.id);
    return;
  }

  const amountCents = session.amount_total ?? 0;
  // Card sessions arrive already paid; ACH arrives unpaid and settles later.
  const paid = session.payment_status === 'paid';

  const { error } = await admin.from('rent_payments').upsert(
    {
      lease_id: leaseId,
      tenant_id: tenantId,
      amount: centsToDollars(amountCents),
      due_date: periodStart(session.created),
      paid_date: paid ? today() : null,
      status: paid ? 'paid' : 'pending',
      stripe_payment_intent_id:
        typeof session.payment_intent === 'string'
          ? session.payment_intent
          : session.payment_intent?.id ?? null,
      stripe_checkout_session_id: session.id,
      // platform_fee intentionally not written: Rental911 takes no cut of rent.
    },
    { onConflict: 'stripe_checkout_session_id' }
  );

  if (error) {
    // Throw so the handler 500s and Stripe retries — silently losing a payment
    // record is far worse than a noisy retry.
    throw new Error(`rent_payments upsert failed: ${error.message}`);
  }
}

async function handlePaymentIntentSucceeded(intent: Stripe.PaymentIntent) {
  const admin = createSupabaseAdminClient();

  // Destination charges create a Transfer; capture its id for reconciliation.
  let transferId: string | null = null;
  try {
    const chargeId =
      typeof intent.latest_charge === 'string'
        ? intent.latest_charge
        : intent.latest_charge?.id;
    if (chargeId) {
      const charge = await getStripe().charges.retrieve(chargeId);
      transferId =
        typeof charge.transfer === 'string' ? charge.transfer : charge.transfer?.id ?? null;
    }
  } catch (err) {
    // Non-fatal: the payment is still real without the transfer id.
    console.warn('[stripe/webhook] could not resolve transfer id:', err);
  }

  const { error } = await admin
    .from('rent_payments')
    .update({
      status: 'paid',
      paid_date: today(),
      ...(transferId ? { stripe_transfer_id: transferId } : {}),
    })
    .eq('stripe_payment_intent_id', intent.id);

  if (error) throw new Error(`rent_payments update failed: ${error.message}`);
}

async function handlePaymentIntentFailed(intent: Stripe.PaymentIntent) {
  const admin = createSupabaseAdminClient();
  const { error } = await admin
    .from('rent_payments')
    .update({ status: 'failed' })
    .eq('stripe_payment_intent_id', intent.id);

  if (error) throw new Error(`rent_payments failure update failed: ${error.message}`);
}

async function handleAccountUpdated(account: Stripe.Account) {
  const admin = createSupabaseAdminClient();
  const { error } = await admin
    .from('users')
    .update({ stripe_charges_enabled: Boolean(account.charges_enabled) })
    .eq('stripe_account_id', account.id);

  if (error) throw new Error(`users payout-state update failed: ${error.message}`);
}

export async function POST(request: NextRequest) {
  const signature = request.headers.get('stripe-signature');
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret || !signature) {
    console.error('[stripe/webhook] missing signature or STRIPE_WEBHOOK_SECRET');
    return NextResponse.json({ error: 'Webhook not configured.' }, { status: 400 });
  }

  const rawBody = await request.text();

  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'signature verification failed';
    console.error('[stripe/webhook] rejected:', message);
    return NextResponse.json({ error: `Invalid signature: ${message}` }, { status: 400 });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutCompleted(event.data.object);
        break;
      case 'payment_intent.succeeded':
        await handlePaymentIntentSucceeded(event.data.object);
        break;
      case 'payment_intent.payment_failed':
        await handlePaymentIntentFailed(event.data.object);
        break;
      case 'account.updated':
        await handleAccountUpdated(event.data.object);
        break;
      default:
        // Acknowledge everything else so Stripe stops retrying it.
        break;
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'handler failed';
    console.error('[stripe/webhook] %s failed:', event.type, message);
    // 500 tells Stripe to retry; the handlers above are idempotent.
    return NextResponse.json({ error: message }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
