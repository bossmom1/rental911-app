'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient, createSupabaseAdminClient } from '@/lib/supabase';
import { getCurrentUser } from '@/lib/auth';
import { syncContact, addContactTag } from '@/lib/ghl';
import { createComplianceItems } from '@/lib/compliance';
import {
  createOnboardingCheckoutSession,
  STANDARD_ONBOARDING_FEE_PER_UNIT_CENTS,
  STANDARD_MONTHLY_PER_UNIT_CENTS,
  STANDARD_QUARTERLY_PER_UNIT_CENTS,
  PLACEMENT_ONLY_PER_UNIT_CENTS,
  PORTFOLIO_AUDIT_PER_UNIT_CENTS,
  PORTFOLIO_MONTHLY_PER_UNIT_CENTS,
  PORTFOLIO_QUARTERLY_PER_UNIT_CENTS,
  ELITE_ADDON_HOURLY_CENTS,
  type OnboardingTier,
  type OnboardingBillingOption,
  type PortfolioServiceModel,
} from '@/lib/landlord-onboarding';
import type { OnboardingFeeStatus } from '@/types/database';

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
    const county = String(formData.get('county') || '');
    const municipality = String(formData.get('municipality') || '').trim() || null;
    const leadPaintRequired = formData.get('lead_paint_required') === 'on';
    const { data, error } = await supabase
      .from('properties')
      .insert({
        landlord_id: id,
        name: String(formData.get('name') || ''),
        address: String(formData.get('address') || ''),
        city: String(formData.get('city') || ''),
        state: 'MD',
        zip: String(formData.get('zip') || ''),
        county,
        municipality,
        property_type: String(formData.get('property_type') || ''),
        unit_count: unitCount,
        lead_paint_required: leadPaintRequired,
      })
      .select('id')
      .single();
    if (error) return { ok: false, error: error.message };
    await createComplianceItems(supabase, data.id, county, municipality, leadPaintRequired);
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
 * Step 9 — finish onboarding. `booked` distinguishes "I booked my call with
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
      .update({ onboarding_complete: true, onboarding_step: 9 })
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
    return { ok: true, step: 9 };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/** Current onboarding-fee status — used by Step 8 to poll after returning from Stripe. */
export async function getOnboardingFeeStatus(): Promise<OnboardingFeeStatus> {
  const supabase = createSupabaseServerClient(cookies());
  const id = await landlordId();
  const { data } = await supabase
    .from('users')
    .select('onboarding_fee_status')
    .eq('id', id)
    .maybeSingle();
  return data?.onboarding_fee_status ?? 'not_started';
}

export interface OnboardingFeeCheckoutInput {
  tier: OnboardingTier;
  billingOption: OnboardingBillingOption | null;
  portfolioServiceModel: PortfolioServiceModel | null;
  totalUnits: number;
  eliteAddonServices: string[];
  activateNow: boolean;
}

/**
 * Step 8 — generate the Checkout Session for the landlord's onboarding fee.
 * Inserts the ledger row first (status 'pending') so its id can be tagged
 * into the session's metadata; the webhook resolves the row from that
 * metadata, not by matching the charge amount.
 */
export async function generateOnboardingFeeCheckout(
  input: OnboardingFeeCheckoutInput
): Promise<ActionResult & { checkoutUrl?: string }> {
  try {
    const supabase = createSupabaseServerClient(cookies());
    const current = await getCurrentUser();
    if (current?.profile?.role !== 'landlord' || !current.profile) {
      return { ok: false, error: 'Not authorized' };
    }
    const landlord = current.profile;
    const units = Math.max(1, input.totalUnits);

    const isStandard = input.tier === 'standard';
    const isPortfolio = input.tier === 'portfolio';
    const isQuarterly = isStandard
      ? input.billingOption === 'quarterly'
      : input.portfolioServiceModel === 'external_system';

    const onboardingFeeCents = input.tier === 'placement_only'
      ? PLACEMENT_ONLY_PER_UNIT_CENTS * units
      : isStandard
        ? STANDARD_ONBOARDING_FEE_PER_UNIT_CENTS * units
        : PORTFOLIO_AUDIT_PER_UNIT_CENTS * units;

    const subscriptionUnitPriceCents = input.tier === 'placement_only'
      ? null
      : isStandard
        ? (isQuarterly ? STANDARD_QUARTERLY_PER_UNIT_CENTS : STANDARD_MONTHLY_PER_UNIT_CENTS)
        : (isQuarterly ? PORTFOLIO_QUARTERLY_PER_UNIT_CENTS : PORTFOLIO_MONTHLY_PER_UNIT_CENTS);

    const eliteAddonServices = input.eliteAddonServices ?? [];
    const eliteAddonTotalCents = eliteAddonServices.length * ELITE_ADDON_HOURLY_CENTS;

    const activateNow = input.tier === 'placement_only' ? false : input.activateNow;
    const subscriptionChargeToday = activateNow ? (subscriptionUnitPriceCents ?? 0) * units : 0;
    const amountChargedTodayCents = onboardingFeeCents + subscriptionChargeToday + eliteAddonTotalCents;

    const { data: payment, error: insertError } = await supabase
      .from('landlord_onboarding_payments')
      .insert({
        landlord_id: landlord.id,
        tier: input.tier,
        billing_option: input.tier === 'placement_only' ? null : (isQuarterly ? 'quarterly' : 'monthly'),
        portfolio_service_model: isPortfolio ? input.portfolioServiceModel : null,
        total_units: units,
        onboarding_fee_cents: onboardingFeeCents,
        subscription_unit_price_cents: subscriptionUnitPriceCents,
        elite_addon_services: eliteAddonServices,
        elite_addon_total_cents: eliteAddonTotalCents,
        activate_now: activateNow,
        amount_charged_today_cents: amountChargedTodayCents,
      })
      .select('id')
      .single();
    if (insertError || !payment) {
      return { ok: false, error: insertError?.message || 'Could not create the payment record.' };
    }

    let session;
    try {
      session = await createOnboardingCheckoutSession(
        landlord,
        {
          tier: input.tier,
          billingOption: input.tier === 'placement_only' ? null : (isQuarterly ? 'quarterly' : 'monthly'),
          portfolioServiceModel: isPortfolio ? input.portfolioServiceModel : null,
          totalUnits: units,
          eliteAddonServices,
          activateNow,
        },
        payment.id
      );
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'Could not create Stripe Checkout session.' };
    }
    if (!session.url) return { ok: false, error: 'Stripe did not return a Checkout URL.' };

    const { error: updateError } = await supabase
      .from('landlord_onboarding_payments')
      .update({ stripe_checkout_session_id: session.id })
      .eq('id', payment.id);
    if (updateError) return { ok: false, error: updateError.message };

    await supabase
      .from('users')
      .update({ onboarding_fee_status: 'pending_payment' })
      .eq('id', landlord.id)
      .neq('onboarding_fee_status', 'paid');

    return { ok: true, checkoutUrl: session.url };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
