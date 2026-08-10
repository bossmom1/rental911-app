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
      reviewed_by: current.profile!.id,
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

/**
 * Admin pushes the maintenance threshold from the onboarding submission to the
 * landlord's users row. Reads `maintenance_threshold_choice` and
 * `maintenance_threshold_custom` from the submission:
 *   - 'accept $500' → 50000 cents (the standard default)
 *   - 'custom'      → parse `maintenance_threshold_custom` as a dollar amount
 *
 * Only works when `converted_landlord_id` is already linked to the submission.
 */
export async function setThresholdFromSubmission(submissionId: string): Promise<Result> {
  const current = await getCurrentUser();
  if (current?.profile?.role !== 'admin') return { ok: false, error: 'Not authorized' };

  const supabase = createSupabaseServerClient(cookies());

  const { data: s } = await supabase
    .from('onboarding_submissions')
    .select('converted_landlord_id, maintenance_threshold_choice, maintenance_threshold_custom')
    .eq('id', submissionId)
    .maybeSingle();

  if (!s) return { ok: false, error: 'Submission not found.' };
  if (!s.converted_landlord_id) {
    return { ok: false, error: 'No landlord account linked to this submission yet.' };
  }

  let thresholdCents = 50000; // default $500

  const choice = (s.maintenance_threshold_choice ?? '').toLowerCase().trim();

  if (choice === 'custom' || choice === 'other') {
    // Parse the custom text field — strip everything except digits and dots.
    const raw = String(s.maintenance_threshold_custom ?? '').replace(/[^0-9.]/g, '');
    const dollars = parseFloat(raw);
    if (!isNaN(dollars) && dollars > 0) {
      thresholdCents = Math.round(dollars * 100);
    }
  }
  // Any value containing '$500' or 'accept $500' stays at 50000.

  const { error } = await supabase
    .from('users')
    .update({ maintenance_threshold_cents: thresholdCents })
    .eq('id', s.converted_landlord_id);

  if (error) return { ok: false, error: error.message };

  revalidatePath(`/admin/onboarding-submissions/${submissionId}`);
  return { ok: true };
}

/** Form-action wrapper for <form action={...}> usage. */
export async function setThresholdAction(submissionId: string): Promise<void> {
  const result = await setThresholdFromSubmission(submissionId);
  if (!result.ok) console.error('[onboarding] setThreshold failed:', result.error);
}
