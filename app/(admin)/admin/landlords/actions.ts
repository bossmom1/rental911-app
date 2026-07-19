'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '@/lib/supabase';
import { getCurrentUser } from '@/lib/auth';
import type { AccessLevel } from '@/types/database';

/**
 * Admin-only: toggle a landlord's access level. Setting 'full' is how Christine
 * unlocks a landlord who booked (or completed) their Step 8 onboarding call.
 */
export async function setAccessLevel(userId: string, level: AccessLevel) {
  const current = await getCurrentUser();
  if (current?.profile?.role !== 'admin') {
    throw new Error('Not authorized');
  }
  const supabase = createSupabaseServerClient(cookies());
  const { error } = await supabase
    .from('users')
    .update({ access_level: level })
    .eq('id', userId);
  if (error) throw new Error(error.message);
  revalidatePath('/admin/landlords');
}
