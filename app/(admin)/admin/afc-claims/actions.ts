'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '@/lib/supabase';
import { getCurrentUser } from '@/lib/auth';

type Result = { ok: boolean; error?: string };

/** Admin marks a manually-filed AFC claim as submitted, once they've filed it with AFC Service directly. */
export async function markClaimSubmitted(claimId: string): Promise<Result> {
  const current = await getCurrentUser();
  if (current?.profile?.role !== 'admin') return { ok: false, error: 'Not authorized' };

  const supabase = createSupabaseServerClient(cookies());
  const { error } = await supabase
    .from('afc_claim_invoices')
    .update({ status: 'submitted', submitted_at: new Date().toISOString() })
    .eq('id', claimId);
  if (error) return { ok: false, error: error.message };

  revalidatePath('/admin/afc-claims');
  return { ok: true };
}

/** Form-action wrapper — plain <form action={...}> requires a void-returning action. */
export async function markClaimSubmittedAction(claimId: string): Promise<void> {
  const result = await markClaimSubmitted(claimId);
  if (!result.ok) console.error('[afc] markClaimSubmitted failed:', result.error);
}
