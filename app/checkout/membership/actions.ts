'use server';

import { createSupabaseAdminClient } from '@/lib/supabase';
import { chargeMembershipSetupFee, activateMembershipSubscription } from '@/lib/membership-checkout';
import { MEMBERSHIP_SETUP_FEE_CENTS, MEMBERSHIP_MONTHLY_CENTS } from '@/lib/membership-pricing';

export interface MembershipContactInput {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  propertyDetails: string;
}

type ActionResult<T = {}> = ({ ok: true } & T) | { ok: false; error: string };

function validateContact(contact: MembershipContactInput): string | null {
  if (!contact.firstName.trim() || !contact.lastName.trim()) return 'Please enter your first and last name.';
  if (!contact.email.trim() || !contact.email.includes('@')) return 'Please enter a valid email address.';
  if (!contact.phone.trim()) return 'Please enter a phone number.';
  return null;
}

/**
 * Step 1 — inserts the ledger row (tier='membership', landlord_id null until
 * post-payment account linking) and charges the $297 setup fee. Reuses
 * landlord_onboarding_payments (see migration 0027) rather than a new table —
 * total_units stays 1, billing_option/portfolio_service_model stay null,
 * exactly like placement_only rows already leave columns unused.
 */
export async function submitMembershipCheckout(
  contact: MembershipContactInput,
  paymentMethodId: string
): Promise<
  ActionResult<{
    paymentId: string;
    customerId: string;
    status: string;
    requiresAction: boolean;
    clientSecret: string | null;
  }>
> {
  const contactError = validateContact(contact);
  if (contactError) return { ok: false, error: contactError };

  const admin = createSupabaseAdminClient();

  const { data: payment, error: insertError } = await admin
    .from('landlord_onboarding_payments')
    .insert({
      landlord_id: null,
      tier: 'membership',
      billing_option: null,
      portfolio_service_model: null,
      total_units: 1,
      onboarding_fee_cents: MEMBERSHIP_SETUP_FEE_CENTS,
      subscription_unit_price_cents: MEMBERSHIP_MONTHLY_CENTS,
      elite_addon_services: [],
      elite_addon_total_cents: 0,
      activate_now: true,
      amount_charged_today_cents: MEMBERSHIP_SETUP_FEE_CENTS,
      contact_email: contact.email.trim(),
      contact_name: `${contact.firstName.trim()} ${contact.lastName.trim()}`.trim(),
      contact_phone: contact.phone.trim(),
    })
    .select('id')
    .single();
  if (insertError || !payment) {
    return { ok: false, error: insertError?.message || 'Could not create the payment record.' };
  }

  const charge = await chargeMembershipSetupFee(
    { email: contact.email.trim(), full_name: `${contact.firstName.trim()} ${contact.lastName.trim()}`.trim(), stripe_customer_id: null },
    payment.id,
    paymentMethodId
  );
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
  };
}

/** Step 2 — called after the $297 setup-fee charge is fully resolved. */
export async function activateMembershipSubscriptionAction(
  paymentId: string,
  customerId: string,
  paymentMethodId: string
): Promise<ActionResult<{ status: string; requiresAction: boolean; clientSecret: string | null }>> {
  const result = await activateMembershipSubscription(customerId, paymentId, paymentMethodId);
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
