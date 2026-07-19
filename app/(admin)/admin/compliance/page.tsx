import { cookies } from 'next/headers';
import { createSupabaseServerClient } from '@/lib/supabase';
import { PageHeader } from '@/components/ui/PortalShell';
import { DataTable, EmptyState } from '@/components/ui/EmptyState';
import { Badge } from '@/components/ui/Badge';
import { StatCard } from '@/components/ui/StatCard';
import { fmtDate } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function AdminCompliance() {
  const supabase = createSupabaseServerClient(cookies());
  const { data } = await supabase
    .from('compliance_items')
    .select('*, property:properties(name, county)')
    .order('expiry_date', { ascending: true });

  const rows = (data ?? []) as any[];
  const expiring = rows.filter((r) => r.status === 'expiring_soon').length;
  const expired = rows.filter((r) => r.status === 'expired').length;
  const notOnFile = rows.filter((r) => r.status === 'not_on_file').length;

  return (
    <>
      <PageHeader
        title="Compliance"
        subtitle="Maryland rental license, lead paint, and inspection tracking."
      />

      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard tone="red" label="Expiring Soon" value={expiring} sublabel="within 30 days" />
        <StatCard tone="red" label="Expired" value={expired} />
        <StatCard tone="gold" label="Not On File" value={notOnFile} />
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title="No compliance items yet"
          message="Compliance items are created as properties and licenses are added. (Full compliance automation lands in Phase 4.)"
        />
      ) : (
        <DataTable columns={['Property', 'County', 'Type', 'Status', 'Expiry', 'Notes']}>
          {rows.map((c) => (
            <tr key={c.id}>
              <td className="px-4 py-3 font-display font-bold text-navy">
                {c.property?.name ?? '—'}
              </td>
              <td className="px-4 py-3">{c.property?.county ?? '—'}</td>
              <td className="px-4 py-3 capitalize">
                {(c.type ?? '').replace(/_/g, ' ') || '—'}
              </td>
              <td className="px-4 py-3">
                <Badge value={c.status} />
              </td>
              <td className="px-4 py-3">{fmtDate(c.expiry_date)}</td>
              <td className="px-4 py-3 text-ink/70">{c.notes ?? '—'}</td>
            </tr>
          ))}
        </DataTable>
      )}
    </>
  );
}
