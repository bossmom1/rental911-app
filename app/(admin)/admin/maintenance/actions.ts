'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '@/lib/supabase';
import { getCurrentUser } from '@/lib/auth';
import { notifyVendorOfDispatch } from '@/lib/dispatch';

/** Admin dispatch (Path B) — emergencies, or any request the tenant hasn't self-dispatched. */
export async function adminDispatchVendor(
  requestId: string,
  vendorId: string
): Promise<{ ok: boolean; error?: string }> {
  const current = await getCurrentUser();
  if (current?.profile?.role !== 'admin') return { ok: false, error: 'Not authorized' };
  const supabase = createSupabaseServerClient(cookies());

  const { data: dispatch, error } = await supabase
    .from('vendor_dispatches')
    .insert({
      request_id: requestId,
      vendor_id: vendorId,
      dispatch_type: 'admin',
      dispatched_by: current.authId,
      vendor_response: 'pending',
    })
    .select('id')
    .single();
  if (error || !dispatch) {
    return { ok: false, error: error?.message || 'Could not dispatch this vendor.' };
  }

  const { data: vendor } = await supabase.from('vendors').select('name').eq('id', vendorId).maybeSingle();
  await supabase.from('maintenance_chat').insert({
    request_id: requestId,
    sender_id: null,
    sender_role: 'system',
    message: `${vendor?.name || 'A vendor'} was dispatched by Rental911. Awaiting confirmation.`,
  });
  await supabase.from('maintenance_requests').update({ status: 'in_progress' }).eq('id', requestId);

  await notifyVendorOfDispatch(dispatch.id);

  revalidatePath(`/admin/maintenance/${requestId}`);
  return { ok: true };
}
