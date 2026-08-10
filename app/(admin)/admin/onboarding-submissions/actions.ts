'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '@/lib/supabase';
import { getCurrentUser } from '@/lib/auth';

type Result = { ok: boolean; error?: string };

/** Admin marks a submission as reviewed (read, no action needed yet). */
export async function markReviewed(submissionId: string): Promise<Result> {
  const current = await getCurrentUser();
  if (current?.profile?.role !== 'admin') return { ok: false, error: 'Not authorized' };

  const supabase = createSupabaseServerClient(cookies());
  const { error } = await supabase
    .from('onboarding_submissions')
    .update({
      status: 'reviewed',
      reviewed_by: current.profile.id,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', submissionId)
    .eq('status', 'new');   // idempotent — only transitions from 'new'

  if (error) return { ok: false, error: error.message };

  revalidatePath('/admin/onboarding-submissions');
  revalidatePath(`/admin/onboarding-submissions/${submissionId}`);
  return { ok: true };
}

/** Form-action wrapper for <form action={...}> usage. */
export async function markReviewedAction(submissionId: string): Promise<void> {
  const result = await markReviewed(submissionId);
  if (!result.ok) console.error('[onboarding] markReviewed failed:', result.error);
}
