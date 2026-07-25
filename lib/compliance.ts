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
 * Prince George's, St. Mary's, Calvert) or is a named, planned addition.
 * Used to populate the /admin/compliance county filter with a fixed list
 * rather than deriving it from whichever counties happen to have properties
 * on file yet.
 */
export const SUPPORTED_COUNTIES = [
  CALVERT_COUNTY,
  CHARLES_COUNTY,
  PRINCE_GEORGES_COUNTY,
  ST_MARYS_COUNTY,
];

/**
 * Charles County incorporated towns confirmed to run their own rental
 * licensing (the county itself does not). Anything else in Charles County —
 * blank municipality or an unlisted town — gets no license item until
 * researched.
 */
export const CHARLES_TOWN_LICENSE_MUNICIPALITIES = ['La Plata', 'Indian Head'];

/**
 * Prince George's County's 17 self-licensing municipalities — towns that run
 * their own rental licensing program instead of going through the county's
 * DPIE license. (Note: the list as given enumerates 18 names; kept verbatim
 * rather than silently dropping one — worth confirming the exact roster.)
 */
export const PG_SELF_LICENSED_MUNICIPALITIES = [
  'Berwyn Heights',
  'Bowie',
  'Brentwood',
  'Capitol Heights',
  'Cheverly',
  'College Park',
  'District Heights',
  'Edmonston',
  'Forest Heights',
  'Greenbelt',
  'Hyattsville',
  'Landover Hills',
  'Mount Rainier',
  'New Carrollton',
  'Riverdale Park',
  'Seat Pleasant',
  'Town of Laurel',
  'University Park',
];

function normalizeMunicipality(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase();
}

function municipalityIn(municipality: string | null | undefined, list: string[]): boolean {
  const normalized = normalizeMunicipality(municipality);
  if (!normalized) return false;
  return list.some((m) => m.toLowerCase() === normalized);
}

/**
 * Whether a property is in one of Prince George's County's self-licensing
 * towns — these get a Municipal Rental License item instead of DPIE, and are
 * flagged with a distinct badge in the admin compliance UI (see
 * components/ui/SelfLicensedMunicipalityBadge.tsx) so admin can see at a
 * glance which properties don't go through DPIE.
 */
export function isPgSelfLicensedMunicipality(
  county: string | null | undefined,
  municipality: string | null | undefined
): boolean {
  if (county !== PRINCE_GEORGES_COUNTY) return false;
  return municipalityIn(municipality, PG_SELF_LICENSED_MUNICIPALITIES);
}

function isCharlesTownWithLicense(municipality: string | null | undefined): boolean {
  return municipalityIn(municipality, CHARLES_TOWN_LICENSE_MUNICIPALITIES);
}

interface ComplianceItemDraft {
  type: string;
  status: 'not_on_file';
}

/** Human-readable labels for every compliance_items.type value this app creates. */
export const COMPLIANCE_ITEM_LABELS: Record<string, string> = {
  rental_license: 'Rental License',
  dpie_rental_license: 'DPIE Rental License',
  municipal_rental_license: 'Municipal Rental License',
  town_rental_license: 'Town Rental License',
  inspection_cert: 'Move-In/Move-Out Inspection Report',
  lead_paint_disclosure: 'Lead Paint Disclosure',
  lead_paint_cert: 'Lead Paint Certificate',
  county_rental_license: 'County Rental License',
  smoke_co_cert: 'Smoke/CO Detector Certification',
  charles_lead_paint_inspection_cert: 'Lead Paint Inspection Certificate',
  county_registration: 'County Rental Registration',
  tenant_bill_of_rights: 'Tenant Bill of Rights Acknowledgment',
  minimum_livability_code: 'Meets Minimum Livability Code',
};

export function complianceItemLabel(type: string | null | undefined): string {
  if (!type) return 'Compliance Item';
  return COMPLIANCE_ITEM_LABELS[type] ?? type.replace(/_/g, ' ');
}

/**
 * Builds the county/municipality-specific compliance checklist for a
 * property.
 *
 * License item, by county:
 *  - Charles: no county-level license (the county doesn't require one).
 *    Only La Plata / Indian Head properties get a Town Rental License; any
 *    other municipality (or none) gets no license item until researched.
 *  - St. Mary's: rental_license (confirmed county requirement). No separate
 *    county-registration item — no confirmed requirement for one exists.
 *  - Prince George's: DPIE Rental License, UNLESS the property is in one of
 *    the 17 self-licensing towns, which get a Municipal Rental License
 *    instead (never both). Tenant Bill of Rights applies regardless.
 *  - Calvert: no license — Chapter 75 (Minimum Livability Code) uses an
 *    inspection/citation model, not upfront licensing — instead gets a
 *    "Meets Minimum Livability Code" item.
 *  - Anything else: no license item (unresearched).
 *
 * NOTE: supabase/migrations/0010's one-time backfill predates all of this
 * (Calvert license removal, municipality rules) and was not retroactively
 * corrected — existing properties keep whatever items they already have.
 * Only new properties created via createComplianceItems() get the current
 * rules.
 */
function buildChecklist(
  county: string,
  municipality: string | null,
  leadPaintRequired: boolean
): ComplianceItemDraft[] {
  const items: ComplianceItemDraft[] = [{ type: 'inspection_cert', status: 'not_on_file' }];

  if (county === ST_MARYS_COUNTY) {
    items.push({ type: 'rental_license', status: 'not_on_file' });
  } else if (county === PRINCE_GEORGES_COUNTY) {
    if (isPgSelfLicensedMunicipality(county, municipality)) {
      items.push({ type: 'municipal_rental_license', status: 'not_on_file' });
    } else {
      items.push({ type: 'dpie_rental_license', status: 'not_on_file' });
    }
    items.push({ type: 'tenant_bill_of_rights', status: 'not_on_file' });
  } else if (county === CHARLES_COUNTY) {
    if (isCharlesTownWithLicense(municipality)) {
      items.push({ type: 'town_rental_license', status: 'not_on_file' });
    }
  } else if (county === CALVERT_COUNTY) {
    items.push({ type: 'minimum_livability_code', status: 'not_on_file' });
  }

  if (leadPaintRequired) {
    items.push({ type: 'lead_paint_disclosure', status: 'not_on_file' });
    items.push({ type: 'lead_paint_cert', status: 'not_on_file' });
  }

  // Applies to every Charles County property regardless of municipality/
  // license status.
  if (county === CHARLES_COUNTY) {
    items.push({ type: 'smoke_co_cert', status: 'not_on_file' });
    if (leadPaintRequired) {
      items.push({ type: 'charles_lead_paint_inspection_cert', status: 'not_on_file' });
    }
  }

  return items;
}

/**
 * Creates the county/municipality-specific compliance_items rows for a newly
 * added property. Non-blocking: logs and swallows errors so a
 * compliance-insert hiccup never blocks property creation, matching this
 * app's existing fire-and-forget conventions (see lib/ghl.ts). Safe to call
 * more than once for the same property — upserts on (property_id, type).
 */
export async function createComplianceItems(
  supabase: SupabaseClient<Database>,
  propertyId: string,
  county: string,
  municipality: string | null,
  leadPaintRequired: boolean
): Promise<boolean> {
  try {
    const rows = buildChecklist(county, municipality, leadPaintRequired).map((item) => ({
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
