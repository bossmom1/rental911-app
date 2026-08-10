'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '@/lib/supabase';
import { getCurrentUser } from '@/lib/auth';

type Result = { ok: boolean; error?: string };

/**
 * Landlord approves a maintenance request that exceeded their threshold.
 * Moves status from `pending_approval` → `open` so normal dispatch continues.
 */
export async function approveMaintenance(requestId: string): Promise<Result> {
  const current = await getCurrentUser();
  if (current?.profile?.role !== 'landlord') return { ok: false, error: 'Not authorized' };
  const supabase = createSupabaseServerClient(cookies());

  // Verify the calling landlord owns this request.
  const { data: req } = await supabase
    .from('maintenance_requests')
    .select('id, status, landlord_id')
    .eq('id', requestId)
    .maybeSingle();

  if (!req) return { ok: false, error: 'Request not found.' };
  if (req.landlord_id !== current.authId) return { ok: false, error: 'Not your request.' };
  if (req.status !== 'pending_approval') {
    return { ok: false, error: 'Request is not pending approval.' };
  }

  const { error } = await supabase
    .from('maintenance_requests')
    .update({
      status: 'open',
      approved_at: new Date().toISOString(),
      approved_by: current.authId,
    })
    .eq('id', requestId);

  if (error) return { ok: false, error: error.message };

  revalidatePath('/landlord/maintenance');
  revalidatePath(`/landlord/maintenance/${requestId}`);
  return { ok: true };
}

/** Form-action wrapper for `<form action={...}>` usage. */
export async function approveMaintenanceAction(requestId: string): Promise<void> {
  const result = await approveMaintenance(requestId);
  if (!result.ok) console.error('[maintenance] approveMaintenance failed:', result.error);
}
