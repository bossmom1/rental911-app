import { cookies } from 'next/headers';
import { createSupabaseServerClient } from '@/lib/supabase';
import { PageHeader } from '@/components/ui/PortalShell';
import { DataTable, EmptyState } from '@/components/ui/EmptyState';
import { Badge } from '@/components/ui/Badge';
import { fmtMoney } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function AdminTenants() {
  const supabase = createSupabaseServerClient(cookies());

  const { data: tenants } = await supabase
    .from('users')
    .select('*')
    .eq('role', 'tenant')
    .order('created_at', { ascending: false });

  const tenantIds = (tenants ?? []).map((t) => t.id);
  const { data: leases } = tenantIds.length
    ? await supabase
        .from('leases')
        .select(
          'id, tenant_id, status, monthly_rent, unit:units(unit_number, property:properties(name))'
        )
        .in('tenant_id', tenantIds)
    : { data: [] as any[] };

  const leaseByTenant = new Map<string, any>();
  for (const l of (leases ?? []) as any[]) {
    if (!leaseByTenant.has(l.tenant_id)) leaseByTenant.set(l.tenant_id, l);
  }

  const rows = tenants ?? [];

  return (
    <>
      <PageHeader
        title="Tenants"
        subtitle="All tenant accounts and their current lease."
      />
      {rows.length === 0 ? (
        <EmptyState
          title="No tenants yet"
          message="Tenants added by landlords will appear here."
        />
      ) : (
        <DataTable columns={['Tenant', 'Unit', 'Rent', 'Lease']}>
          {rows.map((t) => {
            const lease = leaseByTenant.get(t.id) as any;
            const unit = lease?.unit;
            const property = unit?.property;
            return (
              <tr key={t.id}>
                <td className="px-4 py-3">
                  <p className="font-display font-bold text-navy">
                    {t.full_name || '—'}
                  </p>
                  <p className="text-ink/60">{t.email}</p>
                </td>
                <td className="px-4 py-3">
                  {unit
                    ? `${property?.name ?? 'Property'} · Unit ${unit.unit_number ?? '—'}`
                    : '—'}
                </td>
                <td className="px-4 py-3">
                  {lease ? fmtMoney(lease.monthly_rent) : '—'}
                </td>
                <td className="px-4 py-3">
                  {lease ? <Badge value={lease.status} /> : '—'}
                </td>
              </tr>
            );
          })}
        </DataTable>
      )}
    </>
  );
}
