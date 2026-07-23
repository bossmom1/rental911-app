import { createSupabaseAdminClient } from '@/lib/supabase';
import { sendVendorDispatchNotification } from '@/lib/ghl';
import { vendorConfirmUrl } from '@/lib/vendors';

/**
 * Notifies a vendor (SMS + email via GHL) after a vendor_dispatches row is
 * created, for either dispatch path. Both paths get the same confirmation
 * link — it's a scheduling tool, not an accept/decline, so it doesn't
 * conflict with the "no accept/decline link" requirement for tenant
 * self-dispatch; Path A's primary flow is still direct tenant<->vendor
 * texting, this is just the fallback for logging the agreed date.
 *
 * Best-effort: failures are logged, never thrown — a notification failure
 * must not block the dispatch record from existing.
 */
export async function notifyVendorOfDispatch(dispatchId: string): Promise<void> {
  const admin = createSupabaseAdminClient();

  try {
    const { data: dispatch, error } = await admin
      .from('vendor_dispatches')
      .select(
        `id, tenant_availability, dispatch_type,
         vendor:vendors(name, ghl_contact_id),
         request:maintenance_requests(
           title, description, category, priority, tenant_id, landlord_id,
           unit:units(unit_number, property:properties(address, city, state, zip))
         )`
      )
      .eq('id', dispatchId)
      .single();
    if (error || !dispatch) throw new Error(error?.message || 'dispatch not found');

    const vendor = (dispatch as any).vendor;
    const req = (dispatch as any).request;
    const unit = req?.unit;
    const property = unit?.property;

    if (!vendor?.ghl_contact_id) {
      console.warn('[dispatch] vendor has no ghl_contact_id, skipping notification:', dispatchId);
      return;
    }

    const { data: tenant } = await admin
      .from('users')
      .select('full_name, phone, email')
      .eq('id', req.tenant_id)
      .maybeSingle();
    const { data: landlord } = req.landlord_id
      ? await admin.from('users').select('full_name, phone').eq('id', req.landlord_id).maybeSingle()
      : { data: null };

    const address = [property?.address, unit?.unit_number ? `Unit ${unit.unit_number}` : null, property?.city, property?.state, property?.zip]
      .filter(Boolean)
      .join(', ');

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://rental911-app.vercel.app';
    const link = vendorConfirmUrl(dispatchId, siteUrl);

    const lines = [
      `New Rental911 job: ${req.title || 'Maintenance request'}`,
      `Address: ${address || 'address on file'}`,
      `Issue: ${req.description || 'no description provided'}`,
      `Tenant: ${tenant?.full_name || 'tenant'} — ${tenant?.phone || tenant?.email || 'contact on file'}`,
    ];
    if (dispatch.tenant_availability) {
      lines.push(`Tenant's availability: ${dispatch.tenant_availability}`);
    }
    if (dispatch.dispatch_type === 'admin' && landlord?.full_name) {
      lines.push(`Landlord: ${landlord.full_name}`);
    }
    lines.push(`Once you've agreed on a time, confirm it here: ${link}`);

    const smsText = lines.join('\n');
    const emailHtml = lines.map((l) => `<p>${l}</p>`).join('\n');

    await sendVendorDispatchNotification(vendor.ghl_contact_id, {
      subject: `Rental911 job: ${req.title || 'Maintenance request'}`,
      smsText,
      emailHtml,
    });
  } catch (err) {
    console.error('[dispatch] notifyVendorOfDispatch failed (non-blocking):', err);
  }
}
