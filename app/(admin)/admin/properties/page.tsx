import { cookies } from 'next/headers';
import { createSupabaseServerClient } from '@/lib/supabase';
import { PageHeader } from '@/components/ui/PortalShell';
import { DataTable, EmptyState } from '@/components/ui/EmptyState';
import { Badge } from '@/components/ui/Badge';
import { fmtDate } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function AdminProperties() {
  const supabase = createSupabaseServerClient(cookies());
  const { data: properties } = await supabase
    .from('properties')
    .select('*, landlord:users(full_name, email), units(count)')
    .order('created_at', { ascending: false });

  const rows = properties ?? [];

  return (
    <>
      <PageHeader
        title="Properties"
        subtitle="Every property across all landlords on the platform."
      />
      {rows.length === 0 ? (
        <EmptyState
          title="No properties yet"
          message="Properties added by landlords during onboarding will appear here."
        />
      ) : (
        <DataTable
          columns={[
            'Property',
            'Landlord',
            'County',
            'Units',
            'License',
            'Lead Paint',
          ]}
        >
          {rows.map((p) => {
            // units(count) comes back as [{ count }]
            const unitCount =
              Array.isArray(p.units) && p.units.length > 0
                ? (p.units[0] as { count: number }).count
                : p.unit_count ?? 0;
            const landlord = p.landlord as
              | { full_name: string | null; email: string }
              | null;
            return (
              <tr key={p.id}>
                <td className="px-4 py-3">
                  <p className="font-display font-bold text-navy">
                    {p.name || p.address || 'Unnamed property'}
                  </p>
                  <p className="text-ink/60">
                    {[p.city, p.state, p.zip].filter(Boolean).join(', ')}
                  </p>
                </td>
                <td className="px-4 py-3">
                  {landlord?.full_name || landlord?.email || '—'}
                </td>
                <td className="px-4 py-3">{p.county || '—'}</td>
                <td className="px-4 py-3">{unitCount}</td>
                <td className="px-4 py-3">
                  {p.rental_license_number ? (
                    <span>
                      {p.rental_license_number}
                      <span className="block text-ink/60">
                        exp {fmtDate(p.rental_license_expiry)}
                      </span>
                    </span>
                  ) : (
                    <span className="text-ink/50">Not on file</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  {p.lead_paint_required ? (
                    <Badge value="required" />
                  ) : (
                    <span className="text-ink/50">—</span>
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
