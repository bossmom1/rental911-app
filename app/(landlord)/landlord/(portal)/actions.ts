'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import {
  createSupabaseServerClient,
  createSupabaseAdminClient,
} from '@/lib/supabase';
import { getCurrentUser } from '@/lib/auth';
import { syncContact } from '@/lib/ghl';

type Result = { ok: boolean; error?: string };

async function landlord() {
  const current = await getCurrentUser();
  if (current?.profile?.role !== 'landlord') throw new Error('Not authorized');
  return current.profile;
}

export async function addProperty(formData: FormData): Promise<Result> {
  try {
    const me = await landlord();
    const supabase = createSupabaseServerClient(cookies());
    const { error } = await supabase.from('properties').insert({
      landlord_id: me.id,
      name: String(formData.get('name') || ''),
      address: String(formData.get('address') || ''),
      city: String(formData.get('city') || ''),
      state: 'MD',
      zip: String(formData.get('zip') || ''),
      county: String(formData.get('county') || ''),
      property_type: String(formData.get('property_type') || ''),
      unit_count: Number(formData.get('unit_count') || 1),
      lead_paint_required: formData.get('lead_paint_required') === 'on',
    });
    if (error) return { ok: false, error: error.message };
    revalidatePath('/landlord/properties');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function addUnit(formData: FormData): Promise<Result> {
  try {
    await landlord();
    const supabase = createSupabaseServerClient(cookies());
    const propertyId = String(formData.get('property_id') || '');
    if (!propertyId) return { ok: false, error: 'Property is required.' };
    const { error } = await supabase.from('units').insert({
      property_id: propertyId,
      unit_number: String(formData.get('unit_number') || '1'),
      bedrooms: Number(formData.get('bedrooms') || 0),
      bathrooms: Number(formData.get('bathrooms') || 0),
      sqft: formData.get('sqft') ? Number(formData.get('sqft')) : null,
      monthly_rent: Number(formData.get('monthly_rent') || 0),
      status: 'vacant',
    });
    if (error) return { ok: false, error: error.message };
    revalidatePath('/landlord/properties');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/** Create a tenant Auth account + open a lease on the chosen unit. */
export async function addTenant(formData: FormData): Promise<Result> {
  try {
    const me = await landlord();
    const unitId = String(formData.get('unit_id') || '');
    if (!unitId) return { ok: false, error: 'Select a unit.' };

    const email = String(formData.get('email') || '').trim().toLowerCase();
    const fullName = String(formData.get('full_name') || '');
    const phone = String(formData.get('phone') || '');
    if (!email) return { ok: false, error: 'Tenant email is required.' };

    const admin = createSupabaseAdminClient();

    // Confirm the unit belongs to this landlord (defense against tampering).
    const { data: unit } = await admin
      .from('units')
      .select('id, monthly_rent, property:properties(landlord_id)')
      .eq('id', unitId)
      .maybeSingle();
    const ownerId = (unit as any)?.property?.landlord_id;
    if (!unit || ownerId !== me.id) {
      return { ok: false, error: 'That unit is not yours.' };
    }

    let tenantId: string | undefined;
    const invite = await admin.auth.admin.inviteUserByEmail(email, {
      data: { role: 'tenant', full_name: fullName, phone },
    });
    tenantId = invite.data?.user?.id;
    if (invite.error || !tenantId) {
      const created = await admin.auth.admin.createUser({
        email,
        email_confirm: true,
        password: crypto.randomUUID(),
        user_metadata: { role: 'tenant', full_name: fullName, phone },
      });
      if (created.error || !created.data.user) {
        return { ok: false, error: created.error?.message || 'Could not create tenant.' };
      }
      tenantId = created.data.user.id;
    }

    await admin
      .from('users')
      .update({ full_name: fullName, phone, role: 'tenant' })
      .eq('id', tenantId);

    const { error: leaseErr } = await admin.from('leases').insert({
      unit_id: unitId,
      tenant_id: tenantId,
      landlord_id: me.id,
      start_date: new Date().toISOString().slice(0, 10),
      monthly_rent: (unit as any).monthly_rent,
      status: 'active',
    });
    if (leaseErr) return { ok: false, error: leaseErr.message };
    await admin.from('units').update({ status: 'occupied' }).eq('id', unitId);

    void syncContact({ email, name: fullName, phone, role: 'tenant', tags: ['tenant'] });

    revalidatePath('/landlord/tenants');
    revalidatePath('/landlord/properties');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
