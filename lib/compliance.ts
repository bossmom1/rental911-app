import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';

/**
 * Exact county-name literal used app-wide (components/landlord/AddForms.tsx,
 * components/landlord/OnboardingWizard.tsx). Note the RIGHT SINGLE QUOTATION
 * MARK (U+2019), not a straight apostrophe — a retyped straight quote here
 * would silently fail to match every Prince George's County property.
 */
export const PRINCE_GEORGES_COUNTY = 'Prince George’s';
export const CHARLES_COUNTY = 'Charles';
export const ST_MARYS_COUNTY = "St. Mary's";
export const CALVERT_COUNTY = 'Calvert';

/**
 * Counties the compliance system explicitly supports — i.e. every county
 * that either has its own checklist rules in buildChecklist() below (Charles,
 * Prince George's, St. Mary's) or is a named, planned addition (Calvert:
 * currently gets only the "all MD counties" base items, no county-specific
 * rules yet). Used to populate the /admin/compliance county filter with a
 * fixed list rather than deriving it from whichever counties happen to have
 * properties on file yet.
 */
export const SUPPORTED_COUNTIES = [
  CALVERT_COUNTY,
  CHARLES_COUNTY,
  PRINCE_GEORGES_COUNTY,
  ST_MARYS_COUNTY,
];

interface ComplianceItemDraft {
  type: string;
  status: 'not_on_file';
}

/** Human-readable labels for every compliance_items.type value this app creates. */
export const COMPLIANCE_ITEM_LABELS: Record<string, string> = {
  rental_license: 'Rental License',
  dpie_rental_license: 'DPIE Rental License',
  inspection_cert: 'Move-In/Move-Out Inspection Report',
  lead_paint_disclosure: 'Lead Paint Disclosure',
  lead_paint_cert: 'Lead Paint Certificate',
  county_rental_license: 'County Rental License',
  smoke_co_cert: 'Smoke/CO Detector Certification',
  charles_lead_paint_inspection_cert: 'Lead Paint Inspection Certificate',
  county_registration: 'County Rental Registration',
  tenant_bill_of_rights: 'Tenant Bill of Rights Acknowledgment',
};

export function complianceItemLabel(type: string | null | undefined): string {
  if (!type) return 'Compliance Item';
  return COMPLIANCE_ITEM_LABELS[type] ?? type.replace(/_/g, ' ');
}

/**
 * Builds the county-specific compliance checklist for a property. Mirrors the
 * backfill in supabase/migrations/0010_compliance_and_renewal.sql — keep the
 * two in sync if the county rules ever change.
 */
function buildChecklist(county: string, leadPaintRequired: boolean): ComplianceItemDraft[] {
  const items: ComplianceItemDraft[] = [{ type: 'inspection_cert', status: 'not_on_file' }];

  // Prince George's DPIE license replaces (not adds to) the base state license.
  if (county === PRINCE_GEORGES_COUNTY) {
    items.push({ type: 'dpie_rental_license', status: 'not_on_file' });
    items.push({ type: 'tenant_bill_of_rights', status: 'not_on_file' });
  } else {
    items.push({ type: 'rental_license', status: 'not_on_file' });
  }

  if (leadPaintRequired) {
    items.push({ type: 'lead_paint_disclosure', status: 'not_on_file' });
    items.push({ type: 'lead_paint_cert', status: 'not_on_file' });
  }

  if (county === CHARLES_COUNTY) {
    items.push({ type: 'county_rental_license', status: 'not_on_file' });
    items.push({ type: 'smoke_co_cert', status: 'not_on_file' });
    if (leadPaintRequired) {
      items.push({ type: 'charles_lead_paint_inspection_cert', status: 'not_on_file' });
    }
  }

  if (county === ST_MARYS_COUNTY) {
    items.push({ type: 'county_registration', status: 'not_on_file' });
  }

  return items;
}

/**
 * Creates the county-specific compliance_items rows for a newly added
 * property. Non-blocking: logs and swallows errors so a compliance-insert
 * hiccup never blocks property creation, matching this app's existing
 * fire-and-forget conventions (see lib/ghl.ts). Safe to call more than once
 * for the same property — upserts on (property_id, type).
 */
export async function createComplianceItems(
  supabase: SupabaseClient<Database>,
  propertyId: string,
  county: string,
  leadPaintRequired: boolean
): Promise<boolean> {
  try {
    const rows = buildChecklist(county, leadPaintRequired).map((item) => ({
      property_id: propertyId,
      type: item.type,
      status: item.status,
    }));
    const { error } = await supabase
      .from('compliance_items')
      .upsert(rows, { onConflict: 'property_id,type', ignoreDuplicates: true });
    if (error) throw error;
    return true;
  } catch (err) {
    console.error('[compliance] createComplianceItems failed (non-blocking):', err);
    return false;
  }
}
