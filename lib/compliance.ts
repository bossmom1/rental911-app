/**
 * lib/compliance.ts
 * Compliance item creation and county-specific checklists.
 * Called from addProperty action; also used by the compliance cron.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

type ComplianceStatusInit = 'not_on_file' | 'not_applicable';

interface ComplianceItemInput {
  type: string;
  status: ComplianceStatusInit;
}

/**
 * Auto-create compliance items for a property based on county and age.
 * Called immediately after the property row is inserted.
 * Non-throwing — logs on failure so addProperty still succeeds.
 */
export async function createComplianceItems(
  supabase: SupabaseClient,
  propertyId: string,
  county: string,
  municipality: string | null,
  leadPaintRequired: boolean
): Promise<void> {
  const items: ComplianceItemInput[] = [
    { type: 'rental_license', status: 'not_on_file' },
    { type: 'inspection_cert', status: 'not_on_file' },
  ];

  // Lead paint cert: only required for pre-1978 properties
  if (leadPaintRequired) {
    items.push({ type: 'lead_paint_cert', status: 'not_on_file' });
  } else {
    items.push({ type: 'lead_paint_cert', status: 'not_applicable' });
  }

  // County-specific items
  const countyNorm = county.toLowerCase();

  if (countyNorm.includes("prince george")) {
    // PG County: separate DPIE license and Tenant Bill of Rights on file
    items.push({ type: 'dpie_rental_license', status: 'not_on_file' });
    items.push({ type: 'pg_tenant_bill_of_rights', status: 'not_on_file' });
  }

  if (countyNorm.includes("charles")) {
    items.push({ type: 'smoke_co_cert', status: 'not_on_file' });
  }

  if (countyNorm.includes("st. mary") || countyNorm.includes("saint mary")) {
    items.push({ type: 'county_rental_registration', status: 'not_on_file' });
  }

  const rows = items.map((item) => ({
    property_id: propertyId,
    type: item.type,
    status: item.status,
    alert_sent: false,
  }));

  const { error } = await supabase.from('compliance_items').insert(rows);
  if (error) {
    console.error('[compliance] Failed to create compliance items:', error.message);
  }
}

/** Human-readable label for a compliance item type. */
export function complianceTypeLabel(type: string): string {
  const MAP: Record<string, string> = {
    rental_license: 'Rental License',
    inspection_cert: 'Inspection Certificate',
    lead_paint_cert: 'Lead Paint Certificate',
    dpie_rental_license: 'DPIE Rental License (PG County)',
    pg_tenant_bill_of_rights: 'PG Tenant Bill of Rights (on file)',
    smoke_co_cert: 'Smoke/CO Detector Certification',
    county_rental_registration: 'County Rental Registration',
  };
  return MAP[type] ?? type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Badge color for compliance status (Tailwind classes). */
export function complianceStatusClass(status: string): string {
  switch (status) {
    case 'current':       return 'bg-green-100 text-green-800';
    case 'expiring_soon': return 'bg-yellow-100 text-yellow-800';
    case 'expired':       return 'bg-red-100 text-red-800';
    case 'not_applicable': return 'bg-gray-100 text-gray-500';
    default:              return 'bg-gray-100 text-gray-700';  // not_on_file
  }
}

export function complianceStatusLabel(status: string): string {
  switch (status) {
    case 'current':        return 'Current';
    case 'expiring_soon':  return 'Expiring Soon';
    case 'expired':        return 'Expired';
    case 'not_on_file':    return 'Not on File';
    case 'not_applicable': return 'N/A';
    default:               return status;
  }
}
