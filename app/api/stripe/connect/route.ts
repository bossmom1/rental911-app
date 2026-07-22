import { cookies } from 'next/headers';
import { NextResponse, type NextRequest } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase';
import { getCurrentUser } from '@/lib/auth';
import { getStripe } from '@/lib/stripe';

/**
 * Stripe Connect Express onboarding for landlord payout accounts.
 * Reached from onboarding Step 6, and again later if Stripe still wants details.
 *
 * POST -> creates (or reuses) the landlord's Express account and returns a
 *         one-time Stripe-hosted onboarding URL to redirect to.
 * GET  -> reports whether the account exists and can accept charges.
 *
 * Rent is collected as a DIRECT charge on this account, which makes the landlord
 * the merchant of record: Stripe's fee, refunds, and chargebacks all settle
 * against their balance and never the platform's. That requires full payment
 * capabilities (card_payments + us_bank_account_ach_payments). Stripe also
 * requires `transfers` to be requested alongside card_payments, even though
 * this account never receives a Transfer object.
 */

function siteUrl(request: NextRequest): string {
  return (
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') ?? new URL(request.url).origin
  );
}

export async function POST(request: NextRequest) {
  const current = await getCurrentUser();
  if (!current) {
    return NextResponse.json({ ok: false, error: 'Not signed in.' }, { status: 401 });
  }
  if (current.profile?.role !== 'landlord') {
    return NextResponse.json(
      { ok: false, error: 'Only landlords have payout accounts.' },
      { status: 403 }
    );
  }

  const stripe = getStripe();
  const supabase = createSupabaseServerClient(cookies());
  let accountId = current.profile.stripe_account_id ?? null;

  try {
    if (!accountId) {
      const account = await stripe.accounts.create({
        type: 'express',
        email: current.email,
        capabilities: {
          card_payments: { requested: true },
          us_bank_account_ach_payments: { requested: true },
          transfers: { requested: true },
        },
        business_profile: { product_description: 'Residential rent collection' },
        metadata: { rental911_user_id: current.authId },
      });
      accountId = account.id;

      // Persist before redirecting. If the account-link step fails, the next
      // attempt must reuse this account instead of orphaning it and making another.
      const { error } = await supabase
        .from('users')
        .update({ stripe_account_id: accountId })
        .eq('id', current.authId);
      if (error) {
        return NextResponse.json(
          { ok: false, error: `Could not save payout account: ${error.message}` },
          { status: 500 }
        );
      }
    }

    const base = siteUrl(request);
    const link = await stripe.accountLinks.create({
      account: accountId,
      // Stripe sends the landlord back here if the link expired before they finished.
      refresh_url: `${base}/landlord/onboarding?stripe=refresh`,
      return_url: `${base}/landlord/onboarding?stripe=return`,
      type: 'account_onboarding',
    });

    return NextResponse.json({ ok: true, url: link.url });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Stripe request failed.';
    console.error('[stripe/connect] onboarding failed:', message);
    return NextResponse.json({ ok: false, error: message }, { status: 502 });
  }
}

export async function GET() {
  const current = await getCurrentUser();
  if (!current) {
    return NextResponse.json({ ok: false, error: 'Not signed in.' }, { status: 401 });
  }

  const accountId = current.profile?.stripe_account_id ?? null;
  if (!accountId) {
    return NextResponse.json({ ok: true, connected: false, chargesEnabled: false });
  }

  try {
    // Read Stripe directly rather than trusting the cached column — the landlord
    // may have just finished onboarding and the webhook may not have landed yet.
    const account = await getStripe().accounts.retrieve(accountId);
    return NextResponse.json({
      ok: true,
      connected: true,
      chargesEnabled: account.charges_enabled,
      payoutsEnabled: account.payouts_enabled,
      detailsSubmitted: account.details_submitted,
      currentlyDue: account.requirements?.currently_due ?? [],
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Stripe request failed.';
    return NextResponse.json({ ok: false, error: message }, { status: 502 });
  }
}
