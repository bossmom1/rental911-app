'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '@/lib/supabase';
import { getCurrentUser } from '@/lib/auth';
import type { LicenseStatus, MembershipStatus } from '@/types/database';

export interface VendorFormInput {
  name: string;
  trade: string;
  phone: string;
  email: string;
  avg_response_hours: number;
  license_number: string;
  license_expiry: string;
  license_status: LicenseStatus;
  insurance_confirmed: boolean;
  insurance_confirmed_date: string;
  vetted_at: string;
  next_reverification_due: string;
  discount_offered: string;
  membership_start_date: string;
  membership_term_months: number;
  membership_status: MembershipStatus;
  ghl_contact_id: string;
}

function toRow(input: VendorFormInput) {
  return {
    name: input.name || null,
    trade: input.trade || null,
    phone: input.phone || null,
    email: input.email || null,
    avg_response_hours: input.avg_response_hours,
    license_number: input.license_number || null,
    license_expiry: input.license_expiry || null,
    license_status: input.license_status || null,
    insurance_confirmed: input.insurance_confirmed,
    insurance_confirmed_date: input.insurance_confirmed_date || null,
    vetted_at: input.vetted_at || null,
    next_reverification_due: input.next_reverification_due || null,
    discount_offered: input.discount_offered || null,
    membership_start_date: input.membership_start_date || null,
    membership_term_months: input.membership_term_months,
    membership_status: input.membership_status || null,
    ghl_contact_id: input.ghl_contact_id || null,
  };
}

export async function createVendor(input: VendorFormInput): Promise<{ ok: boolean; error?: string }> {
  const current = await getCurrentUser();
  if (current?.profile?.role !== 'admin') return { ok: false, error: 'Not authorized' };
  if (!input.name || !input.trade) return { ok: false, error: 'Name and trade are required.' };

  const supabase = createSupabaseServerClient(cookies());
  const { error } = await supabase.from('vendors').insert({ ...toRow(input), active: true, is_hidden_lapsed: false });
  if (error) return { ok: false, error: error.message };

  revalidatePath('/admin/vendors');
  return { ok: true };
}

export async function updateVendor(vendorId: string, input: VendorFormInput): Promise<{ ok: boolean; error?: string }> {
  const current = await getCurrentUser();
  if (current?.profile?.role !== 'admin') return { ok: false, error: 'Not authorized' };
  if (!input.name || !input.trade) return { ok: false, error: 'Name and trade are required.' };

  const supabase = createSupabaseServerClient(cookies());
  const { error } = await supabase.from('vendors').update(toRow(input)).eq('id', vendorId);
  if (error) return { ok: false, error: error.message };

  revalidatePath('/admin/vendors');
  return { ok: true };
}

export async function setVendorActive(vendorId: string, active: boolean): Promise<{ ok: boolean; error?: string }> {
  const current = await getCurrentUser();
  if (current?.profile?.role !== 'admin') return { ok: false, error: 'Not authorized' };

  const supabase = createSupabaseServerClient(cookies());
  const { error } = await supabase.from('vendors').update({ active }).eq('id', vendorId);
  if (error) return { ok: false, error: error.message };

  revalidatePath('/admin/vendors');
  return { ok: true };
}
