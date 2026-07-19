import { cookies } from 'next/headers';
import { createSupabaseServerClient } from '@/lib/supabase';
import { PageHeader } from '@/components/ui/PortalShell';
import { DataTable, EmptyState } from '@/components/ui/EmptyState';
import { Badge } from '@/components/ui/Badge';
import { AccessLevelToggle } from '@/components/admin/AccessLevelToggle';
import type { AccessLevel } from '@/types/database';

export const dynamic = 'force-dynamic';

export default async function AdminLandlords() {
  const supabase = createSupabaseServerClient(cookies());
  const { data: landlords } = await supabase
    .from('users')
    .select('*, properties(count)')
    .eq('role', 'landlord')
    .order('created_at', { ascending: false });

  const rows = landlords ?? [];

  return (
    <>
      <PageHeader
        title="Landlords"
        subtitle="Manage landlord accounts and unlock full access after the onboarding call."
      />
      {rows.length === 0 ? (
        <EmptyState
          title="No landlords yet"
          message="Landlords who sign up will appear here."
        />
      ) : (
        <DataTable
          columns={[
            'Landlord',
            'Properties',
            'Onboarding',
            'Access',
            'Action',
          ]}
        >
          {rows.map((u) => {
            const propCount =
              Array.isArray(u.properties) && u.properties.length > 0
                ? (u.properties[0] as { count: number }).count
                : 0;
            return (
              <tr key={u.id}>
                <td className="px-4 py-3">
                  <p className="font-display font-bold text-navy">
                    {u.full_name || '—'}
                  </p>
                  <p className="text-ink/60">{u.email}</p>
                </td>
                <td className="px-4 py-3">{propCount}</td>
                <td className="px-4 py-3">
                  {u.onboarding_complete ? (
                    <Badge value="current" />
                  ) : (
                    <span className="text-ink/70">
                      Step {u.onboarding_step} / 8
                    </span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <Badge value={u.access_level} />
                </td>
                <td className="px-4 py-3">
                  <AccessLevelToggle
                    userId={u.id}
                    level={(u.access_level ?? 'limited') as AccessLevel}
                  />
                </td>
              </tr>
            );
          })}
        </DataTable>
      )}
    </>
  );
}
