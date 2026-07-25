'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '@/lib/supabase';
import { getCurrentUser } from '@/lib/auth';
import { submitWarrantyPurchaseInvoice } from '@/lib/afc';
import { sendAfcWarrantyInvoiceEmail } from '@/lib/email';

type Result = { ok: boolean; error?: string };

/**
 * Admin-only: sets a property's warranty path/tier/service-fee. When this
 * transitions a property onto the AFC path with a tier for the first time
 * (afc_warranty_invoice_sent_at still null), synchronously fires the
 * warranty-purchase invoice automation — re-saving the same AFC state later
 * (e.g. after a failed automation run) will retry it, since the guard is
 * "no invoice sent yet", not "just now changed".
 */
export async function setPropertyWarranty(
  propertyId: string,
  formData: FormData
): Promise<Result> {
  const current = await getCurrentUser();
  if (current?.profile?.role !== 'admin') return { ok: false, error: 'Not authorized' };

  const supabase = createSupabaseServerClient(cookies());
  const warrantyPath = String(formData.get('warranty_path') || '') || null;
  const afcTier = String(formData.get('afc_tier') || '') || null;
  const feeRaw = String(formData.get('afc_service_fee_cents') || '');
  const afcServiceFeeCents = feeRaw ? Number(feeRaw) : null;

  const { data: before, error: fetchErr } = await supabase
    .from('properties')
    .select('afc_warranty_invoice_sent_at')
    .eq('id', propertyId)
    .single();
  if (fetchErr || !before) return { ok: false, error: fetchErr?.message || 'Property not found' };

  const { error } = await supabase
    .from('properties')
    .update({
      warranty_path: warrantyPath,
      afc_tier: warrantyPath === 'afc' ? afcTier : null,
      afc_service_fee_cents: warrantyPath === 'afc' ? afcServiceFeeCents : null,
    })
    .eq('id', propertyId);
  if (error) return { ok: false, error: error.message };

  const needsWarrantyInvoice = warrantyPath === 'afc' && afcTier && !before.afc_warranty_invoice_sent_at;
  if (needsWarrantyInvoice) {
    const result = await submitWarrantyPurchaseInvoice(propertyId);
    if (!result.ok) {
      revalidatePath(`/admin/properties/${propertyId}`);
      return { ok: false, error: `Saved, but the AFC invoice automation failed: ${result.error}` };
    }

    await supabase
      .from('properties')
      .update({ afc_warranty_invoice_sent_at: new Date().toISOString() })
      .eq('id', propertyId);

    const { data: property } = await supabase
      .from('properties')
      .select('name, landlord:users(email, full_name)')
      .eq('id', propertyId)
      .single();
    const landlord = (property as any)?.landlord;
    if (landlord?.email) {
      await sendAfcWarrantyInvoiceEmail({
        to: [landlord.email],
        landlordName: landlord.full_name || 'there',
        propertyName: property?.name || 'your property',
      });
    }
  }

  revalidatePath(`/admin/properties/${propertyId}`);
  revalidatePath('/admin/properties');
  return { ok: true };
}

/** Form-action wrapper — plain <form action={...}> requires a void-returning action. */
export async function setPropertyWarrantyAction(
  propertyId: string,
  formData: FormData
): Promise<void> {
  const result = await setPropertyWarranty(propertyId, formData);
  if (!result.ok) console.error('[afc] setPropertyWarranty failed:', result.error);
}
