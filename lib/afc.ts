import type { Page } from 'playwright-core';
import { createSupabaseAdminClient } from '@/lib/supabase';
import { withAfcBrowser } from '@/lib/afc-browser';
import type { AfcTier } from '@/types/database';

const AFC_LOGIN_URL = 'https://afchomeclub.com/realtor/login'; // best-guess, unverified — see loginToAfc()
const AFC_INVOICE_URL = 'https://afchomeclub.com/realtor/invoice';

/**
 * CONFIDENTIAL — AFC's actual wholesale tier pricing. Never expose via any
 * client-facing code path, API response body, or log line. Landlords/tenants
 * only ever see `properties.afc_service_fee_cents` (their $75/$100/$125
 * deductible) — a completely separate, non-confidential figure used for the
 * claim/service invoice, not this one.
 */
const AFC_TIER_PRICING_CENTS: Record<AfcTier, number> = {
  diamond: 105000,
  platinum: 75000,
};

function afcCredentials(): { email: string; password: string } {
  const email = process.env.AFC_REALTOR_EMAIL;
  const password = process.env.AFC_REALTOR_PASSWORD;
  if (!email || !password) {
    throw new Error('AFC_REALTOR_EMAIL / AFC_REALTOR_PASSWORD is not set');
  }
  return { email, password };
}

/**
 * Logs into the AFC Home Club realtor portal. Field selectors are a
 * reasonable-confidence guess at a standard login form — UNVERIFIED against
 * the real page (login-gated, could not be inspected directly). Confirm
 * against the actual DOM (e.g. via Playwright codegen) before relying on
 * this in production.
 */
async function loginToAfc(page: Page): Promise<void> {
  const { email, password } = afcCredentials();
  await page.goto(AFC_LOGIN_URL, { waitUntil: 'domcontentloaded' });
  await page.fill('input[type="email"], input[name="email"]', email);
  await page.fill('input[type="password"], input[name="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForLoadState('networkidle');
}

/**
 * Thrown by the two submit* functions below until the real
 * afchomeclub.com/realtor/invoice form fields are confirmed — fails loudly
 * rather than silently pretending a guessed selector worked.
 */
export class AfcFormNotConfirmedError extends Error {
  constructor(step: string) {
    super(
      `AFC_FORM_NOT_CONFIRMED: ${step} — real form field names/selectors for ` +
        'afchomeclub.com/realtor/invoice have not been confirmed yet (the page ' +
        'is login-gated). Inspect the real form and fill in the actual ' +
        'page.fill()/page.click() calls before this can run.'
    );
    this.name = 'AfcFormNotConfirmedError';
  }
}

export interface AfcResult {
  ok: boolean;
  error?: string;
}

/**
 * Fires once, when a property is set to warranty_path='afc' with a tier.
 * Logs into AFC, submits the property/landlord details, generates the
 * warranty-purchase invoice. STUBBED pending confirmed form selectors —
 * see AfcFormNotConfirmedError.
 */
export async function submitWarrantyPurchaseInvoice(propertyId: string): Promise<AfcResult> {
  try {
    const admin = createSupabaseAdminClient();
    const { data: property, error } = await admin
      .from('properties')
      .select(
        'id, name, address, city, state, zip, afc_tier, landlord:users(full_name, email, phone)'
      )
      .eq('id', propertyId)
      .single();
    if (error || !property) throw new Error(error?.message || 'property not found');
    if (!property.afc_tier) throw new Error('property has no afc_tier set');

    // Confidential — never logged, never returned, only used inside the form-fill step.
    const _tierPriceCents = AFC_TIER_PRICING_CENTS[property.afc_tier as AfcTier];

    return await withAfcBrowser(async (page) => {
      await loginToAfc(page);
      await page.goto(AFC_INVOICE_URL, { waitUntil: 'domcontentloaded' });
      // TODO: fill in the real "Create Invoice" form once selectors are
      // confirmed. Needed at minimum: property address, landlord name/email/
      // phone, tier (property.afc_tier), and _tierPriceCents for that tier.
      void _tierPriceCents;
      throw new AfcFormNotConfirmedError('submitWarrantyPurchaseInvoice: Create Invoice form');
    });
  } catch (err) {
    console.error('[afc] submitWarrantyPurchaseInvoice failed:', err);
    return { ok: false, error: (err as Error).message };
  }
}

/**
 * Fires on each maintenance request submitted for a warranty_path='afc'
 * property. Logs into AFC, files the claim, generates a service invoice for
 * the property's afc_service_fee_cents amount. STUBBED pending confirmed
 * form selectors — see AfcFormNotConfirmedError.
 */
export async function submitClaimInvoice(maintenanceRequestId: string): Promise<AfcResult> {
  try {
    const admin = createSupabaseAdminClient();
    const { data: request, error } = await admin
      .from('maintenance_requests')
      .select(
        `id, title, description, category,
         tenant:users!maintenance_requests_tenant_id_fkey(full_name, email, phone),
         unit:units(unit_number, property:properties(id, name, address, afc_tier, afc_service_fee_cents))`
      )
      .eq('id', maintenanceRequestId)
      .single();
    if (error || !request) throw new Error(error?.message || 'maintenance request not found');
    const property = (request as any).unit?.property;
    if (!property?.afc_tier) throw new Error('property is not on the AFC warranty path');

    return await withAfcBrowser(async (page) => {
      await loginToAfc(page);
      await page.goto(AFC_INVOICE_URL, { waitUntil: 'domcontentloaded' });
      // TODO: fill in the real claim-filing + service-invoice form once
      // selectors are confirmed. Needed at minimum: property identifier,
      // issue description/category, tenant contact info, and the tenant's
      // service fee (property.afc_service_fee_cents — this one IS
      // landlord/tenant-facing, unlike the confidential tier pricing above).
      throw new AfcFormNotConfirmedError('submitClaimInvoice: claim + service invoice form');
    });
  } catch (err) {
    console.error('[afc] submitClaimInvoice failed:', err);
    return { ok: false, error: (err as Error).message };
  }
}
