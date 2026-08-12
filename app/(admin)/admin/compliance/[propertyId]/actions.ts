'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '@/lib/supabase';
import { getCurrentUser } from '@/lib/auth';

export async function updateComplianceItem(
  itemId: string,
  formData: FormData
): Promise<void> {
  const current = await getCurrentUser();
  if (current?.profile?.role !== 'admin') throw new Error('Not authorized');

  const supabase = createSupabaseServerClient(cookies());
  const status = String(formData.get('status') || 'not_on_file');
  const expiryRaw = String(formData.get('expiry_date') || '').trim();
  const notes = String(formData.get('notes') || '').trim() || null;

  await supabase
    .from('compliance_items')
    .update({
      status,
      expiry_date: expiryRaw || null,
      notes,
      // If admin manually marks something current or not_on_file, reset alert flag
      alert_sent: status === 'current' || status === 'not_on_file' ? false : undefined,
    })
    .eq('id', itemId);

  revalidatePath('/admin/compliance');
}
