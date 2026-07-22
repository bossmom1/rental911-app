import { NextResponse, type NextRequest } from 'next/server';
import type Stripe from 'stripe';
import { createSupabaseAdminClient } from '@/lib/supabase';
import { getStripe, RENT_DUE_DAY } from '@/lib/stripe';
import { generateAndSendReceipt } from '@/lib/receipts';

/**
 * POST /api/stripe/webhook — records rent payments and payout-account state.
 *
 * Rent is a DIRECT charge on the landlord's connected account, so these arrive
 * as CONNECT events with `event.account` set. Register this as a Connect webhook
 * endpoint in the dashboard; locally use `stripe listen --forward-connect-to`.
 *
 * Writes with the service-role client: Stripe is unauthenticated to us, so there
 * is no session to satisfy RLS.
 *
 * Idempotency matters — Stripe retries deliveries, and ACH reports twice by
 * design (payment_intent.processing while settling, then .succeeded days later).
 * Rows key on stripe_payment_intent_id (unique index) so retries update in place.
 */

// Stripe needs the unparsed body to verify the signature.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const centsToDollars = (cents: number | null | undefined) =>
  typeof cents === 'number' ? cents / 100 : null;

const today = () => new Date().toISOString().slice(0, 10);

/** The 5th of the month the charge was created in — rent's actual due date, and
 * what late-fee eligibility is measured against (see lib/stripe.ts isRentLate). */
function periodDueDate(unixSeconds: number): string {
  const d = new Date(unixSeconds * 1000);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), RENT_DUE_DAY))
    .toISOString()
    .slice(0, 10);
}

/** 'ach' | 'card_credit' | 'card_debit', matching the DB check constraint. */
function methodLabel(intent: Stripe.PaymentIntent): string | null {
  const method = intent.metadata?.rental911_method;
  if (method === 'ach') return 'ach';
  if (method !== 'card') return null;
  return intent.metadata?.rental911_card_funding === 'credit'
    ? 'card_credit'
    : 'card_debit';
}

/**
 * Upsert the row for a PaymentIntent. `amount` is always the RENT; the surcharge
 * and the tenant's true total are recorded separately so payouts reconcile.
 * Returns the row id so callers can trigger follow-up work (e.g. receipts).
 */
async function recordIntent(
  intent: Stripe.PaymentIntent,
  status: 'pending' | 'paid' | 'failed'
): Promise<string | null> {
  const leaseId = intent.metadata?.rental911_lease_id ?? null;
  const tenantId = intent.metadata?.rental911_tenant_id ?? null;

  if (!leaseId || !tenantId) {
    // Not one of ours (e.g. a `stripe trigger` synthetic event).
    console.warn('[stripe/webhook] intent %s missing Rental911 metadata', intent.id);
    return null;
  }

  const rentCents = Number(intent.metadata?.rental911_rent_cents ?? 0);
  const lateFeeCents = Number(intent.metadata?.rental911_late_fee_cents ?? 0);
  const surchargeCents = Number(intent.metadata?.rental911_surcharge_cents ?? 0);

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from('rent_payments')
    .upsert(
      {
        lease_id: leaseId,
        tenant_id: tenantId,
        amount: centsToDollars(rentCents),
        late_fee_amount: centsToDollars(lateFeeCents),
        surcharge_amount: centsToDollars(surchargeCents),
        total_charged: centsToDollars(intent.amount),
        payment_method: methodLabel(intent),
        due_date: periodDueDate(intent.created),
        paid_date: status === 'paid' ? today() : null,
        status,
        stripe_payment_intent_id: intent.id,
      },
      { onConflict: 'stripe_payment_intent_id' }
    )
    .select('id')
    .single();

  if (error) {
    // Throw so the handler 500s and Stripe retries — silently losing a payment
    // record is far worse than a noisy retry.
    throw new Error(`rent_payments upsert failed: ${error.message}`);
  }

  return data.id;
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
      // ACH: settling. Card rarely lands here.
      case 'payment_intent.processing':
        await recordIntent(event.data.object, 'pending');
        break;
      case 'payment_intent.succeeded': {
        const paymentId = await recordIntent(event.data.object, 'paid');
        // Best-effort; generateAndSendReceipt swallows its own errors and is
        // idempotent (skips if a receipt already exists), so Stripe retries
        // of this same event never re-send the email.
        if (paymentId) await generateAndSendReceipt(paymentId);
        break;
      }
      case 'payment_intent.payment_failed':
        // Covers late ACH failures (e.g. R01) that arrive days after settling.
        await recordIntent(event.data.object, 'failed');
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
