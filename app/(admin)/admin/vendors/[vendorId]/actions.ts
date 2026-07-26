'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '@/lib/supabase';
import { getCurrentUser } from '@/lib/auth';
import { createMembershipCheckoutSession } from '@/lib/vendor-membership';

type Result = { ok: boolean; error?: string; checkoutUrl?: string };

/**
 * Admin generates a one-time Stripe Checkout Session for this vendor's next
 * quarterly membership charge. Inserts the ledger row first so its id can be
 * tagged into the session's metadata (the webhook resolves the row from that
 * metadata, not by matching the charge amount).
 */
export async function generateMembershipInvoice(vendorId: string): Promise<Result> {
  const current = await getCurrentUser();
  if (current?.profile?.role !== 'admin') return { ok: false, error: 'Not authorized' };

  const supabase = createSupabaseServerClient(cookies());
  const { data: vendor } = await supabase
    .from('vendors')
    .select('id, name, membership_status')
    .eq('id', vendorId)
    .maybeSingle();
  if (!vendor) return { ok: false, error: 'Vendor not found.' };

  const periodStart = new Date();
  const periodEnd = new Date(periodStart);
  periodEnd.setUTCMonth(periodEnd.getUTCMonth() + 3);
  const toDateStr = (d: Date) => d.toISOString().slice(0, 10);

  const { data: payment, error: insertError } = await supabase
    .from('vendor_membership_payments')
    .insert({
      vendor_id: vendorId,
      period_start: toDateStr(periodStart),
      period_end: toDateStr(periodEnd),
    })
    .select('id')
    .single();
  if (insertError || !payment) {
    return { ok: false, error: insertError?.message || 'Could not create the payment record.' };
  }

  let session;
  try {
    session = await createMembershipCheckoutSession({ id: vendor.id, name: vendor.name }, payment.id);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Could not create Stripe Checkout session.' };
  }
  if (!session.url) return { ok: false, error: 'Stripe did not return a Checkout URL.' };

  const { error: updateError } = await supabase
    .from('vendor_membership_payments')
    .update({ stripe_checkout_session_id: session.id })
    .eq('id', payment.id);
  if (updateError) return { ok: false, error: updateError.message };

  // A renewal for an already-active vendor stays 'active' while the new
  // invoice is pending, so an unused/expired link has nothing to revert.
  if (vendor.membership_status !== 'active') {
    await supabase.from('vendors').update({ membership_status: 'pending_payment' }).eq('id', vendorId);
  }

  revalidatePath(`/admin/vendors/${vendorId}`);
  revalidatePath('/admin/vendors');
  return { ok: true, checkoutUrl: session.url };
}
