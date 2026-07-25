'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '@/lib/supabase';
import { getCurrentUser } from '@/lib/auth';
import { renderLeasePdf } from '@/lib/lease-pdf';
import { sendLeaseForSignature } from '@/lib/esignature';
import { fmtDate } from '@/lib/format';

type Result = { ok: boolean; error?: string };

async function landlord() {
  const current = await getCurrentUser();
  if (current?.profile?.role !== 'landlord') throw new Error('Not authorized');
  return current.profile;
}

/** Option A, step 1 — creates a draft renewal (status='draft_review'). */
export async function startRenewalDraft(leaseId: string, formData: FormData): Promise<Result> {
  try {
    const me = await landlord();
    const supabase = createSupabaseServerClient(cookies());
    const newEndDate = String(formData.get('new_end_date') || '');
    const newMonthlyRent = Number(formData.get('new_monthly_rent') || 0);
    if (!newEndDate || !newMonthlyRent) {
      return { ok: false, error: 'New end date and monthly rent are required.' };
    }

    const { error } = await supabase.from('lease_renewals').insert({
      lease_id: leaseId,
      landlord_id: me.id,
      new_end_date: newEndDate,
      new_monthly_rent: newMonthlyRent,
      status: 'draft_review',
    });
    if (error) return { ok: false, error: error.message };
    revalidatePath(`/landlord/tenants/${leaseId}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/** Option A, step 2 — landlord approves the draft: renders the lease PDF and
 *  emails the tenant a copy to sign outside the app (placeholder, swappable
 *  via lib/esignature.ts). No auto-send before this point. */
export async function approveRenewalDraft(renewalId: string, leaseId: string): Promise<Result> {
  try {
    await landlord();
    const supabase = createSupabaseServerClient(cookies());

    const { data: renewal, error: rErr } = await supabase
      .from('lease_renewals')
      .select(
        `id, new_end_date, new_monthly_rent,
         lease:leases (
           id, start_date, security_deposit,
           tenant:users!leases_tenant_id_fkey(full_name, email),
           landlord:users!leases_landlord_id_fkey(full_name),
           unit:units(unit_number, property:properties(name, address))
         )`
      )
      .eq('id', renewalId)
      .single();
    if (rErr || !renewal) return { ok: false, error: rErr?.message || 'Renewal not found.' };

    const lease = (renewal as any).lease;
    const tenant = lease?.tenant;
    const landlordProfile = lease?.landlord;
    const unit = lease?.unit;
    const property = unit?.property;

    const pdfBuffer = await renderLeasePdf({
      tenantName: tenant?.full_name || 'Tenant',
      landlordName: landlordProfile?.full_name || 'Landlord',
      propertyAddress: property?.address || property?.name || 'Property',
      unitLabel: unit?.unit_number ? `Unit ${unit.unit_number}` : 'Unit',
      startDate: fmtDate(lease?.start_date),
      endDate: fmtDate(renewal.new_end_date),
      monthlyRent: Number(renewal.new_monthly_rent ?? 0),
      securityDeposit: Number(lease?.security_deposit ?? 0),
      generatedDate: fmtDate(new Date().toISOString().slice(0, 10)),
    });

    if (tenant?.email) {
      await sendLeaseForSignature({
        to: tenant.email,
        tenantName: tenant.full_name || 'Tenant',
        propertyName: property?.name || property?.address || 'your property',
        pdfBuffer,
        pdfFileName: `lease-renewal-${leaseId}.pdf`,
      });
    }

    const { error: updErr } = await supabase
      .from('lease_renewals')
      .update({ status: 'sent_to_tenant', sent_to_tenant_at: new Date().toISOString() })
      .eq('id', renewalId);
    if (updErr) return { ok: false, error: updErr.message };

    revalidatePath(`/landlord/tenants/${leaseId}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/** Option A, step 3 — landlord confirms the tenant signed outside the app:
 *  creates the new active lease, expires the old one, records the signed
 *  copy in documents. `input` is the already-uploaded (Storage) file. */
export async function markRenewalSigned(
  renewalId: string,
  leaseId: string,
  input: { file_name: string; file_url: string }
): Promise<Result> {
  try {
    const me = await landlord();
    const supabase = createSupabaseServerClient(cookies());

    const { data: renewal, error: rErr } = await supabase
      .from('lease_renewals')
      .select('id, new_end_date, new_monthly_rent, lease_id')
      .eq('id', renewalId)
      .single();
    if (rErr || !renewal) return { ok: false, error: rErr?.message || 'Renewal not found.' };

    const { data: oldLease, error: oldErr } = await supabase
      .from('leases')
      .select('id, unit_id, tenant_id, landlord_id, security_deposit')
      .eq('id', renewal.lease_id)
      .single();
    if (oldErr || !oldLease) return { ok: false, error: oldErr?.message || 'Lease not found.' };

    const { data: newLease, error: newErr } = await supabase
      .from('leases')
      .insert({
        unit_id: oldLease.unit_id,
        tenant_id: oldLease.tenant_id,
        landlord_id: oldLease.landlord_id,
        start_date: new Date().toISOString().slice(0, 10),
        end_date: renewal.new_end_date,
        monthly_rent: renewal.new_monthly_rent,
        security_deposit: oldLease.security_deposit,
        status: 'active',
      })
      .select('id')
      .single();
    if (newErr || !newLease) return { ok: false, error: newErr?.message || 'Could not create new lease.' };

    await supabase.from('leases').update({ status: 'expired' }).eq('id', oldLease.id);

    await supabase
      .from('lease_renewals')
      .update({ status: 'signed', signed_at: new Date().toISOString(), new_lease_id: newLease.id })
      .eq('id', renewalId);

    await supabase.from('documents').insert({
      owner_id: me.id,
      lease_id: newLease.id,
      unit_id: oldLease.unit_id,
      type: 'lease',
      file_name: input.file_name,
      file_url: input.file_url,
      uploaded_by_role: 'landlord',
    });

    revalidatePath(`/landlord/tenants/${leaseId}`);
    revalidatePath('/landlord/tenants');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/** Option B — month-to-month. Keeps leases.status='active' (a new status
 *  value would break every other status='active' filter app-wide), and
 *  flags it with a side column instead. */
export async function setMonthToMonth(leaseId: string, formData: FormData): Promise<Result> {
  try {
    await landlord();
    const supabase = createSupabaseServerClient(cookies());
    const note = String(formData.get('note') || '');
    const { error } = await supabase
      .from('leases')
      .update({ is_month_to_month: true, month_to_month_note: note || null })
      .eq('id', leaseId);
    if (error) return { ok: false, error: error.message };
    revalidatePath(`/landlord/tenants/${leaseId}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/** Option C — turnover. Terminates the lease, frees the unit, and opens a
 *  move-out checklist. */
export async function beginTurnover(leaseId: string): Promise<Result> {
  try {
    const supabase = createSupabaseServerClient(cookies());
    await landlord();

    const { data: lease, error: lErr } = await supabase
      .from('leases')
      .select('id, unit_id, landlord_id')
      .eq('id', leaseId)
      .single();
    if (lErr || !lease) return { ok: false, error: lErr?.message || 'Lease not found.' };

    const { error: statusErr } = await supabase
      .from('leases')
      .update({ status: 'terminated' })
      .eq('id', leaseId);
    if (statusErr) return { ok: false, error: statusErr.message };

    if (lease.unit_id) {
      await supabase.from('units').update({ status: 'vacant' }).eq('id', lease.unit_id);
    }

    const { error: moErr } = await supabase.from('move_out_checklists').insert({
      lease_id: leaseId,
      unit_id: lease.unit_id,
      landlord_id: lease.landlord_id,
    });
    if (moErr) return { ok: false, error: moErr.message };

    revalidatePath(`/landlord/tenants/${leaseId}`);
    revalidatePath('/landlord/properties');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/** Toggle the move-out checklist boxes; marks completed_at once all four are checked. */
export async function updateMoveOutChecklist(
  checklistId: string,
  leaseId: string,
  formData: FormData
): Promise<Result> {
  try {
    await landlord();
    const supabase = createSupabaseServerClient(cookies());
    const fields = [
      'keys_returned',
      'walkthrough_completed',
      'deposit_disposition_sent',
      'unit_ready_for_relist',
    ] as const;
    const update: Record<(typeof fields)[number], boolean> = {
      keys_returned: formData.get('keys_returned') === 'on',
      walkthrough_completed: formData.get('walkthrough_completed') === 'on',
      deposit_disposition_sent: formData.get('deposit_disposition_sent') === 'on',
      unit_ready_for_relist: formData.get('unit_ready_for_relist') === 'on',
    };
    const allDone = fields.every((f) => update[f]);

    const { error } = await supabase
      .from('move_out_checklists')
      .update({ ...update, completed_at: allDone ? new Date().toISOString() : null })
      .eq('id', checklistId);
    if (error) return { ok: false, error: error.message };
    revalidatePath(`/landlord/tenants/${leaseId}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
