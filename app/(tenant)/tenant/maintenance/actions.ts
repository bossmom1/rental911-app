'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '@/lib/supabase';
import { getCurrentUser } from '@/lib/auth';

/**
 * Tenant creates a maintenance request. A chat thread is opened automatically:
 * a system message announces the request, followed by the tenant's description
 * as the first message.
 */
export async function createRequest(formData: FormData): Promise<{ ok: boolean; error?: string }> {
  const current = await getCurrentUser();
  if (current?.profile?.role !== 'tenant') return { ok: false, error: 'Not authorized' };
  const supabase = createSupabaseServerClient(cookies());

  // Resolve the tenant's current unit + landlord from their most recent lease.
  const { data: lease } = await supabase
    .from('leases')
    .select('unit_id, landlord_id')
    .eq('tenant_id', current.authId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!lease?.unit_id) {
    return { ok: false, error: 'No active lease/unit found for your account.' };
  }

  const title = String(formData.get('title') || '').trim();
  const description = String(formData.get('description') || '').trim();
  const category = String(formData.get('category') || 'other');
  const priority = String(formData.get('priority') || 'medium');
  if (!title) return { ok: false, error: 'Please add a title.' };

  const { data: request, error } = await supabase
    .from('maintenance_requests')
    .insert({
      unit_id: lease.unit_id,
      tenant_id: current.authId,
      landlord_id: lease.landlord_id,
      title,
      description,
      category,
      priority: priority as any,
      status: 'open',
    })
    .select('id')
    .single();

  if (error || !request) {
    return { ok: false, error: error?.message || 'Could not create request.' };
  }

  // Auto-open the chat thread.
  await supabase.from('maintenance_chat').insert([
    {
      request_id: request.id,
      sender_id: null,
      sender_role: 'system',
      message:
        'Request opened. Your landlord and the Rental911 team have been notified and will respond here shortly.',
    },
    {
      request_id: request.id,
      sender_id: current.authId,
      sender_role: 'tenant',
      message: description || title,
    },
  ]);

  revalidatePath('/tenant/maintenance');
  redirect(`/tenant/maintenance/${request.id}`);
}
