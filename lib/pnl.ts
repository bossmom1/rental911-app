import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';
import { fetchPaymentRows, fetchActiveLeaseRents } from '@/lib/financials';

export type PnlPeriod = 'month' | 'quarter' | 'year';

export interface PeriodRange {
  start: string; // inclusive, YYYY-MM-DD
  end: string; // inclusive, YYYY-MM-DD
  monthsInPeriod: number;
  label: string;
}

function toDateStr(y: number, m: number, d: number): string {
  return `${String(y).padStart(4, '0')}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** Parses a `period` query/search param, defaulting to 'month' for anything else. */
export function parsePeriod(value: string | null | undefined): PnlPeriod {
  return value === 'quarter' || value === 'year' ? value : 'month';
}

/** UTC-based period boundaries (avoids the local-timezone off-by-one that plain `date` columns are prone to, see lib/format.ts). */
export function periodRange(period: PnlPeriod, referenceDate: Date): PeriodRange {
  const y = referenceDate.getUTCFullYear();
  const m = referenceDate.getUTCMonth(); // 0-11

  if (period === 'year') {
    return { start: toDateStr(y, 0, 1), end: toDateStr(y, 11, 31), monthsInPeriod: 12, label: `${y}` };
  }

  if (period === 'quarter') {
    const qStartMonth = Math.floor(m / 3) * 3;
    const lastDay = new Date(Date.UTC(y, qStartMonth + 3, 0)); // day 0 of the month after = last day of the 3rd month
    return {
      start: toDateStr(y, qStartMonth, 1),
      end: toDateStr(lastDay.getUTCFullYear(), lastDay.getUTCMonth(), lastDay.getUTCDate()),
      monthsInPeriod: 3,
      label: `Q${Math.floor(qStartMonth / 3) + 1} ${y}`,
    };
  }

  const lastDay = new Date(Date.UTC(y, m + 1, 0)); // last day of this month
  return {
    start: toDateStr(y, m, 1),
    end: toDateStr(lastDay.getUTCFullYear(), lastDay.getUTCMonth(), lastDay.getUTCDate()),
    monthsInPeriod: 1,
    label: referenceDate.toLocaleDateString('en-US', { year: 'numeric', month: 'long', timeZone: 'UTC' }),
  };
}

export interface PnlUnitRow {
  unitId: string;
  unitNumber: string | null;
  rentDue: number;
  rentCollected: number;
  outstanding: number;
  netToLandlord: number;
}

export interface PnlPropertyRow {
  propertyId: string;
  propertyName: string;
  units: PnlUnitRow[];
  rentDue: number;
  rentCollected: number;
  outstanding: number;
  netToLandlord: number;
}

export interface PnlReport {
  period: PnlPeriod;
  range: PeriodRange;
  properties: PnlPropertyRow[];
  totals: { rentDue: number; rentCollected: number; outstanding: number; netToLandlord: number };
}

/**
 * Builds the per-property, per-unit P&L for a period. RLS-scoped via the
 * caller's supabase client (admin sees all properties, landlord sees own).
 *
 * `landlordId` narrows an admin's (already platform-wide) view down to one
 * landlord — e.g. /admin/landlords/[landlordId]/financials/reports. It has
 * no effect for a landlord's own client: RLS already restricts them to their
 * own data regardless of what's passed here, so passing landlordId there
 * would be a no-op at best — callers should simply omit it for that path.
 *
 * Rent Due comes from active leases' monthly_rent × months-in-period — it
 * cannot be derived from rent_payments (which only records what was actually
 * charged). Net to Landlord equals Rent Collected: rent_payments.amount
 * already excludes the tenant-side surcharge passthrough (tracked separately
 * as surcharge_amount/total_charged), and Rental911 takes no platform fee
 * from rent (see migration 0002 / "Remove the platform fee from rent
 * payments"), so there's nothing further to subtract.
 */
export async function buildPnlReport(
  supabase: SupabaseClient<Database>,
  period: PnlPeriod,
  referenceDate: Date,
  landlordId?: string
): Promise<PnlReport> {
  const range = periodRange(period, referenceDate);
  const [leaseRents, paymentRows] = await Promise.all([
    fetchActiveLeaseRents(supabase, landlordId),
    fetchPaymentRows(supabase, landlordId),
  ]);

  const paidInRange = paymentRows.filter(
    (r) => r.status === 'paid' && r.paid_date && r.paid_date >= range.start && r.paid_date <= range.end
  );

  const byProperty = new Map<string, PnlPropertyRow>();

  function getProperty(id: string, name: string): PnlPropertyRow {
    let prop = byProperty.get(id);
    if (!prop) {
      prop = {
        propertyId: id,
        propertyName: name,
        units: [],
        rentDue: 0,
        rentCollected: 0,
        outstanding: 0,
        netToLandlord: 0,
      };
      byProperty.set(id, prop);
    }
    return prop;
  }

  function getUnit(prop: PnlPropertyRow, unitId: string, unitNumber: string | null): PnlUnitRow {
    let unit = prop.units.find((u) => u.unitId === unitId);
    if (!unit) {
      unit = { unitId, unitNumber, rentDue: 0, rentCollected: 0, outstanding: 0, netToLandlord: 0 };
      prop.units.push(unit);
    }
    return unit;
  }

  for (const lr of leaseRents) {
    if (!lr.property_id) continue;
    const prop = getProperty(lr.property_id, lr.property_name ?? 'Property');
    const due = Number(lr.monthly_rent ?? 0) * range.monthsInPeriod;
    prop.rentDue += due;
    if (lr.unit_id) {
      getUnit(prop, lr.unit_id, lr.unit_number).rentDue += due;
    }
  }

  for (const r of paidInRange) {
    if (!r.property_id) continue;
    const prop = getProperty(r.property_id, r.property_name ?? 'Property');
    const collected = Number(r.amount ?? 0);
    prop.rentCollected += collected;
    if (r.unit_id) {
      getUnit(prop, r.unit_id, r.unit_number).rentCollected += collected;
    }
  }

  const properties = Array.from(byProperty.values())
    .map((p) => {
      p.outstanding = p.rentDue - p.rentCollected;
      p.netToLandlord = p.rentCollected;
      for (const u of p.units) {
        u.outstanding = u.rentDue - u.rentCollected;
        u.netToLandlord = u.rentCollected;
      }
      p.units.sort((a, b) => (a.unitNumber ?? '').localeCompare(b.unitNumber ?? ''));
      return p;
    })
    .sort((a, b) => a.propertyName.localeCompare(b.propertyName));

  const totals = properties.reduce(
    (acc, p) => ({
      rentDue: acc.rentDue + p.rentDue,
      rentCollected: acc.rentCollected + p.rentCollected,
      outstanding: acc.outstanding + p.outstanding,
      netToLandlord: acc.netToLandlord + p.netToLandlord,
    }),
    { rentDue: 0, rentCollected: 0, outstanding: 0, netToLandlord: 0 }
  );

  return { period, range, properties, totals };
}
