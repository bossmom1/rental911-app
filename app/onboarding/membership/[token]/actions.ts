'use server';

import { createSupabaseAdminClient } from '@/lib/supabase';
import { provisionMembershipAccount } from '@/lib/membership-onboarding';
import type { LeadPaintStatus, RentalLicenseStatus, PreferredContactMethod } from '@/types/database';

const BUCKET = 'landlord-documents';

/** Server-side upload via the service-role client — the visitor has no
 *  Supabase session yet (no portal account exists until after booking), so
 *  this can't go through client-side RLS-governed storage like the portal's
 *  Documents tab does. Safe: runs entirely server-side, path is token-scoped. */
async function uploadIntakeFile(
  token: string,
  file: File,
  prefix: string
): Promise<{ path: string; name: string } | null> {
  if (!file || file.size === 0) return null;
  const admin = createSupabaseAdminClient();
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const path = `membership-intake/${token}/${prefix}-${Date.now()}-${safeName}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  const { error } = await admin.storage.from(BUCKET).upload(path, buffer, {
    contentType: file.type || 'application/octet-stream',
    upsert: false,
  });
  if (error) return null;
  return { path, name: file.name };
}

export interface MembershipIntakeResult {
  ok: boolean;
  error?: string;
}

/** Step 1 — the qualifying/intake form. */
export async function submitMembershipIntake(
  token: string,
  formData: FormData
): Promise<MembershipIntakeResult> {
  const admin = createSupabaseAdminClient();

  const { data: payment } = await admin
    .from('landlord_onboarding_payments')
    .select('id')
    .eq('intake_token', token)
    .eq('tier', 'membership')
    .maybeSingle();
  if (!payment) return { ok: false, error: 'This intake link is invalid.' };

  const leaseFile = formData.get('lease_file') as File | null;
  const licenseFile = formData.get('rental_license_file') as File | null;
  const extraFiles = formData.getAll('additional_files') as File[];
  const extraLabels = formData.getAll('additional_labels') as string[];

  const [lease, license] = await Promise.all([
    leaseFile ? uploadIntakeFile(token, leaseFile, 'lease') : Promise.resolve(null),
    licenseFile ? uploadIntakeFile(token, licenseFile, 'license') : Promise.resolve(null),
  ]);

  const additional_documents: Array<{ label: string; file_path: string; file_name: string }> = [];
  for (let i = 0; i < extraFiles.length; i++) {
    const uploaded = await uploadIntakeFile(token, extraFiles[i], `extra-${i}`);
    if (uploaded) {
      additional_documents.push({
        label: extraLabels[i] || uploaded.name,
        file_path: uploaded.path,
        file_name: uploaded.name,
      });
    }
  }

  const { error } = await admin.from('membership_intake_responses').insert({
    payment_id: payment.id,
    lease_file_path: lease?.path ?? null,
    lease_file_name: lease?.name ?? null,
    rental_license_file_path: license?.path ?? null,
    rental_license_file_name: license?.name ?? null,
    additional_documents,
    current_pm_software: String(formData.get('current_pm_software') || '').trim() || null,
    lead_paint_status: (String(formData.get('lead_paint_status') || '') || null) as LeadPaintStatus | null,
    rental_license_status: (String(formData.get('rental_license_status') || '') || null) as RentalLicenseStatus | null,
    biggest_challenge: String(formData.get('biggest_challenge') || '').trim() || null,
    preferred_contact_method: (String(formData.get('preferred_contact_method') || '') || null) as PreferredContactMethod | null,
  });
  if (error) return { ok: false, error: error.message };

  return { ok: true };
}

/** Step 2 — "I've booked my call" (or skip). Provisions the actual portal
 *  account — same trigger point as the Subscription Step 9 completeOnboarding. */
export async function completeMembershipOnboarding(token: string): Promise<MembershipIntakeResult> {
  const admin = createSupabaseAdminClient();
  const { data: payment } = await admin
    .from('landlord_onboarding_payments')
    .select('id')
    .eq('intake_token', token)
    .eq('tier', 'membership')
    .maybeSingle();
  if (!payment) return { ok: false, error: 'This intake link is invalid.' };

  const result = await provisionMembershipAccount(payment.id);
  return result;
}
