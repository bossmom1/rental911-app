import type Stripe from 'stripe';
import { getStripe } from '@/lib/stripe';
import {
  STANDARD_ONBOARDING_FEE_PER_UNIT_CENTS,
  STANDARD_MONTHLY_PER_UNIT_CENTS,
  STANDARD_QUARTERLY_PER_UNIT_CENTS,
  PLACEMENT_ONLY_PER_UNIT_CENTS,
  PORTFOLIO_AUDIT_PER_UNIT_CENTS,
  PORTFOLIO_MONTHLY_PER_UNIT_CENTS,
  PORTFOLIO_QUARTERLY_PER_UNIT_CENTS,
  ELITE_ADDON_HOURLY_CENTS,
  computeOnboardingAmounts,
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

/**
 * Billing contact for the Checkout Session — a real landlord (authenticated
 * in-wizard flow, `id` set) or a not-yet-signed-up visitor (public pre-signup
 * checkout, `id` null). Only when `id` is set does the session get tagged
 * with `rental911_landlord_id`; the webhook always resolves the payment row
 * via `rental911_landlord_onboarding_payment_id` alone, so this doesn't
 * weaken idempotency — it just makes the landlord-id tag optional.
 */
export interface OnboardingBillingContact {
  id: string | null;
  email: string;
  full_name: string | null;
  stripe_customer_id: string | null;
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
  landlord: OnboardingBillingContact,
  params: OnboardingCheckoutParams,
  paymentId: string,
  returnUrls: { success_url: string; cancel_url: string }
): Promise<Stripe.Checkout.Session> {
  const stripe = getStripe();

  const customerId =
    landlord.stripe_customer_id ??
    (
      await stripe.customers.create({
        email: landlord.email,
        name: landlord.full_name ?? undefined,
      })
    ).id;

  const metadata: Record<string, string> = {
    rental911_landlord_onboarding_payment_id: paymentId,
  };
  if (landlord.id) metadata.rental911_landlord_id = landlord.id;
  const { success_url, cancel_url } = returnUrls;

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

export type OnboardingChargeResult =
  | { ok: true; status: string; requiresAction: boolean; clientSecret: string | null }
  | { ok: false; error: string };

/**
 * Public checkout pages (inline Card Element, literal rebuild of the old
 * rental911.net pages) — no hosted Checkout Session. The one-time portion
 * (signing/audit/placement fee + Elite add-ons) is always its own directly
 * confirmed PaymentIntent, charged today unconditionally regardless of the
 * activate-now toggle (that toggle only affects the separate subscription
 * step below). Mirrors the tenant rent flow's create->confirm pattern
 * (`app/(tenant)/tenant/rent/actions.ts`): returns status for the client to
 * resolve any `requires_action` (3D Secure) itself — the DB write happens in
 * the webhook on `payment_intent.succeeded`, not here.
 */
export async function chargeOnboardingOneTime(
  contact: OnboardingBillingContact,
  params: OnboardingCheckoutParams,
  paymentId: string,
  paymentMethodId: string
): Promise<OnboardingChargeResult & { customerId?: string }> {
  const stripe = getStripe();

  try {
    const customerId =
      contact.stripe_customer_id ??
      (
        await stripe.customers.create({
          email: contact.email,
          name: contact.full_name ?? undefined,
        })
      ).id;

    await stripe.paymentMethods.attach(paymentMethodId, { customer: customerId });
    await stripe.customers.update(customerId, {
      invoice_settings: { default_payment_method: paymentMethodId },
    });

    const amounts = computeOnboardingAmounts({
      tier: params.tier,
      billingOption: params.billingOption,
      portfolioServiceModel: params.portfolioServiceModel,
      totalUnits: params.totalUnits,
      eliteAddonServices: params.eliteAddonServices,
    });

    const metadata: Record<string, string> = { rental911_landlord_onboarding_payment_id: paymentId };
    if (contact.id) metadata.rental911_landlord_id = contact.id;

    const intent = await stripe.paymentIntents.create({
      amount: amounts.oneTimeTotalCents,
      currency: 'usd',
      customer: customerId,
      payment_method: paymentMethodId,
      confirm: true,
      automatic_payment_methods: { enabled: true, allow_redirects: 'never' },
      description: `${amounts.onboardingFeeName}${amounts.eliteAddonServices.length ? ' + Elite Asset Services' : ''}`,
      receipt_email: contact.email,
      metadata,
    });

    return {
      ok: true,
      status: intent.status,
      requiresAction: intent.status === 'requires_action',
      clientSecret: intent.client_secret,
      customerId,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Stripe request failed.';
    console.error('[landlord-onboarding/one-time] failed:', message);
    return { ok: false, error: message };
  }
}

/**
 * The recurring portion (Standard/Portfolio only) — a separate Stripe object
 * from the one-time charge above, using the same already-attached payment
 * method. `activateNow` charges its first invoice today (`default_incomplete`
 * + confirm); otherwise a 30-day trial defers it, matching the same toggle
 * semantics as the in-wizard Checkout-based flow.
 */
export async function activateOnboardingSubscription(
  customerId: string,
  params: OnboardingCheckoutParams,
  paymentId: string,
  paymentMethodId: string
): Promise<OnboardingChargeResult & { subscriptionId?: string }> {
  const stripe = getStripe();

  try {
    const amounts = computeOnboardingAmounts({
      tier: params.tier,
      billingOption: params.billingOption,
      portfolioServiceModel: params.portfolioServiceModel,
      totalUnits: params.totalUnits,
      eliteAddonServices: params.eliteAddonServices,
    });

    // Unlike Checkout Sessions, stripe.subscriptions.create's items[].price_data
    // requires a real Price object (no inline product_data) — create one
    // (with an inline throwaway Product via prices.create, which DOES support
    // that) rather than referencing any pre-existing catalog Price/Product.
    const price = await stripe.prices.create({
      currency: 'usd',
      unit_amount: amounts.recurringUnitCents,
      recurring: { interval: 'month', interval_count: amounts.isQuarterly ? 3 : 1 },
      product_data: { name: amounts.recurringName },
    });

    const subscription = await stripe.subscriptions.create({
      customer: customerId,
      items: [{ price: price.id, quantity: amounts.units }],
      default_payment_method: paymentMethodId,
      metadata: { rental911_landlord_onboarding_payment_id: paymentId },
      ...(params.activateNow
        ? { payment_behavior: 'default_incomplete' as const, expand: ['latest_invoice.payment_intent'] }
        : { trial_period_days: 30 }),
    });

    if (params.activateNow) {
      const invoice = subscription.latest_invoice as Stripe.Invoice | null;
      let intent = invoice?.payment_intent as Stripe.PaymentIntent | null | undefined;

      // payment_behavior: 'default_incomplete' creates the first invoice's
      // PaymentIntent in 'requires_confirmation' — setting default_payment_method
      // on the subscription does NOT auto-confirm it (verified against a real
      // test-mode run; the earlier assumption that it would was wrong). Confirm
      // explicitly, same as chargeOnboardingOneTime's one-time charge.
      if (intent && intent.status === 'requires_confirmation') {
        intent = await stripe.paymentIntents.confirm(intent.id, { payment_method: paymentMethodId });
      }

      return {
        ok: true,
        status: intent?.status ?? subscription.status,
        requiresAction: intent?.status === 'requires_action',
        clientSecret: intent?.client_secret ?? null,
        subscriptionId: subscription.id,
      };
    }

    return {
      ok: true,
      status: subscription.status,
      requiresAction: false,
      clientSecret: null,
      subscriptionId: subscription.id,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Stripe request failed.';
    console.error('[landlord-onboarding/subscription] failed:', message);
    return { ok: false, error: message };
  }
}
