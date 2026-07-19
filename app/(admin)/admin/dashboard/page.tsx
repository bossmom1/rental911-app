import { cookies } from 'next/headers';
import { createSupabaseServerClient } from '@/lib/supabase';
import { StatCard } from '@/components/ui/StatCard';
import { PageHeader } from '@/components/ui/PortalShell';
import { Card, CardHeader } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { LinkButton } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { fmtMoney, fmtPct } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function AdminDashboard() {
  const supabase = createSupabaseServerClient(cookies());

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    .toISOString()
    .slice(0, 10);
  const in30 = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
  const today = now.toISOString().slice(0, 10);

  const [
    propertiesCount,
    unitsCount,
    occupiedCount,
    paidThisMonth,
    outstanding,
    pendingMaint,
    expiringCompliance,
    recentMaint,
  ] = await Promise.all([
    supabase.from('properties').select('*', { count: 'exact', head: true }),
    supabase.from('units').select('*', { count: 'exact', head: true }),
    supabase
      .from('units')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'occupied'),
    supabase
      .from('rent_payments')
      .select('amount, platform_fee')
      .eq('status', 'paid')
      .gte('paid_date', monthStart),
    supabase
      .from('rent_payments')
      .select('amount')
      .in('status', ['pending', 'late', 'failed']),
    supabase
      .from('maintenance_requests')
      .select('*', { count: 'exact', head: true })
      .in('status', ['open', 'in_progress', 'vendor_assigned']),
    supabase
      .from('compliance_items')
      .select('*', { count: 'exact', head: true })
      .or(
        `status.eq.expiring_soon,and(expiry_date.gte.${today},expiry_date.lte.${in30})`
      ),
    supabase
      .from('maintenance_requests')
      .select('id, title, priority, status, created_at')
      .order('created_at', { ascending: false })
      .limit(6),
  ]);

  const totalUnits = unitsCount.count ?? 0;
  const occupied = occupiedCount.count ?? 0;
  const occupancyRate = totalUnits > 0 ? occupied / totalUnits : 0;

  const collected = (paidThisMonth.data ?? []).reduce(
    (sum, r) => sum + Number(r.amount ?? 0),
    0
  );
  const fees = (paidThisMonth.data ?? []).reduce(
    (sum, r) => sum + Number(r.platform_fee ?? 0),
    0
  );
  const outstandingTotal = (outstanding.data ?? []).reduce(
    (sum, r) => sum + Number(r.amount ?? 0),
    0
  );

  return (
    <>
      <PageHeader
        title="Admin Dashboard"
        subtitle="Platform overview across all landlords, units, and tenants."
      />

      {/* Bold, colorful stat cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard tone="navy" label="Total Properties" value={propertiesCount.count ?? 0} />
        <StatCard tone="navy" label="Total Units" value={totalUnits} />
        <StatCard
          tone="navy"
          label="Occupancy Rate"
          value={fmtPct(occupancyRate)}
          sublabel={`${occupied} of ${totalUnits} units occupied`}
        />
        <StatCard
          tone="gold"
          label="Rent Collected (This Month)"
          value={fmtMoney(collected)}
          sublabel={`${fmtMoney(fees)} platform fees`}
        />
        <StatCard
          tone="gold"
          label="Outstanding Balance"
          value={fmtMoney(outstandingTotal)}
        />
        <StatCard
          tone="gold"
          label="Pending Maintenance"
          value={pendingMaint.count ?? 0}
          sublabel="open / in progress"
        />
        <StatCard
          tone="red"
          label="Compliance Expiring ≤ 30 days"
          value={expiringCompliance.count ?? 0}
          sublabel="needs attention"
        />
      </div>

      <div className="mt-8">
        <Card>
          <CardHeader
            title="Recent Maintenance"
            action={
              <LinkButton href="/admin/maintenance" variant="outline">
                View all
              </LinkButton>
            }
          />
          {(recentMaint.data ?? []).length === 0 ? (
            <EmptyState
              title="No maintenance requests yet"
              message="New requests submitted by tenants will appear here."
            />
          ) : (
            <ul className="divide-y divide-light-blue/40">
              {(recentMaint.data ?? []).map((m) => (
                <li key={m.id} className="flex items-center justify-between py-3">
                  <div>
                    <p className="font-display font-bold text-navy">{m.title}</p>
                    <p className="text-ink/60">
                      {new Date(m.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge value={m.priority} />
                    <Badge value={m.status} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
