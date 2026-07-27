import type Stripe from 'stripe';
import { getStripe } from '@/lib/stripe';
import type { User } from '@/types/database';
import {
  STANDARD_ONBOARDING_FEE_PER_UNIT_CENTS,
  STANDARD_MONTHLY_PER_UNIT_CENTS,
  STANDARD_QUARTERLY_PER_UNIT_CENTS,
  PLACEMENT_ONLY_PER_UNIT_CENTS,
  PORTFOLIO_AUDIT_PER_UNIT_CENTS,
  PORTFOLIO_MONTHLY_PER_UNIT_CENTS,
  PORTFOLIO_QUARTERLY_PER_UNIT_CENTS,
  ELITE_ADDON_HOURLY_CENTS,
  type OnboardingTier,
  type OnboardingBillingOption,
  type PortfolioServiceModel,
} from '@/lib/landlord-onboarding-pricing';

/**
 * Landlord onboarding-fee billing — rebuilt in-app after the old rental911.net
 * checkout pages' backend went offline. Three tiers, confirmed pricing (all
 * per-unit except the flat Elite Asset add-on deposit):
 *
 *   standard        — $595/unit Tenant Placement Plus (one-time, non-refundable)
 *                      + $185/unit/mo or $555/unit/qtr subscription
 *   placement_only   — $875/unit flat, no subscription
 *   portfolio        — $250/unit Portfolio Audit (one-time)
 *                      + $95/unit/mo (Rental911 collects rent) or
 *                        $285/unit/qtr (landlord collects own rent) subscription
 *
 * Elite Asset add-ons: $135/hr, one-time 1-hr deposit per selected service,
 * same across all three tiers. Metering beyond the deposit is out of scope —
 * tracked/billed manually.
 *
 * Pricing constants live in `lib/landlord-onboarding-pricing.ts` (no
 * server-only imports) so client components can use them directly without
 * pulling the `stripe` package into the browser bundle.
 */

export {
  STANDARD_ONBOARDING_FEE_PER_UNIT_CENTS,
  STANDARD_MONTHLY_PER_UNIT_CENTS,
  STANDARD_QUARTERLY_PER_UNIT_CENTS,
  PLACEMENT_ONLY_PER_UNIT_CENTS,
  PORTFOLIO_AUDIT_PER_UNIT_CENTS,
  PORTFOLIO_MONTHLY_PER_UNIT_CENTS,
  PORTFOLIO_QUARTERLY_PER_UNIT_CENTS,
  ELITE_ADDON_HOURLY_CENTS,
};
export type { OnboardingTier, OnboardingBillingOption, PortfolioServiceModel };

export interface OnboardingCheckoutParams {
  tier: OnboardingTier;
  billingOption: OnboardingBillingOption | null; // null for placement_only
  portfolioServiceModel: PortfolioServiceModel | null; // portfolio tier only
  totalUnits: number;
  eliteAddonServices: string[];
  activateNow: boolean; // ignored for placement_only (no subscription to activate)
}

function eliteLineItems(services: string[]): Stripe.Checkout.SessionCreateParams.LineItem[] {
  return services.map((service) => ({
    price_data: {
      currency: 'usd',
      product_data: { name: `Elite Asset — ${service} (1-hr deposit)` },
      unit_amount: ELITE_ADDON_HOURLY_CENTS,
    },
    quantity: 1,
  }));
}

/**
 * Creates the Stripe Checkout Session for a landlord's onboarding-fee payment.
 * `placement_only` is a plain one-time charge (mode: 'payment'); `standard`
 * and `portfolio` create a real Stripe Subscription (mode: 'subscription') —
 * the first Subscription object this app has ever created — alongside the
 * one-time signing/audit fee as a non-recurring line item on the same
 * Checkout Session (Stripe adds non-recurring items to the first invoice).
 *
 * Also creates (or reuses) the landlord's Stripe Customer — `stripe_customer_id`
 * exists on `users` but has never actually been populated before this.
 */
export async function createOnboardingCheckoutSession(
  landlord: Pick<User, 'id' | 'email' | 'full_name' | 'stripe_customer_id'>,
  params: OnboardingCheckoutParams,
  paymentId: string
): Promise<Stripe.Checkout.Session> {
  const stripe = getStripe();
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://rental911-app.vercel.app';

  const customerId =
    landlord.stripe_customer_id ??
    (
      await stripe.customers.create({
        email: landlord.email,
        name: landlord.full_name ?? undefined,
      })
    ).id;

  const metadata = {
    rental911_landlord_onboarding_payment_id: paymentId,
    rental911_landlord_id: landlord.id,
  };
  const success_url = `${siteUrl}/landlord/onboarding?onboarding_fee=success`;
  const cancel_url = `${siteUrl}/landlord/onboarding?onboarding_fee=cancelled`;

  const eliteItems = eliteLineItems(params.eliteAddonServices);

  if (params.tier === 'placement_only') {
    return stripe.checkout.sessions.create({
      mode: 'payment',
      customer: customerId,
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: { name: 'Rental911 Tenant Placement Only' },
            unit_amount: PLACEMENT_ONLY_PER_UNIT_CENTS,
          },
          quantity: params.totalUnits,
        },
        ...eliteItems,
      ],
      metadata,
      success_url,
      cancel_url,
    });
  }

  const isStandard = params.tier === 'standard';
  const onboardingFeeUnitCents = isStandard
    ? STANDARD_ONBOARDING_FEE_PER_UNIT_CENTS
    : PORTFOLIO_AUDIT_PER_UNIT_CENTS;
  const onboardingFeeName = isStandard
    ? 'Rental911 Tenant Placement Plus (non-refundable)'
    : 'Rental911 Portfolio Audit';

  const isQuarterly = isStandard
    ? params.billingOption === 'quarterly'
    : params.portfolioServiceModel === 'external_system';
  const recurringUnitCents = isStandard
    ? isQuarterly
      ? STANDARD_QUARTERLY_PER_UNIT_CENTS
      : STANDARD_MONTHLY_PER_UNIT_CENTS
    : isQuarterly
      ? PORTFOLIO_QUARTERLY_PER_UNIT_CENTS
      : PORTFOLIO_MONTHLY_PER_UNIT_CENTS;
  const recurringName = isStandard
    ? `Rental911 Landlord Rescue — ${isQuarterly ? 'quarterly' : 'monthly'} subscription`
    : `Rental911 Portfolio Investor — ${isQuarterly ? 'external system, quarterly oversight' : 'Rental911 portal, monthly'} subscription`;

  return stripe.checkout.sessions.create({
    mode: 'subscription',
    customer: customerId,
    line_items: [
      {
        price_data: {
          currency: 'usd',
          product_data: { name: onboardingFeeName },
          unit_amount: onboardingFeeUnitCents,
        },
        quantity: params.totalUnits,
      },
      {
        price_data: {
          currency: 'usd',
          product_data: { name: recurringName },
          unit_amount: recurringUnitCents,
          recurring: { interval: 'month', interval_count: isQuarterly ? 3 : 1 },
        },
        quantity: params.totalUnits,
      },
      ...eliteItems,
    ],
    subscription_data: params.activateNow ? undefined : { trial_period_days: 30 },
    metadata,
    success_url,
    cancel_url,
  });
}
