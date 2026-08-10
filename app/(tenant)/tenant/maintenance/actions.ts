'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { waitUntil } from '@vercel/functions';
import { createSupabaseServerClient, createSupabaseAdminClient } from '@/lib/supabase';
import { getCurrentUser } from '@/lib/auth';
import { notifyVendorOfDispatch } from '@/lib/dispatch';
import { submitClaimInvoice } from '@/lib/afc';
import { sendMaintenanceApprovalEmail } from '@/lib/email';

/**
 * Tenant creates a maintenance request. A chat thread is opened automatically:
 * a system message announces the request, followed by the tenant's description
 * as the first message.
 *
 * If the optional `estimated_cost_cents` field is provided and exceeds the
 * landlord's `maintenance_threshold_cents`, the request is created with
 * `status: 'pending_approval'` and an approval email is sent to the landlord.
 * Otherwise the request goes straight to `status: 'open'`.
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

  // Optional estimated cost from the form (in cents).
  const rawCost = formData.get('estimated_cost_cents');
  const estimatedCostCents = rawCost ? parseInt(String(rawCost), 10) : null;

  // Determine whether this request needs landlord approval.
  let status: 'open' | 'pending_approval' = 'open';
  let billingAmountCents: number | null = null;

  if (estimatedCostCents && estimatedCostCents > 0 && lease.landlord_id) {
    const { data: landlordUser } = await supabase
      .from('users')
      .select('maintenance_threshold_cents, email, full_name')
      .eq('id', lease.landlord_id)
      .maybeSingle();

    const threshold = landlordUser?.maintenance_threshold_cents ?? 50000;
    if (estimatedCostCents > threshold) {
      status = 'pending_approval';
      billingAmountCents = estimatedCostCents;
    }
  }

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
      status,
      billing_amount_cents: billingAmountCents,
    })
    .select('id')
    .single();

  if (error || !request) {
    return { ok: false, error: error?.message || 'Could not create request.' };
  }

  // Send approval email when request is above threshold (non-blocking).
  if (status === 'pending_approval' && lease.landlord_id) {
    waitUntil(
      (async () => {
        try {
          const { data: landlordUser } = await supabase
            .from('users')
            .select('email, full_name, maintenance_threshold_cents')
            .eq('id', lease.landlord_id!)
            .maybeSingle();

          const { data: unit } = await supabase
            .from('units')
            .select('unit_number, property:properties(address, name)')
            .eq('id', lease.unit_id!)
            .maybeSingle();

          const propertyAddress =
            (unit as any)?.property?.address ??
            (unit as any)?.property?.name ??
            'your property';

          const threshold = landlordUser?.maintenance_threshold_cents ?? 50000;
          const thresholdFormatted = `$${(threshold / 100).toFixed(0)}`;
          const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://rental911.net';

          await sendMaintenanceApprovalEmail({
            to: landlordUser?.email ? [landlordUser.email] : [],
            landlordName: landlordUser?.full_name ?? 'Landlord',
            propertyAddress,
            requestTitle: title,
            thresholdFormatted,
            requestUrl: `${appUrl}/landlord/maintenance/${request.id}`,
          });
        } catch (emailErr) {
          console.error('[maintenance] approval email failed (non-blocking):', emailErr);
        }
      })()
    );
  }

  // AFC Home Club: if this property is on the AFC warranty path, file the
  // claim + generate the service invoice. Runs after the response (via
  // waitUntil) so it never slows down the tenant's submission, and never
  // blocks/rolls back the maintenance request itself if it fails — a
  // 'pending'/'failed' row is picked up by the retry cron either way.
  try {
    const { data: unit } = await supabase
      .from('units')
      .select('property:properties(id, warranty_path, afc_service_fee_cents)')
      .eq('id', lease.unit_id)
      .maybeSingle();
    const property = (unit as any)?.property;
    if (property?.warranty_path === 'afc') {
      const admin = createSupabaseAdminClient();
      const { data: claim } = await admin
        .from('afc_claim_invoices')
        .insert({
          property_id: property.id,
          maintenance_request_id: request.id,
          landlord_id: lease.landlord_id,
          service_fee_cents: property.afc_service_fee_cents,
          status: 'pending',
        })
        .select('id')
        .single();
      if (claim) {
        waitUntil(
          submitClaimInvoice(request.id).then((result) =>
            admin
              .from('afc_claim_invoices')
              .update(
                !result.ok
                  ? { status: 'failed', error: result.error }
                  : result.status === 'pending_manual'
                    ? { status: 'pending_manual' }
                    : { status: 'submitted', submitted_at: new Date().toISOString() }
              )
              .eq('id', claim.id)
          )
        );
      }
    }
  } catch (afcErr) {
    console.error('[afc] claim-invoice trigger failed (non-blocking):', afcErr);
  }

  // Auto-open the chat thread.
  const systemMessage =
    status === 'pending_approval'
      ? 'Request submitted and is pending landlord approval before dispatch. Your landlord has been notified.'
      : 'Request opened. Your landlord and the Rental911 team have been notified and will respond here shortly.';

  await supabase.from('maintenance_chat').insert([
    {
      request_id: request.id,
      sender_id: null,
      sender_role: 'system',
      message: systemMessage,
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
