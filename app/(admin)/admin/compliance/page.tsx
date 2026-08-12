import Link from 'next/link';
import { cookies } from 'next/headers';
import { createSupabaseServerClient } from '@/lib/supabase';
import { PageHeader } from '@/components/ui/PortalShell';
import { DataTable, EmptyState } from '@/components/ui/EmptyState';
import { complianceTypeLabel, complianceStatusClass, complianceStatusLabel } from '@/lib/compliance';

export const dynamic = 'force-dynamic';

export default async function AdminCompliancePage({
  searchParams,
}: {
  searchParams: { county?: string; status?: string };
}) {
  const supabase = createSupabaseServerClient(cookies());

  // Fetch all compliance items with their property + landlord info
  let query = supabase
    .from('compliance_items')
    .select(`
      id, type, status, expiry_date, alert_sent, updated_at,
      property:properties (
        id, name, address, county,
        landlord:users!properties_landlord_id_fkey (full_name, email)
      )
    `)
    .order('expiry_date', { ascending: true, nullsFirst: false });

  const { data: items } = await query;
  const rows = items ?? [];

  // Filter in JS (simpler than chaining Supabase filters on nested relations)
  const filtered = rows.filter((item) => {
    const prop = item.property as any;
    if (searchParams.county && prop?.county !== searchParams.county) return false;
    if (searchParams.status && item.status !== searchParams.status) return false;
    return true;
  });

  // Count expiring within 30 days for the stat card
  const today = new Date();
  const in30 = new Date(today);
  in30.setDate(today.getDate() + 30);
  const expiringCount = rows.filter((r) => {
    if (!r.expiry_date) return false;
    const d = new Date(r.expiry_date);
    return d >= today && d <= in30;
  }).length;

  // Unique counties for filter bar
  const counties = Array.from(
    new Set(
      rows
        .map((r) => (r.property as any)?.county)
        .filter(Boolean)
    )
  ).sort();

  const statusOptions = [
    'current',
    'expiring_soon',
    'expired',
    'not_on_file',
    'not_applicable',
  ];

  return (
    <>
      <PageHeader
        title="Compliance Dashboard"
        subtitle="All properties and their compliance item statuses."
      />

      {/* Expiring stat card */}
      {expiringCount > 0 && (
        <div className="mb-6 rounded-lg bg-red-50 border border-red-200 px-4 py-3 flex items-center gap-3">
          <span className="text-red-600 font-bold text-lg">{expiringCount}</span>
          <span className="text-red-700 font-medium">
            compliance item{expiringCount !== 1 ? 's' : ''} expiring within 30 days
          </span>
        </div>
      )}

      {/* Filter bar */}
      <form className="mb-4 flex flex-wrap gap-3 items-center" method="GET">
        <select
          name="county"
          defaultValue={searchParams.county ?? ''}
          className="rounded border border-gray-300 px-3 py-1.5 text-sm"
        >
          <option value="">All Counties</option>
          {counties.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select
          name="status"
          defaultValue={searchParams.status ?? ''}
          className="rounded border border-gray-300 px-3 py-1.5 text-sm"
        >
          <option value="">All Statuses</option>
          {statusOptions.map((s) => (
            <option key={s} value={s}>
              {complianceStatusLabel(s)}
            </option>
          ))}
        </select>
        <button
          type="submit"
          className="rounded bg-navy px-4 py-1.5 text-sm font-bold text-white"
        >
          Filter
        </button>
        {(searchParams.county || searchParams.status) && (
          <Link href="/admin/compliance" className="text-sm text-navy underline">
            Clear
          </Link>
        )}
      </form>

      {filtered.length === 0 ? (
        <EmptyState
          title="No compliance items found"
          message="Items are auto-created when properties are added. Add a property to get started."
        />
      ) : (
        <DataTable
          columns={[
            'Property',
            'County',
            'Landlord',
            'Item',
            'Status',
            'Expires',
            'Alert Sent',
          ]}
        >
          {filtered.map((item) => {
            const prop = item.property as any;
            const landlord = prop?.landlord as any;
            return (
              <tr key={item.id}>
                <td className="px-4 py-3">
                  <Link
                    href={`/admin/compliance/${prop?.id}`}
                    className="font-display font-bold text-navy underline"
                  >
                    {prop?.name || prop?.address || '—'}
                  </Link>
                  <p className="text-xs text-ink/60">{prop?.address}</p>
                </td>
                <td className="px-4 py-3 text-sm">{prop?.county || '—'}</td>
                <td className="px-4 py-3 text-sm">
                  <p>{landlord?.full_name || '—'}</p>
                  <p className="text-xs text-ink/60">{landlord?.email}</p>
                </td>
                <td className="px-4 py-3 text-sm">{complianceTypeLabel(item.type ?? '')}</td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${complianceStatusClass(item.status ?? '')}`}
                  >
                    {complianceStatusLabel(item.status ?? '')}
                  </span>
                </td>
                <td className="px-4 py-3 text-sm">
                  {item.expiry_date
                    ? new Date(item.expiry_date).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })
                    : '—'}
                </td>
                <td className="px-4 py-3 text-sm">
                  {item.alert_sent ? (
                    <span className="text-green-700">✓ Yes</span>
                  ) : (
                    <span className="text-ink/50">No</span>
                  )}
                </td>
              </tr>
            );
          })}
        </DataTable>
      )}
    </>
  );
}
