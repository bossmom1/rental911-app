import { cookies } from 'next/headers';
import { createSupabaseServerClient } from '@/lib/supabase';
import { getCurrentUser } from '@/lib/auth';
import { PageHeader } from '@/components/ui/PortalShell';
import { DataTable, EmptyState } from '@/components/ui/EmptyState';
import { Badge } from '@/components/ui/Badge';
import { AddTenantForm } from '@/components/landlord/AddForms';
import Link from 'next/link';
import { fmtDate, fmtMoney } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function LandlordTenants() {
  const supabase = createSupabaseServerClient(cookies());
  const current = await getCurrentUser();
  const meId = current!.authId;

  // Leases for this landlord, with tenant + unit info.
  const { data: leases } = await supabase
    .from('leases')
    .select(
      'id, status, monthly_rent, end_date, tenant:users!leases_tenant_id_fkey(full_name, email, phone), unit:units(unit_number, property:properties(name))'
    )
    .eq('landlord_id', meId)
    .order('created_at', { ascending: false });

  // Vacant units available to assign a new tenant to.
  const { data: props } = await supabase
    .from('properties')
    .select('id, name')
    .eq('landlord_id', meId);
  const propIds = (props ?? []).map((p) => p.id);
  const propName = new Map((props ?? []).map((p) => [p.id, p.name]));

  const { data: vacantUnits } = propIds.length
    ? await supabase
        .from('units')
        .select('id, unit_number, property_id, status')
        .in('property_id', propIds)
    : { data: [] as any[] };

  const unitOptions = (vacantUnits ?? [])
    .filter((u: any) => u.status !== 'occupied')
    .map((u: any) => ({
      id: u.id,
      label: `${propName.get(u.property_id) ?? 'Property'} · Unit ${u.unit_number}`,
    }));

  const rows = (leases ?? []) as any[];

  return (
    <>
      <PageHeader
        title="Tenants"
        subtitle="Tenants on your active and past leases."
        action={<AddTenantForm units={unitOptions} />}
      />

      {rows.length === 0 ? (
        <EmptyState
          title="No tenants yet"
          message="Add a tenant and assign them to a vacant unit."
        />
      ) : (
        <DataTable columns={['Tenant', 'Contact', 'Unit', 'Rent', 'Lease Ends', 'Status']}>
          {rows.map((l) => (
            <tr key={l.id}>
              <td className="px-4 py-3 font-display font-bold text-navy">
                <Link href={`/landlord/tenants/${l.id}`} className="hover:underline">
                  {l.tenant?.full_name || '—'}
                </Link>
              </td>
              <td className="px-4 py-3">
                <p>{l.tenant?.email}</p>
                <p className="text-ink/60">{l.tenant?.phone || ''}</p>
              </td>
              <td className="px-4 py-3">
                {l.unit
                  ? `${l.unit.property?.name ?? ''} · Unit ${l.unit.unit_number}`
                  : '—'}
              </td>
              <td className="px-4 py-3">{fmtMoney(l.monthly_rent)}</td>
              <td className="px-4 py-3">{fmtDate(l.end_date)}</td>
              <td className="px-4 py-3">
                <Badge value={l.status} />
              </td>
            </tr>
          ))}
        </DataTable>
      )}
    </>
  );
}
