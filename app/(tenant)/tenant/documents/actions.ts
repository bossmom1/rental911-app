'use server';

import { cookies } from 'next/headers';
import { createSupabaseServerClient } from '@/lib/supabase';
import { getCurrentUser } from '@/lib/auth';
import { revalidatePath } from 'next/cache';

export async function saveTenantDocumentMetadata(payload: {
  tenantId: string;
  landlordId: string;
  leaseId?: string;
  propertyId?: string;
  type: string;
  label?: string;
  filePath: string;
  fileName: string;
  fileSize?: number;
}) {
  const supabase = createSupabaseServerClient(cookies());
  const user = await getCurrentUser();
  if (!user) throw new Error('Not authenticated');

  const { error } = await supabase.from('tenant_documents').insert({
    tenant_id:   payload.tenantId,
    landlord_id: payload.landlordId,
    lease_id:    payload.leaseId    ?? null,
    property_id: payload.propertyId ?? null,
    type:        payload.type,
    label:       payload.label      ?? null,
    file_path:   payload.filePath,
    file_name:   payload.fileName,
    file_size:   payload.fileSize   ?? null,
  });

  if (error) throw new Error(error.message);

  revalidatePath('/tenant/documents');
  revalidatePath(`/landlord/tenants/${payload.leaseId}/documents`);
}

export async function archiveTenantDocument(documentId: string, tenantId: string, leaseId?: string) {
  const supabase = createSupabaseServerClient(cookies());
  const user = await getCurrentUser();
  if (!user) throw new Error('Not authenticated');

  const { error } = await supabase
    .from('tenant_documents')
    .update({ archived: true })
    .eq('id', documentId)
    .eq('tenant_id', tenantId); // safety: can only archive own docs

  if (error) throw new Error(error.message);

  revalidatePath('/tenant/documents');
  if (leaseId) revalidatePath(`/landlord/tenants/${leaseId}/documents`);
}
