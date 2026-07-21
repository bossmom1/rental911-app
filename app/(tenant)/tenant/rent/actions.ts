'use server';

import { cookies } from 'next/headers';
import { createSupabaseServerClient, createSupabaseAdminClient } from '@/lib/supabase';
import { getCurrentUser } from '@/lib/auth';
import {
  getStripe,
  achSurchargeCents,
  cardSurchargeCents,
  creditSurchargeCents,
} from '@/lib/stripe';

/**
 * Rent payment actions.
 *
 * Rental911 takes NO cut. Rent is a DIRECT charge on the landlord's connected
 * account, so Stripe's fee is debited from the landlord's balance and never from
 * the platform. Who effectively absorbs that fee depends on the method:
 *
 *   ACH    — surcharge added up front; landlord nets the full rent.
 *   Credit — surcharge added at confirm time, once we know the funding type.
 *   Debit  — no surcharge (illegal); the fee comes out of the landlord's payout.
 *
 * Debit vs credit cannot be known before the card is entered, which is why the
 * card path is create-intent -> read funding -> update amount -> confirm, rather
 * than a single hosted Checkout call. Every amount is computed server-side.
 */

export type PaymentMethodChoice = 'ach' | 'card';

export type IntentResult =
  | {
      ok: true;
      clientSecret: string;
      paymentIntentId: string;
      connectedAccountId: string;
      rentCents: number;
      surchargeCents: number;
      totalCents: number;
    }
  | { ok: false; error: string };

export type ConfirmResult =
  | { ok: true; status: string; requiresAction: boolean; clientSecret: string | null }
  | { ok: false; error: string };

/** "August 2026" — the period being paid for. */
function currentPeriodLabel(): string {
  return new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

type RentContext = {
  leaseId: string;
  tenantId: string;
  email: string;
  rentCents: number;
  connectedAccountId: string;
};

/**
 * Resolve the signed-in tenant's lease and their landlord's payout account.
 * Tenants have no RLS path to the landlord's profile, so that read uses the
 * service-role client (server-only).
 */
async function loadRentContext(): Promise<RentContext | { error: string }> {
  const current = await getCurrentUser();
  if (!current || current.profile?.role !== 'tenant') {
    return { error: 'You must be signed in as a tenant to pay rent.' };
  }

  const supabase = createSupabaseServerClient(cookies());
  const { data: lease, error: leaseErr } = await supabase
    .from('leases')
    .select('id, monthly_rent, landlord_id')
    .eq('tenant_id', current.authId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (leaseErr) return { error: `Could not load your lease: ${leaseErr.message}` };
  if (!lease) return { error: 'No lease is linked to your account yet.' };
  if (!lease.landlord_id) {
    return { error: 'This lease has no landlord assigned. Please contact support.' };
  }

  const rentCents = Math.round(Number(lease.monthly_rent ?? 0) * 100);
  if (!Number.isFinite(rentCents) || rentCents <= 0) {
    return { error: 'Your lease has no monthly rent set. Please contact support.' };
  }

  const admin = createSupabaseAdminClient();
  const { data: landlord, error: llErr } = await admin
    .from('users')
    .select('stripe_account_id')
    .eq('id', lease.landlord_id)
    .maybeSingle();

  if (llErr) return { error: `Could not load payout details: ${llErr.message}` };
  if (!landlord?.stripe_account_id) {
    return { error: 'Your landlord has not finished setting up rent collection yet.' };
  }

  return {
    leaseId: lease.id,
    tenantId: current.authId,
    email: current.email,
    rentCents,
    connectedAccountId: landlord.stripe_account_id,
  };
}

/**
 * Create the PaymentIntent for the chosen method.
 *
 * ACH knows its surcharge up front. Card deliberately starts at the bare rent —
 * the surcharge is only added in confirmCardRent, after the funding type is known.
 */
export async function createRentIntent(
  method: PaymentMethodChoice
): Promise<IntentResult> {
  const ctx = await loadRentContext();
  if ('error' in ctx) return { ok: false, error: ctx.error };

  const stripe = getStripe();
  const period = currentPeriodLabel();

  try {
    const account = await stripe.accounts.retrieve(ctx.connectedAccountId);
    if (!account.charges_enabled) {
      return {
        ok: false,
        error: 'Your landlord has not finished setting up rent collection yet.',
      };
    }

    const surchargeCents = method === 'ach' ? achSurchargeCents(ctx.rentCents) : 0;
    const totalCents = ctx.rentCents + surchargeCents;

    const intent = await stripe.paymentIntents.create(
      {
        amount: totalCents,
        currency: 'usd',
        payment_method_types: method === 'ach' ? ['us_bank_account'] : ['card'],
        receipt_email: ctx.email,
        description: `Rent — ${period}`,
        metadata: {
          rental911_lease_id: ctx.leaseId,
          rental911_tenant_id: ctx.tenantId,
          rental911_period: period,
          rental911_method: method,
          rental911_rent_cents: String(ctx.rentCents),
          rental911_surcharge_cents: String(surchargeCents),
        },
      },
      // Direct charge: created ON the landlord's account, so Stripe's fee is
      // debited from their balance, not the platform's.
      { stripeAccount: ctx.connectedAccountId }
    );

    if (!intent.client_secret) {
      return { ok: false, error: 'Stripe did not return a client secret.' };
    }

    return {
      ok: true,
      clientSecret: intent.client_secret,
      paymentIntentId: intent.id,
      connectedAccountId: ctx.connectedAccountId,
      rentCents: ctx.rentCents,
      surchargeCents,
      totalCents,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Stripe request failed.';
    console.error('[rent/intent] failed:', message);
    return { ok: false, error: message };
  }
}

/**
 * Card path only. The client creates the PaymentMethod (never confirming it), we
 * read `card.funding`, apply a surcharge only for 'credit', then confirm.
 *
 * cardSurchargeCents fails closed: debit, prepaid, and unknown all surcharge $0.
 */
export async function confirmCardRent(
  paymentIntentId: string,
  paymentMethodId: string
): Promise<ConfirmResult> {
  const ctx = await loadRentContext();
  if ('error' in ctx) return { ok: false, error: ctx.error };

  const stripe = getStripe();
  const opts = { stripeAccount: ctx.connectedAccountId };

  try {
    const intent = await stripe.paymentIntents.retrieve(paymentIntentId, opts);

    // Never let one tenant drive another tenant's PaymentIntent.
    if (intent.metadata?.rental911_tenant_id !== ctx.tenantId) {
      return { ok: false, error: 'This payment does not belong to your account.' };
    }

    const method = await stripe.paymentMethods.retrieve(paymentMethodId, opts);
    const funding = method.card?.funding ?? null;
    const surchargeCents = cardSurchargeCents(ctx.rentCents, funding);
    const totalCents = ctx.rentCents + surchargeCents;

    // Amount is set server-side from the funding type the network reported.
    const confirmed = await stripe.paymentIntents.update(
      paymentIntentId,
      {
        amount: totalCents,
        metadata: {
          ...intent.metadata,
          rental911_surcharge_cents: String(surchargeCents),
          rental911_card_funding: funding ?? 'unknown',
        },
      },
      opts
    );
    void confirmed;

    const result = await stripe.paymentIntents.confirm(
      paymentIntentId,
      { payment_method: paymentMethodId },
      opts
    );

    return {
      ok: true,
      status: result.status,
      // 3D Secure and similar step-ups finish client-side.
      requiresAction: result.status === 'requires_action',
      clientSecret: result.client_secret ?? null,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Stripe request failed.';
    console.error('[rent/confirm] failed:', message);
    return { ok: false, error: message };
  }
}

/**
 * What the tenant would pay by each method, for disclosure BEFORE they choose.
 * Surcharges must be disclosed pre-purchase; the card figure is the credit-card
 * worst case, and a debit card is charged the bare rent instead.
 */
export async function quoteRent(): Promise<
  | {
      ok: true;
      rentCents: number;
      achTotalCents: number;
      achSurchargeCents: number;
      creditTotalCents: number;
      creditSurchargeCents: number;
    }
  | { ok: false; error: string }
> {
  const ctx = await loadRentContext();
  if ('error' in ctx) return { ok: false, error: ctx.error };

  const ach = achSurchargeCents(ctx.rentCents);
  const credit = creditSurchargeCents(ctx.rentCents);

  return {
    ok: true,
    rentCents: ctx.rentCents,
    achSurchargeCents: ach,
    achTotalCents: ctx.rentCents + ach,
    creditSurchargeCents: credit,
    creditTotalCents: ctx.rentCents + credit,
  };
}
