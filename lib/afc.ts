import type { Page } from 'playwright-core';
import { createSupabaseAdminClient } from '@/lib/supabase';
import { withAfcBrowser } from '@/lib/afc-browser';
import { sendAfcManualClaimEmail } from '@/lib/email';
import { fmtMoney } from '@/lib/format';
import type { AfcClaimInvoiceStatus, AfcTier } from '@/types/database';

const AFC_LOGIN_URL = 'https://afchomeclub.com/login'; // confirmed against real portal — redirects to /realtor/home on success
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

/** Step 1 plan-tile label text, confirmed against the real "Create Invoice" page. */
const AFC_TIER_LABELS: Record<AfcTier, string> = {
  diamond: 'Diamond',
  platinum: 'Platinum',
};

/** Step 1 service-fee tile label text, keyed by properties.afc_service_fee_cents. */
const AFC_SERVICE_FEE_LABELS: Record<number, string> = {
  7500: '$75',
  10000: '$100',
  12500: '$125',
};

function afcCredentials(): { email: string; password: string } {
  const email = process.env.AFC_REALTOR_EMAIL;
  const password = process.env.AFC_REALTOR_PASSWORD;
  if (!email || !password) {
    throw new Error('AFC_REALTOR_EMAIL / AFC_REALTOR_PASSWORD is not set');
  }
  return { email, password };
}

function formatMMDDYYYY(date: Date): string {
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(date.getUTCDate()).padStart(2, '0');
  return `${mm}/${dd}/${date.getUTCFullYear()}`;
}

/**
 * Logs into the AFC Home Club realtor portal. URL and field selectors
 * confirmed against the real page with live credentials — lands on
 * /realtor/home on success.
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
 * Step 1 of the "Create Invoice" flow: click the plan tile matching the
 * property's tier, then the service-fee tile matching its stored deductible
 * (the fee tile changes the final invoice total — e.g. Platinum + $75 fee =
 * $850 total, Platinum + $125 fee = $750 total — so this must match the
 * property's actual afc_service_fee_cents, not just the plan). "Select
 * Additional Coverage" checkboxes are left untouched (unused by our flow).
 */
async function selectPlanAndFee(page: Page, tier: AfcTier, serviceFeeCents: number): Promise<void> {
  const tierLabel = AFC_TIER_LABELS[tier];
  const feeLabel = AFC_SERVICE_FEE_LABELS[serviceFeeCents];
  if (!feeLabel) throw new Error(`Unrecognized afc_service_fee_cents: ${serviceFeeCents}`);

  await page.getByText(tierLabel, { exact: false }).first().click();
  await page.getByText('Select A Service Fee', { exact: false }).waitFor();
  await page.getByText(feeLabel, { exact: false }).first().click();

  // Button label is dynamic ("Proceed With Diamond Plan" / "Proceed With Platinum Plan").
  await page.getByRole('button', { name: /proceed with .* plan/i }).click();
}

interface AfcBuyerInfo {
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  propertyAddress: string; // single field, not split into address/city/state/zip
  closingDate: string; // mm/dd/yyyy
  invoiceRecipientEmail: string;
}

/** Step 2: "Home Buyer Information" + "Emails To Receive Invoice" (Primary Recipient only — the two optional Additional Recipients are left blank). */
async function fillBuyerInformation(page: Page, input: AfcBuyerInfo): Promise<void> {
  await page.getByLabel('First Name', { exact: false }).fill(input.firstName);
  await page.getByLabel('Last Name', { exact: false }).fill(input.lastName);
  await page.getByLabel('Primary Phone', { exact: false }).fill(input.phone);
  await page.getByLabel('Email Address', { exact: true }).fill(input.email);
  await page.getByLabel('Property Address', { exact: false }).fill(input.propertyAddress);
  // Date picker — .fill() assumes it accepts direct typed input in mm/dd/yyyy;
  // if the real widget requires calendar-click interaction instead, this will
  // need to change to an explicit click-through of the picker.
  await page.getByLabel('Estimated Closing Date', { exact: false }).fill(input.closingDate);
  await page.getByLabel('Primary Recipient', { exact: false }).fill(input.invoiceRecipientEmail);
  await page.getByRole('button', { name: /generate invoice/i }).click();
}

/**
 * The post-submit confirmation state has never been observed, so success is
 * NOT assumed just because no error was thrown during fill/click — this
 * looks for plausible confirmation signals on the resulting page and treats
 * anything else as unconfirmed (caller surfaces this as a failure requiring
 * manual verification, not a silent success).
 */
async function confirmInvoiceGenerated(page: Page): Promise<boolean> {
  try {
    await page.waitForLoadState('networkidle', { timeout: 15000 });
  } catch {
    // Some SPAs never go fully idle — fall through to the content check below.
  }
  const bodyText = (await page.textContent('body')) ?? '';
  const confirmationPatterns = [/invoice.*(created|generated|sent)/i, /thank you/i, /confirmation/i];
  return confirmationPatterns.some((pattern) => pattern.test(bodyText));
}

export interface AfcResult {
  ok: boolean;
  error?: string;
  /** Explicit status override for the caller to persist — e.g. 'pending_manual' (see submitClaimInvoice). */
  status?: AfcClaimInvoiceStatus;
}

/**
 * Fires once, when a property is set to warranty_path='afc' with a tier.
 * Logs into AFC, submits the property/landlord details via the confirmed
 * "Create Invoice" two-step form, generates the warranty-purchase invoice.
 *
 * ASSUMPTION flagged for confirmation: "Estimated Closing Date" is a required
 * field on a form built around real-estate closings, which doesn't map
 * cleanly to buying a warranty for an already-owned rental — this defaults
 * to today's date. Correct this if there's a more appropriate date.
 */
export async function submitWarrantyPurchaseInvoice(propertyId: string): Promise<AfcResult> {
  try {
    const admin = createSupabaseAdminClient();
    const { data: property, error } = await admin
      .from('properties')
      .select(
        'id, name, address, city, state, zip, afc_tier, afc_service_fee_cents, landlord:users(full_name, email, phone)'
      )
      .eq('id', propertyId)
      .single();
    if (error || !property) throw new Error(error?.message || 'property not found');
    if (!property.afc_tier) throw new Error('property has no afc_tier set');
    if (!property.afc_service_fee_cents) throw new Error('property has no afc_service_fee_cents set');

    // Confidential — never logged, never returned. Not used in the form fill
    // itself (AFC's own tile computes the total from the plan + fee clicks),
    // kept here only as the documented source of truth for this tier's price.
    const _tierPriceCents = AFC_TIER_PRICING_CENTS[property.afc_tier as AfcTier];
    void _tierPriceCents;

    const landlord = property.landlord as unknown as {
      full_name: string | null;
      email: string | null;
      phone: string | null;
    } | null;
    if (!landlord?.email) throw new Error('landlord has no email on file');

    const [firstName, ...rest] = (landlord.full_name || '').trim().split(/\s+/).filter(Boolean);
    const lastName = rest.join(' ');
    const propertyAddress = [property.address, property.city, property.state, property.zip]
      .filter(Boolean)
      .join(', ');

    return await withAfcBrowser(async (page) => {
      await loginToAfc(page);
      await page.goto(AFC_INVOICE_URL, { waitUntil: 'domcontentloaded' });

      await selectPlanAndFee(page, property.afc_tier as AfcTier, property.afc_service_fee_cents!);

      await page.getByText('Home Buyer Information', { exact: false }).waitFor();
      await fillBuyerInformation(page, {
        firstName: firstName || 'Landlord',
        lastName: lastName || '—',
        phone: landlord.phone || '',
        email: landlord.email!,
        propertyAddress,
        closingDate: formatMMDDYYYY(new Date()),
        invoiceRecipientEmail: landlord.email!,
      });

      const confirmed = await confirmInvoiceGenerated(page);
      if (!confirmed) {
        throw new Error(
          'Submitted the Create Invoice form, but could not confirm success on the ' +
            'resulting page (confirmation state has never been observed) — verify ' +
            'manually on afchomeclub.com/realtor/invoice.'
        );
      }
      return { ok: true };
    });
  } catch (err) {
    console.error('[afc] submitWarrantyPurchaseInvoice failed:', err);
    return { ok: false, error: (err as Error).message };
  }
}

/**
 * Fires on each maintenance request submitted for a warranty_path='afc'
 * property.
 *
 * INTERIM MANUAL FALLBACK (Christine-approved): AFC's own "Request Service"
 * claim form (afchomeclub.com/service) is currently broken on their end
 * (loops to login, no ETA) — no automation is attempted here. Instead this
 * emails every admin user the claim details (property, tenant, landlord,
 * plan tier, deductible, issue) plus AFC's Service line (770-973-2400 /
 * service@afchomeclub.com) to file it manually, and reports back
 * `status: 'pending_manual'` for the caller to persist. An admin then marks
 * it submitted from /admin/afc-claims once filed
 * (app/(admin)/admin/afc-claims/actions.ts).
 *
 * When AFC's Request Service form is fixed and its fields get mapped, this
 * function swaps back to real headless-browser automation (same shape as
 * submitWarrantyPurchaseInvoice above) — the caller-side status handling
 * already understands both outcomes, so no other rework is needed.
 */
export async function submitClaimInvoice(maintenanceRequestId: string): Promise<AfcResult> {
  try {
    const admin = createSupabaseAdminClient();
    const { data: request, error } = await admin
      .from('maintenance_requests')
      .select(
        `id, title, description, category,
         tenant:users!maintenance_requests_tenant_id_fkey(full_name, email, phone),
         unit:units(
           unit_number,
           property:properties(
             id, name, address, afc_tier, afc_service_fee_cents,
             landlord:users(full_name)
           )
         )`
      )
      .eq('id', maintenanceRequestId)
      .single();
    if (error || !request) throw new Error(error?.message || 'maintenance request not found');

    const tenant = (request as any).tenant as
      | { full_name: string | null; email: string | null; phone: string | null }
      | null;
    const property = (request as any).unit?.property;
    const landlord = property?.landlord as { full_name: string | null } | null;
    if (!property?.afc_tier) throw new Error('property is not on the AFC warranty path');

    const { data: admins } = await admin.from('users').select('email').eq('role', 'admin');
    const adminEmails = (admins ?? []).map((a) => a.email).filter(Boolean) as string[];

    const tenantContact =
      [tenant?.phone, tenant?.email].filter(Boolean).join(' / ') || 'no contact on file';
    const issueSummary =
      [request.title, request.category, request.description].filter(Boolean).join(' — ') ||
      'No description provided';

    if (adminEmails.length) {
      await sendAfcManualClaimEmail({
        to: adminEmails,
        propertyAddress: property.address || property.name || 'Unknown property',
        tenantName: tenant?.full_name || 'Tenant',
        tenantContact,
        landlordName: landlord?.full_name || 'Landlord',
        afcTier: AFC_TIER_LABELS[property.afc_tier as AfcTier] ?? property.afc_tier,
        deductible: fmtMoney((property.afc_service_fee_cents ?? 0) / 100),
        issueSummary,
      });
    } else {
      console.warn('[afc] submitClaimInvoice: no admin users found to notify');
    }

    return { ok: true, status: 'pending_manual' };
  } catch (err) {
    console.error('[afc] submitClaimInvoice failed:', err);
    return { ok: false, error: (err as Error).message };
  }
}
