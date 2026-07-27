'use server';

import { createSupabaseAdminClient } from '@/lib/supabase';

export interface CheckoutPaymentSummary {
  status: string;
  tier: string;
  contactEmail: string;
  contactName: string;
  contactPhone: string;
}

/** Public — looks up a payment row by id for the post-payment success/account-creation page. */
export async function getCheckoutPaymentStatus(paymentId: string): Promise<CheckoutPaymentSummary | null> {
  const admin = createSupabaseAdminClient();
  const { data } = await admin
    .from('landlord_onboarding_payments')
    .select('status, tier, contact_email, contact_name, contact_phone, landlord_id')
    .eq('id', paymentId)
    .maybeSingle();
  if (!data) return null;
  return {
    status: data.status,
    tier: data.tier,
    contactEmail: data.contact_email ?? '',
    contactName: data.contact_name ?? '',
    contactPhone: data.contact_phone ?? '',
  };
}

/**
 * Links a just-created Supabase Auth account to its pre-signup payment.
 * Called right after `supabase.auth.signUp()` returns the new user's id —
 * before any session/cookie exists (email confirmation is still pending),
 * so this uses the service-role client. Guarded so a payment can only be
 * linked once, to a paid row with no existing landlord_id.
 */
export async function linkOnboardingPaymentToAccount(
  paymentId: string,
  userId: string
): Promise<{ ok: boolean; error?: string }> {
  const admin = createSupabaseAdminClient();

  const { data: payment, error: fetchError } = await admin
    .from('landlord_onboarding_payments')
    .select('status, landlord_id, stripe_customer_id, stripe_subscription_id')
    .eq('id', paymentId)
    .maybeSingle();
  if (fetchError) return { ok: false, error: fetchError.message };
  if (!payment || payment.status !== 'paid' || payment.landlord_id) {
    return { ok: false, error: 'This payment cannot be linked to an account.' };
  }

  const { error: linkError } = await admin
    .from('landlord_onboarding_payments')
    .update({ landlord_id: userId })
    .eq('id', paymentId)
    .eq('status', 'paid')
    .is('landlord_id', null);
  if (linkError) return { ok: false, error: linkError.message };

  const { error: userError } = await admin
    .from('users')
    .update({
      onboarding_fee_status: 'paid',
      stripe_customer_id: payment.stripe_customer_id,
      stripe_subscription_id: payment.stripe_subscription_id,
    })
    .eq('id', userId);
  if (userError) return { ok: false, error: userError.message };

  return { ok: true };
}
