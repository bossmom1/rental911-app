import { createSupabaseAdminClient } from '@/lib/supabase';
import { createGhlContact, sendEmail, addContactTag, GHL_ONBOARDING_CALENDAR_EMBED } from '@/lib/ghl';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://rental911.net';

/**
 * Fires right after the $95/mo subscription activates (end of the Membership
 * checkout flow). Sends the post-payment onboarding email with the intake-
 * form link. Non-blocking by convention (same as the rest of lib/ghl.ts) —
 * failures are logged, never thrown, so a GHL hiccup can't break checkout.
 */
export async function sendMembershipOnboardingEmail(paymentId: string): Promise<void> {
  try {
    const admin = createSupabaseAdminClient();
    const { data: payment } = await admin
      .from('landlord_onboarding_payments')
      .select('intake_token, intake_email_sent_at, contact_email, contact_name, contact_phone')
      .eq('id', paymentId)
      .single();
    if (!payment || payment.intake_email_sent_at) return; // already sent — don't duplicate
    if (!payment.contact_email) return;

    const contact = await createGhlContact({
      name: payment.contact_name,
      email: payment.contact_email,
      phone: payment.contact_phone,
      role: 'landlord',
      tags: ['membership'],
    });
    if (!contact.ok || !contact.contactId) return;

    const intakeUrl = `${APP_URL}/onboarding/membership/${payment.intake_token}`;
    const html = `
      <p>Welcome to the DIY Landlord Membership!</p>
      <p>Before your first live Q&amp;A, I'd like to take a quick look at your lease and a
      few details so I can prep for your kickoff call — it takes about 5 minutes.</p>
      <p><a href="${intakeUrl}">Start here &rarr;</a></p>
      <p>It starts with a conversation.<br/>&mdash; Christine</p>
    `;
    const sent = await sendEmail(contact.contactId, 'Welcome to Rental911 Membership — next step', html);
    if (sent) {
      await admin
        .from('landlord_onboarding_payments')
        .update({ intake_email_sent_at: new Date().toISOString() })
        .eq('id', paymentId);
    }
  } catch (err) {
    console.error('[membership-onboarding] sendMembershipOnboardingEmail failed (non-blocking):', err);
  }
}

/**
 * Called once the Member finishes the intake form + the kickoff-call booking
 * step on the public /onboarding/membership/[token] page. Provisions the
 * actual portal account (none exists before this — membership-checkout.ts
 * only charges Stripe, same gap documented in migration 0028's header).
 *
 * access_level stays 'limited' until Christine manually grants full access —
 * same convention as the Subscription Step-8/Step-9 flow (completeOnboarding
 * in app/(landlord)/landlord/onboarding/actions.ts) — the lease review and
 * kickoff call haven't happened yet at this point, just been scheduled.
 */
export async function provisionMembershipAccount(
  paymentId: string
): Promise<{ ok: boolean; error?: string }> {
  const admin = createSupabaseAdminClient();

  const { data: payment, error: fetchErr } = await admin
    .from('landlord_onboarding_payments')
    .select('landlord_id, contact_email, contact_name, contact_phone, stripe_customer_id, stripe_subscription_id')
    .eq('id', paymentId)
    .single();
  if (fetchErr || !payment) return { ok: false, error: 'Payment record not found.' };
  if (payment.landlord_id) return { ok: true }; // already provisioned — idempotent

  const email = (payment.contact_email ?? '').trim().toLowerCase();
  if (!email) return { ok: false, error: 'No contact email on file for this payment.' };

  // Same invite-then-fallback-create pattern as saveTenant() in the
  // Subscription onboarding wizard (app/(landlord)/landlord/onboarding/actions.ts).
  let userId: string | undefined;
  const invite = await admin.auth.admin.inviteUserByEmail(email, {
    data: { role: 'landlord', plan_type: 'membership', full_name: payment.contact_name, phone: payment.contact_phone },
  });
  userId = invite.data?.user?.id;
  if (invite.error || !userId) {
    const created = await admin.auth.admin.createUser({
      email,
      email_confirm: true,
      password: crypto.randomUUID(),
      user_metadata: { role: 'landlord', plan_type: 'membership', full_name: payment.contact_name, phone: payment.contact_phone },
    });
    if (created.error || !created.data.user) {
      return { ok: false, error: created.error?.message || 'Could not create the Member account.' };
    }
    userId = created.data.user.id;
  }

  const { error: updateErr } = await admin
    .from('users')
    .update({
      full_name: payment.contact_name,
      phone: payment.contact_phone,
      role: 'landlord',
      plan_type: 'membership',
      onboarding_complete: true,
      access_level: 'limited',
      stripe_customer_id: payment.stripe_customer_id,
      stripe_subscription_id: payment.stripe_subscription_id,
      subscription_status: 'active',
    })
    .eq('id', userId);
  if (updateErr) return { ok: false, error: updateErr.message };

  await admin.from('landlord_onboarding_payments').update({ landlord_id: userId }).eq('id', paymentId);

  if (payment.stripe_customer_id) {
    void addContactTag(payment.stripe_customer_id, 'onboarded-member');
  }

  return { ok: true };
}

export { GHL_ONBOARDING_CALENDAR_EMBED };
