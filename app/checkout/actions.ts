'use server';

import { createSupabaseAdminClient } from '@/lib/supabase';
import {
  chargeOnboardingOneTime,
  activateOnboardingSubscription,
  type OnboardingCheckoutParams,
  type OnboardingBillingContact,
} from '@/lib/landlord-onboarding';
import { computeOnboardingAmounts } from '@/lib/landlord-onboarding-pricing';
import type { LandlordOnboardingTier } from '@/types/database';

/**
 * Shared server actions for the public, pre-signup checkout pages
 * (`app/checkout/landlord`, `/investor`, `/placement-only`) — literal
 * rebuilds of the old rental911.net pages using an inline Stripe Card
 * Element. No session exists yet, so every DB write here uses the
 * service-role client, same pattern as `app/vendor/confirm/[id]`.
 *
 * Two Stripe objects, not one bundled Checkout Session: the one-time portion
 * (signing/audit/placement fee + Elite add-ons) is always its own directly
 * confirmed PaymentIntent; Standard/Portfolio additionally get a separate
 * Subscription. The DB write that marks a payment row 'paid' happens only in
 * the webhook (`payment_intent.succeeded`), not here — these actions return
 * status for the client to resolve any `requires_action` (3D Secure) itself.
 */

export interface CheckoutContactInput {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  propertyDetails: string;
}

type ActionResult<T = {}> = ({ ok: true } & T) | { ok: false; error: string };

function validateContact(contact: CheckoutContactInput): string | null {
  if (!contact.firstName.trim() || !contact.lastName.trim()) return 'Please enter your first and last name.';
  if (!contact.email.trim() || !contact.email.includes('@')) return 'Please enter a valid email address.';
  if (!contact.phone.trim()) return 'Please enter a phone number.';
  return null;
}

/**
 * Inserts the ledger row (landlord_id null — linked to an account after
 * signup, post-payment) and charges the one-time portion. Shared by all
 * three tier pages; each page's own actions.ts calls this with its tier.
 */
export async function submitOnboardingCheckout(
  tier: LandlordOnboardingTier,
  contact: CheckoutContactInput,
  params: OnboardingCheckoutParams,
  paymentMethodId: string
): Promise<
  ActionResult<{
    paymentId: string;
    customerId: string;
    status: string;
    requiresAction: boolean;
    clientSecret: string | null;
    needsSubscription: boolean;
  }>
> {
  const contactError = validateContact(contact);
  if (contactError) return { ok: false, error: contactError };

  const admin = createSupabaseAdminClient();
  const amounts = computeOnboardingAmounts({
    tier: params.tier,
    billingOption: params.billingOption,
    portfolioServiceModel: params.portfolioServiceModel,
    totalUnits: params.totalUnits,
    eliteAddonServices: params.eliteAddonServices,
  });

  // TEMPORARY — REMOVE AFTER LIVE VERIFICATION (see task tracker). Requires
  // BOTH a server-only env var AND the submitted contact email to match an
  // exact pre-agreed value — ordinary checkout traffic can never trigger
  // this regardless of whether the env var happens to be set.
  const verifyEmail = process.env.LIVE_CHECKOUT_VERIFY_EMAIL;
  const isVerifyOverride =
    process.env.LIVE_CHECKOUT_VERIFY_MODE === 'on' &&
    !!verifyEmail &&
    contact.email.trim().toLowerCase() === verifyEmail.toLowerCase();
  const verifyOverrideCents = isVerifyOverride ? 100 : undefined;
  const chargedTodayCents = verifyOverrideCents ?? amounts.oneTimeTotalCents;

  const { data: payment, error: insertError } = await admin
    .from('landlord_onboarding_payments')
    .insert({
      landlord_id: null,
      tier,
      billing_option: tier === 'placement_only' ? null : (amounts.isQuarterly ? 'quarterly' : 'monthly'),
      portfolio_service_model: tier === 'portfolio' ? params.portfolioServiceModel : null,
      total_units: amounts.units,
      onboarding_fee_cents: amounts.onboardingFeeCents,
      subscription_unit_price_cents: tier === 'placement_only' ? null : amounts.recurringUnitCents,
      elite_addon_services: amounts.eliteAddonServices,
      elite_addon_total_cents: amounts.eliteAddonTotalCents,
      activate_now: tier === 'placement_only' ? false : params.activateNow,
      amount_charged_today_cents: chargedTodayCents,
      contact_email: contact.email.trim(),
      contact_name: `${contact.firstName.trim()} ${contact.lastName.trim()}`.trim(),
      contact_phone: contact.phone.trim(),
    })
    .select('id')
    .single();
  if (insertError || !payment) {
    return { ok: false, error: insertError?.message || 'Could not create the payment record.' };
  }

  const contactBilling: OnboardingBillingContact = {
    id: null,
    email: contact.email.trim(),
    full_name: `${contact.firstName.trim()} ${contact.lastName.trim()}`.trim(),
    stripe_customer_id: null,
  };

  const charge = await chargeOnboardingOneTime(contactBilling, params, payment.id, paymentMethodId, verifyOverrideCents);
  if (!charge.ok) return { ok: false, error: charge.error };

  if (charge.customerId) {
    await admin
      .from('landlord_onboarding_payments')
      .update({ stripe_customer_id: charge.customerId })
      .eq('id', payment.id);
  }

  return {
    ok: true,
    paymentId: payment.id,
    customerId: charge.customerId ?? '',
    status: charge.status,
    requiresAction: charge.requiresAction,
    clientSecret: charge.clientSecret,
    needsSubscription: tier !== 'placement_only',
  };
}

/** Second step for Standard/Portfolio — called after the one-time charge is fully resolved. */
export async function activateSubscription(
  paymentId: string,
  customerId: string,
  params: OnboardingCheckoutParams,
  paymentMethodId: string
): Promise<ActionResult<{ status: string; requiresAction: boolean; clientSecret: string | null }>> {
  const result = await activateOnboardingSubscription(customerId, params, paymentId, paymentMethodId);
  if (!result.ok) return { ok: false, error: result.error };

  if (result.subscriptionId) {
    const admin = createSupabaseAdminClient();
    await admin
      .from('landlord_onboarding_payments')
      .update({ stripe_subscription_id: result.subscriptionId })
      .eq('id', paymentId);
  }

  return {
    ok: true,
    status: result.status,
    requiresAction: result.requiresAction,
    clientSecret: result.clientSecret,
  };
}
