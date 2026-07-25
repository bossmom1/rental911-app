'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '@/lib/supabase';
import { getCurrentUser } from '@/lib/auth';

type Result = { ok: boolean; error?: string };

/** Admin-only edit of a single compliance_items row's status/expiry/notes. */
export async function updateComplianceItem(
  propertyId: string,
  itemId: string,
  formData: FormData
): Promise<Result> {
  const current = await getCurrentUser();
  if (current?.profile?.role !== 'admin') return { ok: false, error: 'Not authorized' };

  const supabase = createSupabaseServerClient(cookies());
  const status = String(formData.get('status') || '');
  const expiryDate = String(formData.get('expiry_date') || '');
  const notes = String(formData.get('notes') || '');

  const { error } = await supabase
    .from('compliance_items')
    .update({
      status: status || null,
      expiry_date: expiryDate || null,
      notes: notes || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', itemId);
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/admin/compliance/${propertyId}`);
  revalidatePath('/admin/compliance');
  return { ok: true };
}

/** Form-action wrapper — plain <form action={...}> requires a void-returning action. */
export async function updateComplianceItemAction(
  propertyId: string,
  itemId: string,
  formData: FormData
): Promise<void> {
  const result = await updateComplianceItem(propertyId, itemId, formData);
  if (!result.ok) console.error('[compliance] updateComplianceItem failed:', result.error);
}
