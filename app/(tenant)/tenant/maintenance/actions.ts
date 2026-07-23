'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '@/lib/supabase';
import { getCurrentUser } from '@/lib/auth';
import { notifyVendorOfDispatch } from '@/lib/dispatch';

/**
 * Tenant creates a maintenance request. A chat thread is opened automatically:
 * a system message announces the request, followed by the tenant's description
 * as the first message.
 */
export async function createRequest(formData: FormData): Promise<{ ok: boolean; error?: string }> {
  const current = await getCurrentUser();
  if (current?.profile?.role !== 'tenant') return { ok: false, error: 'Not authorized' };
  const supabase = createSupabaseServerClient(cookies());

  // Resolve the tenant's current unit + landlord from their most recent lease.
  const { data: lease } = await supabase
    .from('leases')
    .select('unit_id, landlord_id')
    .eq('tenant_id', current.authId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!lease?.unit_id) {
    return { ok: false, error: 'No active lease/unit found for your account.' };
  }

  const title = String(formData.get('title') || '').trim();
  const description = String(formData.get('description') || '').trim();
  const category = String(formData.get('category') || 'other');
  const priority = String(formData.get('priority') || 'medium');
  if (!title) return { ok: false, error: 'Please add a title.' };

  const { data: request, error } = await supabase
    .from('maintenance_requests')
    .insert({
      unit_id: lease.unit_id,
      tenant_id: current.authId,
      landlord_id: lease.landlord_id,
      title,
      description,
      category,
      priority: priority as any,
      status: 'open',
    })
    .select('id')
    .single();

  if (error || !request) {
    return { ok: false, error: error?.message || 'Could not create request.' };
  }

  // Auto-open the chat thread.
  await supabase.from('maintenance_chat').insert([
    {
      request_id: request.id,
      sender_id: null,
      sender_role: 'system',
      message:
        'Request opened. Your landlord and the Rental911 team have been notified and will respond here shortly.',
    },
    {
      request_id: request.id,
      sender_id: current.authId,
      sender_role: 'tenant',
      message: description || title,
    },
  ]);

  revalidatePath('/tenant/maintenance');
  redirect(`/tenant/maintenance/${request.id}`);
}

/**
 * Tenant self-dispatch (Path A) — non-emergency requests only, enforced here
 * even though the UI already hides the option for emergency priority, since
 * this is a real write path and must not trust the client.
 */
export async function selfDispatchVendor(
  requestId: string,
  vendorId: string,
  availability: string
): Promise<{ ok: boolean; error?: string }> {
  const current = await getCurrentUser();
  if (current?.profile?.role !== 'tenant') return { ok: false, error: 'Not authorized' };
  const supabase = createSupabaseServerClient(cookies());

  const { data: req } = await supabase
    .from('maintenance_requests')
    .select('id, priority, tenant_id')
    .eq('id', requestId)
    .maybeSingle();
  if (!req || req.tenant_id !== current.authId) {
    return { ok: false, error: 'Request not found.' };
  }
  if (req.priority === 'emergency') {
    return { ok: false, error: 'Emergency requests are routed to Rental911 for dispatch.' };
  }
  if (!availability.trim()) {
    return { ok: false, error: 'Please share your availability.' };
  }

  const { data: dispatch, error } = await supabase
    .from('vendor_dispatches')
    .insert({
      request_id: requestId,
      vendor_id: vendorId,
      dispatch_type: 'tenant',
      tenant_availability: availability.trim(),
      vendor_response: 'pending',
    })
    .select('id')
    .single();
  if (error || !dispatch) {
    return { ok: false, error: error?.message || 'Could not request this vendor.' };
  }

  const { data: vendor } = await supabase.from('vendors').select('name').eq('id', vendorId).maybeSingle();
  await supabase.from('maintenance_chat').insert({
    request_id: requestId,
    sender_id: null,
    sender_role: 'system',
    message: `${vendor?.name || 'A vendor'} was requested. They'll text you directly to schedule a time.`,
  });
  await supabase.from('maintenance_requests').update({ status: 'in_progress' }).eq('id', requestId);

  await notifyVendorOfDispatch(dispatch.id);

  revalidatePath(`/tenant/maintenance/${requestId}`);
  return { ok: true };
}

/** Tenant logs the date/time they agreed on with the vendor by text (Path A, step 7). */
export async function confirmScheduledDateAsTenant(
  dispatchId: string,
  scheduledDate: string
): Promise<{ ok: boolean; error?: string }> {
  const current = await getCurrentUser();
  if (current?.profile?.role !== 'tenant') return { ok: false, error: 'Not authorized' };
  const supabase = createSupabaseServerClient(cookies());

  const { data: dispatch } = await supabase
    .from('vendor_dispatches')
    .select('id, request_id, vendor:vendors(name)')
    .eq('id', dispatchId)
    .maybeSingle();
  if (!dispatch) return { ok: false, error: 'Dispatch not found.' };

  const { error } = await supabase
    .from('vendor_dispatches')
    .update({ scheduled_date: scheduledDate, vendor_response: 'confirmed', confirmed_by: 'tenant' })
    .eq('id', dispatchId);
  if (error) return { ok: false, error: error.message };

  const vendorName = (dispatch as any).vendor?.name ?? 'The vendor';
  await supabase.from('maintenance_chat').insert({
    request_id: dispatch.request_id,
    sender_id: null,
    sender_role: 'system',
    message: `Scheduled with ${vendorName} for ${scheduledDate}.`,
  });
  await supabase.from('maintenance_requests').update({ status: 'vendor_assigned' }).eq('id', dispatch.request_id);

  revalidatePath(`/tenant/maintenance/${dispatch.request_id}`);
  return { ok: true };
}

/** Tenant rates the completed job — one rating per request, enforced by only allowing this once tenant_rating is null. */
export async function rateDispatch(
  dispatchId: string,
  rating: number,
  feedback: string
): Promise<{ ok: boolean; error?: string }> {
  const current = await getCurrentUser();
  if (current?.profile?.role !== 'tenant') return { ok: false, error: 'Not authorized' };
  if (rating < 1 || rating > 5) return { ok: false, error: 'Rating must be 1-5.' };
  const supabase = createSupabaseServerClient(cookies());

  const { data: dispatch } = await supabase
    .from('vendor_dispatches')
    .select('id, request_id, tenant_rating')
    .eq('id', dispatchId)
    .maybeSingle();
  if (!dispatch) return { ok: false, error: 'Dispatch not found.' };
  if (dispatch.tenant_rating != null) return { ok: false, error: 'Already rated.' };

  const { error } = await supabase
    .from('vendor_dispatches')
    .update({ tenant_rating: rating, tenant_feedback: feedback.trim() || null })
    .eq('id', dispatchId);
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/tenant/maintenance/${dispatch.request_id}`);
  revalidatePath('/tenant/dashboard');
  return { ok: true };
}
