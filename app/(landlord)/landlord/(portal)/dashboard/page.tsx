import { cookies } from 'next/headers';
import { createSupabaseServerClient } from '@/lib/supabase';
import { getCurrentUser } from '@/lib/auth';
import { StatCard } from '@/components/ui/StatCard';
import { PageHeader } from '@/components/ui/PortalShell';
import { Card, CardHeader } from '@/components/ui/Card';
import { LinkButton } from '@/components/ui/Button';
import { RequestList } from '@/components/maintenance/RequestList';
import { fmtMoney, fmtPct } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function LandlordDashboard() {
  const supabase = createSupabaseServerClient(cookies());
  const current = await getCurrentUser();
  const meId = current!.authId;

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    .toISOString()
    .slice(0, 10);

  // Units belonging to this landlord (via their properties).
  const { data: props } = await supabase
    .from('properties')
    .select('id')
    .eq('landlord_id', meId);
  const propIds = (props ?? []).map((p) => p.id);

  const { data: units } = propIds.length
    ? await supabase.from('units').select('id, status').in('property_id', propIds)
    : { data: [] as { id: string; status: string | null }[] };

  const totalUnits = units?.length ?? 0;
  const occupied = (units ?? []).filter((u) => u.status === 'occupied').length;

  const [openMaint, paidThisMonth, recent] = await Promise.all([
    supabase
      .from('maintenance_requests')
      .select('*', { count: 'exact', head: true })
      .eq('landlord_id', meId)
      .in('status', ['open', 'in_progress', 'vendor_assigned']),
    supabase
      .from('rent_payments')
      .select('amount, lease:leases!inner(landlord_id)')
      .eq('status', 'paid')
      .eq('lease.landlord_id', meId)
      .gte('paid_date', monthStart),
    supabase
      .from('maintenance_requests')
      .select('id, title, category, priority, status, created_at')
      .eq('landlord_id', meId)
      .order('created_at', { ascending: false })
      .limit(5),
  ]);

  const collected = (paidThisMonth.data ?? []).reduce(
    (s, r: any) => s + Number(r.amount ?? 0),
    0
  );

  return (
    <>
      <PageHeader
        title="Landlord Dashboard"
        subtitle="Your properties, tenants, and maintenance at a glance."
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard tone="navy" label="Properties" value={propIds.length} />
        <StatCard tone="navy" label="Units" value={totalUnits} />
        <StatCard
          tone="lightBlue"
          label="Occupancy"
          value={totalUnits ? fmtPct(occupied / totalUnits) : '0%'}
          sublabel={`${occupied}/${totalUnits} occupied`}
        />
        <StatCard
          tone="gold"
          label="Collected (Month)"
          value={fmtMoney(collected)}
        />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <StatCard tone="gold" label="Open Maintenance" value={openMaint.count ?? 0} />
      </div>

      <div className="mt-8">
        <Card>
          <CardHeader
            title="Recent maintenance"
            action={
              <LinkButton href="/landlord/maintenance" variant="outline">
                View all
              </LinkButton>
            }
          />
          <RequestList requests={recent.data ?? []} basePath="/landlord/maintenance" />
        </Card>
      </div>
    </>
  );
}
