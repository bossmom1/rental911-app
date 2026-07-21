'use server';

import { cookies, headers } from 'next/headers';
import { createSupabaseServerClient, createSupabaseAdminClient } from '@/lib/supabase';
import { getCurrentUser } from '@/lib/auth';
import { getStripe } from '@/lib/stripe';

export type CheckoutResult = { ok: true; url: string } | { ok: false; error: string };

function siteUrl(): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '');
  if (configured) return configured;
  const h = headers();
  const host = h.get('x-forwarded-host') ?? h.get('host');
  const proto = h.get('x-forwarded-proto') ?? 'https';
  return `${proto}://${host}`;
}

/** "August 2026" — the period the tenant is paying for. */
function currentPeriodLabel(): string {
  return new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

/**
 * Start a hosted Stripe Checkout for this month's rent.
 *
 * Rental911 takes NO cut of rent — the whole payment belongs to the landlord.
 * Christine's revenue is flat service fees billed separately, entirely outside
 * this flow, so there is deliberately no `application_fee_amount` here. Do not
 * add one back.
 *
 * No rent_payments row is written here — RLS gives tenants select-only on that
 * table, and more importantly a payment isn't real until Stripe confirms it.
 * The webhook records it. That matters for ACH, which settles days later.
 */
export async function startRentCheckout(): Promise<CheckoutResult> {
  const current = await getCurrentUser();
  if (!current || current.profile?.role !== 'tenant') {
    return { ok: false, error: 'You must be signed in as a tenant to pay rent.' };
  }

  const supabase = createSupabaseServerClient(cookies());
  const { data: lease, error: leaseErr } = await supabase
    .from('leases')
    .select('id, monthly_rent, landlord_id, status')
    .eq('tenant_id', current.authId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (leaseErr) return { ok: false, error: `Could not load your lease: ${leaseErr.message}` };
  if (!lease) return { ok: false, error: 'No lease is linked to your account yet.' };
  if (!lease.landlord_id) {
    return { ok: false, error: 'This lease has no landlord assigned. Please contact support.' };
  }

  const amountCents = Math.round(Number(lease.monthly_rent ?? 0) * 100);
  if (!Number.isFinite(amountCents) || amountCents <= 0) {
    return { ok: false, error: 'Your lease has no monthly rent set. Please contact support.' };
  }

  // Tenants have no RLS path to the landlord's profile, so read the payout
  // account with the service-role client (server-only).
  const admin = createSupabaseAdminClient();
  const { data: landlord, error: llErr } = await admin
    .from('users')
    .select('stripe_account_id')
    .eq('id', lease.landlord_id)
    .maybeSingle();

  if (llErr) return { ok: false, error: `Could not load payout details: ${llErr.message}` };
  if (!landlord?.stripe_account_id) {
    return {
      ok: false,
      error: 'Your landlord has not finished setting up rent collection yet.',
    };
  }

  const stripe = getStripe();

  try {
    // Verify against Stripe rather than the cached column: charging a landlord
    // who cannot yet receive funds would strand the money on the platform.
    const account = await stripe.accounts.retrieve(landlord.stripe_account_id);
    if (!account.charges_enabled) {
      return {
        ok: false,
        error: 'Your landlord has not finished setting up rent collection yet.',
      };
    }

    const base = siteUrl();
    const period = currentPeriodLabel();

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card', 'us_bank_account'],
      customer_email: current.email,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: 'usd',
            unit_amount: amountCents,
            product_data: { name: `Rent — ${period}` },
          },
        },
      ],
      payment_intent_data: {
        // No application_fee_amount: the full rent goes to the landlord.
        transfer_data: { destination: landlord.stripe_account_id },
        metadata: {
          rental911_lease_id: lease.id,
          rental911_tenant_id: current.authId,
          rental911_period: period,
        },
      },
      // Mirrored on the session too: the webhook reads whichever object it gets.
      metadata: {
        rental911_lease_id: lease.id,
        rental911_tenant_id: current.authId,
        rental911_period: period,
      },
      success_url: `${base}/tenant/rent?paid=1&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${base}/tenant/rent?canceled=1`,
    });

    if (!session.url) {
      return { ok: false, error: 'Stripe did not return a checkout URL. Please try again.' };
    }
    return { ok: true, url: session.url };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Stripe request failed.';
    console.error('[rent/checkout] failed:', message);
    return { ok: false, error: message };
  }
}
