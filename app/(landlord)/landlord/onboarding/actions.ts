'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient, createSupabaseAdminClient } from '@/lib/supabase';
import { getCurrentUser } from '@/lib/auth';
import { syncContact, addContactTag } from '@/lib/ghl';

type ActionResult = { ok: boolean; step?: number; error?: string };

async function landlordId(): Promise<string> {
  const current = await getCurrentUser();
  if (current?.profile?.role !== 'landlord') throw new Error('Not authorized');
  return current.authId;
}

async function setStep(step: number): Promise<void> {
  const supabase = createSupabaseServerClient(cookies());
  const id = await landlordId();
  await supabase.from('users').update({ onboarding_step: step }).eq('id', id);
  revalidatePath('/landlord/onboarding');
}

/** Step 2 — create the landlord's first property. */
export async function saveProperty(formData: FormData): Promise<ActionResult> {
  try {
    const supabase = createSupabaseServerClient(cookies());
    const id = await landlordId();
    const unitCount = Number(formData.get('unit_count') || 1);
    const { error } = await supabase.from('properties').insert({
      landlord_id: id,
      name: String(formData.get('name') || ''),
      address: String(formData.get('address') || ''),
      city: String(formData.get('city') || ''),
      state: 'MD',
      zip: String(formData.get('zip') || ''),
      county: String(formData.get('county') || ''),
      property_type: String(formData.get('property_type') || ''),
      unit_count: unitCount,
      lead_paint_required: formData.get('lead_paint_required') === 'on',
    });
    if (error) return { ok: false, error: error.message };
    await setStep(3);
    return { ok: true, step: 3 };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

async function latestProperty() {
  const supabase = createSupabaseServerClient(cookies());
  const id = await landlordId();
  const { data } = await supabase
    .from('properties')
    .select('id, unit_count')
    .eq('landlord_id', id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data;
}

async function latestUnit() {
  const supabase = createSupabaseServerClient(cookies());
  const prop = await latestProperty();
  if (!prop) return null;
  const { data } = await supabase
    .from('units')
    .select('id, monthly_rent')
    .eq('property_id', prop.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data;
}

/** Step 3 — add unit details for the property just created. */
export async function saveUnit(formData: FormData): Promise<ActionResult> {
  try {
    const supabase = createSupabaseServerClient(cookies());
    const prop = await latestProperty();
    if (!prop) return { ok: false, error: 'Add a property first.' };
    const { error } = await supabase.from('units').insert({
      property_id: prop.id,
      unit_number: String(formData.get('unit_number') || '1'),
      bedrooms: Number(formData.get('bedrooms') || 0),
      bathrooms: Number(formData.get('bathrooms') || 0),
      sqft: formData.get('sqft') ? Number(formData.get('sqft')) : null,
      monthly_rent: Number(formData.get('monthly_rent') || 0),
      status: 'vacant',
    });
    if (error) return { ok: false, error: error.message };
    await setStep(4);
    return { ok: true, step: 4 };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/**
 * Step 4 — add the tenant. Creates a real Auth user (so they can log in) via
 * the service-role admin client, sets their profile, and opens a lease on the
 * most recent unit. GHL contact sync runs in the background (non-blocking).
 */
export async function saveTenant(formData: FormData): Promise<ActionResult> {
  try {
    const lid = await landlordId();
    const unit = await latestUnit();
    if (!unit) return { ok: false, error: 'Add a unit first.' };

    const email = String(formData.get('email') || '').trim().toLowerCase();
    const fullName = String(formData.get('full_name') || '');
    const phone = String(formData.get('phone') || '');
    if (!email) return { ok: false, error: 'Tenant email is required.' };

    const admin = createSupabaseAdminClient();

    // Try invite first (sends a set-password email); fall back to direct create.
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
        return {
          ok: false,
          error: created.error?.message || 'Could not create tenant account.',
        };
      }
      tenantId = created.data.user.id;
    }

    // Ensure the profile carries the tenant details/role.
    await admin
      .from('users')
      .update({ full_name: fullName, phone, role: 'tenant' })
      .eq('id', tenantId);

    // Open a lease on the unit and mark it occupied.
    const start = new Date().toISOString().slice(0, 10);
    const { error: leaseErr } = await admin.from('leases').insert({
      unit_id: unit.id,
      tenant_id: tenantId,
      landlord_id: lid,
      start_date: start,
      monthly_rent: unit.monthly_rent,
      status: 'active',
    });
    if (leaseErr) return { ok: false, error: leaseErr.message };
    await admin.from('units').update({ status: 'occupied' }).eq('id', unit.id);

    // Background CRM sync — failures are logged, never block onboarding.
    void syncContact({ email, name: fullName, phone, role: 'tenant', tags: ['tenant'] });

    await setStep(5);
    return { ok: true, step: 5 };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/**
 * Step 5 — record required documents (lead paint cert, rental license).
 * Files are uploaded client-side to Supabase Storage; this records metadata.
 * `docs` may be empty (landlord can upload later); the step still advances.
 */
export async function recordDocuments(
  docs: Array<{ type: string; file_name: string; file_url: string }>
): Promise<ActionResult> {
  try {
    const supabase = createSupabaseServerClient(cookies());
    const lid = await landlordId();
    const unit = await latestUnit();
    if (docs.length && unit) {
      await supabase.from('documents').insert(
        docs.map((d) => ({
          owner_id: lid,
          unit_id: unit.id,
          type: d.type,
          file_name: d.file_name,
          file_url: d.file_url,
          uploaded_by_role: 'landlord' as const,
        }))
      );
    }
    await setStep(6);
    return { ok: true, step: 6 };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/** Step 6 (Stripe Connect) and Step 7 (portal preview) — advance markers.
 *  Stripe Connect Express onboarding is fully wired in Phase 2. */
export async function advanceStep(to: number): Promise<ActionResult> {
  try {
    await setStep(to);
    return { ok: true, step: to };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/**
 * Step 8 — finish onboarding. `booked` distinguishes "I booked my call with
 * Christine" from "skip for now". Either way onboarding_complete is set so the
 * landlord can enter the portal, but access_level stays 'limited' until
 * Christine manually grants full access from the admin Landlords page.
 */
export async function completeOnboarding(booked: boolean): Promise<ActionResult> {
  try {
    const supabase = createSupabaseServerClient(cookies());
    const id = await landlordId();
    const { error } = await supabase
      .from('users')
      .update({ onboarding_complete: true, onboarding_step: 8 })
      .eq('id', id);
    if (error) return { ok: false, error: error.message };

    // Tag the CRM contact (non-blocking). Real contactId lookup lands in Phase 5.
    if (booked) {
      const current = await getCurrentUser();
      if (current?.profile?.stripe_customer_id) {
        void addContactTag(current.profile.stripe_customer_id, 'onboarded-landlord');
      }
    }
    revalidatePath('/landlord', 'layout');
    return { ok: true, step: 8 };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
