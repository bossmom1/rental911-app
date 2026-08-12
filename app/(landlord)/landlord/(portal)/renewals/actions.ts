'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase';
import { getCurrentUser } from '@/lib/auth';

type Result = { ok: boolean; error?: string };

async function landlord() {
  const current = await getCurrentUser();
  if (current?.profile?.role !== 'landlord') throw new Error('Not authorized');
  return current.profile;
}

/** Create a lease_renewals draft record + redirect to the review page. */
export async function initiateRenewal(
  leaseId: string,
  formData: FormData
): Promise<Result> {
  try {
    const me = await landlord();
    const supabase = createSupabaseServerClient(cookies());

    // Verify the lease belongs to this landlord
    const { data: lease } = await supabase
      .from('leases')
      .select('id')
      .eq('id', leaseId)
      .eq('landlord_id', me.id)
      .single();
    if (!lease) return { ok: false, error: 'Lease not found' };

    const newEndDate = String(formData.get('new_end_date') || '');
    const newMonthlyRent = Number(formData.get('new_monthly_rent') || 0);
    if (!newEndDate || !newMonthlyRent) {
      return { ok: false, error: 'End date and rent are required' };
    }

    const { data: renewal, error } = await supabase
      .from('lease_renewals')
      .insert({
        lease_id: leaseId,
        landlord_id: me.id,
        new_end_date: newEndDate,
        new_monthly_rent: newMonthlyRent,
        status: 'draft_review',
      })
      .select('id')
      .single();

    if (error) return { ok: false, error: error.message };

    revalidatePath('/landlord/renewals');
    redirect(`/landlord/renewals/${renewal.id}`);
  } catch (e: any) {
    if (e?.digest?.startsWith('NEXT_REDIRECT')) throw e;
    return { ok: false, error: e.message };
  }
}

/** Mark lease as month-to-month — no renewal record needed. */
export async function setMonthToMonth(
  leaseId: string,
  formData: FormData
): Promise<Result> {
  try {
    const me = await landlord();
    const supabase = createSupabaseServerClient(cookies());
    const note = String(formData.get('note') || '').trim() || null;

    const { error } = await supabase
      .from('leases')
      .update({ is_month_to_month: true, month_to_month_note: note })
      .eq('id', leaseId)
      .eq('landlord_id', me.id);

    if (error) return { ok: false, error: error.message };
    revalidatePath('/landlord/renewals');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/** Begin turnover: create move_out_checklist, mark unit for turnover (after lease ends). */
export async function beginTurnover(leaseId: string): Promise<Result> {
  try {
    const me = await landlord();
    const supabase = createSupabaseServerClient(cookies());

    const { data: lease } = await supabase
      .from('leases')
      .select('id, unit_id')
      .eq('id', leaseId)
      .eq('landlord_id', me.id)
      .single();
    if (!lease) return { ok: false, error: 'Lease not found' };

    const { error } = await supabase
      .from('move_out_checklists')
      .insert({
        lease_id: leaseId,
        unit_id: lease.unit_id,
        landlord_id: me.id,
      });

    if (error) return { ok: false, error: error.message };
    revalidatePath('/landlord/renewals');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/** Placeholder — send lease for signature (swappable for real e-sign API later). */
export async function sendLeaseForSignature(renewalId: string): Promise<Result> {
  try {
    const me = await landlord();
    const supabase = createSupabaseServerClient(cookies());

    // Mark as sent_to_tenant — in a real implementation this would call DocuSign/Dropbox Sign
    const { error } = await supabase
      .from('lease_renewals')
      .update({ status: 'sent_to_tenant', sent_to_tenant_at: new Date().toISOString() })
      .eq('id', renewalId)
      .eq('landlord_id', me.id);

    if (error) return { ok: false, error: error.message };

    // TODO: Replace this with real e-sign API call when ready
    // await realEsignProvider.sendForSignature({ renewalId, ... });
    console.log(`[renewal] Placeholder: lease ${renewalId} marked sent_to_tenant`);

    revalidatePath(`/landlord/renewals/${renewalId}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/** Mark lease as signed — finalize new lease record, expire old one. */
export async function markLeaseAsSigned(renewalId: string): Promise<Result> {
  try {
    const me = await landlord();
    const supabase = createSupabaseServerClient(cookies());

    const { data: renewal } = await supabase
      .from('lease_renewals')
      .select('id, lease_id, new_end_date, new_monthly_rent')
      .eq('id', renewalId)
      .eq('landlord_id', me.id)
      .single();
    if (!renewal) return { ok: false, error: 'Renewal not found' };

    // Get the original lease
    const { data: oldLease } = await supabase
      .from('leases')
      .select('unit_id, tenant_id, security_deposit')
      .eq('id', renewal.lease_id)
      .single();
    if (!oldLease) return { ok: false, error: 'Original lease not found' };

    // Create new active lease
    const { data: newLease, error: leaseError } = await supabase
      .from('leases')
      .insert({
        unit_id: oldLease.unit_id,
        tenant_id: oldLease.tenant_id,
        landlord_id: me.id,
        monthly_rent: renewal.new_monthly_rent,
        end_date: renewal.new_end_date,
        start_date: new Date().toISOString().slice(0, 10),
        security_deposit: oldLease.security_deposit,
        status: 'active',
        renewal_alert_sent: false,
        is_month_to_month: false,
      })
      .select('id')
      .single();
    if (leaseError) return { ok: false, error: leaseError.message };

    // Expire old lease; update renewal record
    await Promise.all([
      supabase.from('leases').update({ status: 'expired' }).eq('id', renewal.lease_id),
      supabase
        .from('lease_renewals')
        .update({
          status: 'signed',
          signed_at: new Date().toISOString(),
          new_lease_id: newLease.id,
        })
        .eq('id', renewalId),
    ]);

    revalidatePath('/landlord/renewals');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
