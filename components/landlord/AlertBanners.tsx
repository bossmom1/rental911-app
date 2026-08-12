import Link from 'next/link';
import { cookies } from 'next/headers';
import { createSupabaseServerClient } from '@/lib/supabase';
import { complianceTypeLabel } from '@/lib/compliance';
import { fmtDate } from '@/lib/format';

/**
 * Live-queried alert banners for the landlord dashboard — not a stored
 * notification inbox (matches this app's existing pattern, e.g.
 * LimitedAccessBanner and the admin dashboard's live-count stat card).
 * Covers: compliance items expiring/expired (Step 3) and leases within 60
 * days of end_date that haven't been resolved yet (Step 4).
 */
export async function AlertBanners() {
  const supabase = createSupabaseServerClient(cookies());

  const [{ data: complianceRows }, { data: renewalRows }] = await Promise.all([
    supabase
      .from('compliance_items')
      .select('id, type, expiry_date, status, property:properties(name)')
      .in('status', ['expiring_soon', 'expired']),
    supabase
      .from('leases')
      .select(
        `id, end_date,
         tenant:users!leases_tenant_id_fkey(full_name),
         unit:units(unit_number, property:properties(name))`
      )
      .eq('status', 'active')
      .eq('renewal_alert_sent', true)
      .eq('is_month_to_month', false),
  ]);

  const compliance = (complianceRows ?? []) as any[];
  const renewals = (renewalRows ?? []) as any[];

  if (compliance.length === 0 && renewals.length === 0) return null;

  return (
    <div className="mb-6 space-y-3">
      {compliance.length > 0 && (
        <div className="rounded-xl border-l-4 border-l-[#DC2626] bg-red-50 px-4 py-3">
          <p className="font-display font-bold text-navy">
            {compliance.length} compliance item{compliance.length === 1 ? '' : 's'} need attention
          </p>
          <ul className="mt-1 space-y-0.5 text-ink">
            {compliance.slice(0, 4).map((c) => (
              <li key={c.id}>
                {c.property?.name ?? 'A property'} — {complianceTypeLabel(c.type)}{' '}
                {c.status === 'expired' ? 'expired' : 'expires'} {fmtDate(c.expiry_date)}
              </li>
            ))}
          </ul>
          <Link href="/landlord/properties" className="mt-1 inline-block text-navy underline">
            View properties
          </Link>
        </div>
      )}

      {renewals.length > 0 && (
        <div className="rounded-xl border-l-4 border-l-warning-yellow bg-warning-yellow/15 px-4 py-3">
          <p className="font-display font-bold text-navy">
            {renewals.length} lease{renewals.length === 1 ? '' : 's'} ending soon
          </p>
          <ul className="mt-1 space-y-0.5 text-ink">
            {renewals.slice(0, 4).map((l) => (
              <li key={l.id}>
                <Link href={`/landlord/tenants/${l.id}`} className="underline">
                  {l.tenant?.full_name ?? 'Tenant'} — {l.unit?.property?.name ?? 'Unit'}{' '}
                  {l.unit?.unit_number ? `#${l.unit.unit_number}` : ''}
                </Link>{' '}
                ends {fmtDate(l.end_date)}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
