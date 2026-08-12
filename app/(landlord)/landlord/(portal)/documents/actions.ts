'use server';

import { cookies } from 'next/headers';
import { createSupabaseServerClient } from '@/lib/supabase';
import { getCurrentUser } from '@/lib/auth';
import { revalidatePath } from 'next/cache';

export async function saveDocumentMetadata(payload: {
  landlordId: string;
  propertyId?: string;
  type: string;
  label?: string;
  filePath: string;
  fileName: string;
  fileSize?: number;
  notes?: string;
}) {
  const supabase = createSupabaseServerClient(cookies());
  const user = await getCurrentUser();
  if (!user) throw new Error('Not authenticated');

  const { error } = await supabase.from('landlord_documents').insert({
    landlord_id: payload.landlordId,
    property_id: payload.propertyId ?? null,
    type: payload.type,
    label: payload.label ?? null,
    file_path: payload.filePath,
    file_name: payload.fileName,
    file_size: payload.fileSize ?? null,
    notes: payload.notes ?? null,
  });

  if (error) throw new Error(error.message);

  revalidatePath('/landlord/documents');
  revalidatePath(`/admin/landlords/${payload.landlordId}/documents`);
  revalidatePath('/admin/landlords');
}

export async function archiveDocument(documentId: string, landlordId: string) {
  const supabase = createSupabaseServerClient(cookies());
  const user = await getCurrentUser();
  if (!user) throw new Error('Not authenticated');

  const { error } = await supabase
    .from('landlord_documents')
    .update({ archived: true })
    .eq('id', documentId)
    .eq('landlord_id', landlordId); // safety: can only archive own docs

  if (error) throw new Error(error.message);

  revalidatePath('/landlord/documents');
  revalidatePath(`/admin/landlords/${landlordId}/documents`);
  revalidatePath('/admin/landlords');
}

// Admin-only — hard delete from storage + DB
export async function adminDeleteDocument(documentId: string, landlordId: string) {
  const supabase = createSupabaseServerClient(cookies());

  const { data: doc } = await supabase
    .from('landlord_documents')
    .select('file_path')
    .eq('id', documentId)
    .single();

  if (doc?.file_path) {
    await supabase.storage.from('landlord-documents').remove([doc.file_path]);
  }

  const { error } = await supabase
    .from('landlord_documents')
    .delete()
    .eq('id', documentId);

  if (error) throw new Error(error.message);

  revalidatePath('/landlord/documents');
  revalidatePath(`/admin/landlords/${landlordId}/documents`);
  revalidatePath('/admin/landlords');
}
