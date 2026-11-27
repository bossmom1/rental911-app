'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '@/lib/supabase';
import { getCurrentUser } from '@/lib/auth';

export interface QaReplayInput {
  title: string;
  description: string;
  recording_url: string;
  recorded_at: string;
}

type ActionResult = { ok: true } | { ok: false; error: string };

export async function createQaReplay(input: QaReplayInput): Promise<ActionResult> {
  if (!input.title.trim()) return { ok: false, error: 'Title is required.' };
  if (!input.recording_url.trim()) return { ok: false, error: 'Recording URL is required.' };

  const user = await getCurrentUser();
  const supabase = createSupabaseServerClient(cookies());

  const { error } = await supabase.from('qa_replays').insert({
    title: input.title.trim(),
    description: input.description.trim() || null,
    recording_url: input.recording_url.trim(),
    recorded_at: input.recorded_at || new Date().toISOString().slice(0, 10),
    created_by: user?.authId ?? null,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath('/admin/replays');
  revalidatePath('/landlord/replays');
  return { ok: true };
}

export async function deleteQaReplay(id: string): Promise<ActionResult> {
  const supabase = createSupabaseServerClient(cookies());
  const { error } = await supabase.from('qa_replays').delete().eq('id', id);
  if (error) return { ok: false, error: error.message };

  revalidatePath('/admin/replays');
  revalidatePath('/landlord/replays');
  return { ok: true };
}
