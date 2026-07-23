import { cookies } from 'next/headers';
import { createSupabaseServerClient } from '@/lib/supabase';
import { PageHeader } from '@/components/ui/PortalShell';
import { DataTable, EmptyState } from '@/components/ui/EmptyState';
import { AddVendorPanel } from '@/components/admin/AddVendorPanel';
import { VendorRow } from '@/components/admin/VendorRow';

export const dynamic = 'force-dynamic';

export default async function AdminVendors() {
  const supabase = createSupabaseServerClient(cookies());

  const { data: vendors } = await supabase.from('vendors').select('*').order('name', { ascending: true });
  const { data: dispatches } = await supabase
    .from('vendor_dispatches')
    .select('vendor_id, completion_confirmed, tenant_rating');

  const statsByVendor = new Map<
    string,
    { jobsDispatched: number; completed: number; ratingSum: number; ratingCount: number }
  >();
  for (const d of dispatches ?? []) {
    if (!d.vendor_id) continue;
    const s = statsByVendor.get(d.vendor_id) ?? { jobsDispatched: 0, completed: 0, ratingSum: 0, ratingCount: 0 };
    s.jobsDispatched += 1;
    if (d.completion_confirmed) s.completed += 1;
    if (d.tenant_rating != null) {
      s.ratingSum += d.tenant_rating;
      s.ratingCount += 1;
    }
    statsByVendor.set(d.vendor_id, s);
  }

  const rows = vendors ?? [];

  return (
    <>
      <PageHeader title="Vendors" subtitle="Manage the vendor network for maintenance dispatch." />
      <AddVendorPanel />
      {rows.length === 0 ? (
        <EmptyState title="No vendors yet" message="Add a vendor to start dispatching maintenance requests." />
      ) : (
        <DataTable columns={['Vendor', 'Trade', 'License', 'Membership', 'Avg response', 'Job stats', 'Action']}>
          {rows.map((v) => {
            const s = statsByVendor.get(v.id);
            return (
              <VendorRow
                key={v.id}
                vendor={v}
                stats={{
                  jobsDispatched: s?.jobsDispatched ?? 0,
                  completionRate: s && s.jobsDispatched > 0 ? s.completed / s.jobsDispatched : null,
                  avgRating: s && s.ratingCount > 0 ? s.ratingSum / s.ratingCount : null,
                  ratingCount: s?.ratingCount ?? 0,
                }}
              />
            );
          })}
        </DataTable>
      )}
    </>
  );
}
