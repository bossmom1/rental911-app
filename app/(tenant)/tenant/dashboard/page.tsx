import { cookies } from 'next/headers';
import { createSupabaseServerClient } from '@/lib/supabase';
import { getCurrentUser } from '@/lib/auth';
import { PageHeader } from '@/components/ui/PortalShell';
import { StatCard } from '@/components/ui/StatCard';
import { Card, CardHeader } from '@/components/ui/Card';
import { LinkButton } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Badge } from '@/components/ui/Badge';
import { fmtMoney, fmtDate } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function TenantDashboard() {
  const supabase = createSupabaseServerClient(cookies());
  const current = await getCurrentUser();

  const { data: lease } = await supabase
    .from('leases')
    .select(
      '*, unit:units(unit_number, bedrooms, bathrooms, property:properties(name, address, city, state, zip))'
    )
    .eq('tenant_id', current!.authId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const l = lease as any;
  const unit = l?.unit;
  const property = unit?.property;

  return (
    <>
      <PageHeader
        title={`Welcome, ${current?.profile?.full_name || 'Tenant'}`}
        subtitle="Your home, lease, and requests."
      />

      {!l ? (
        <EmptyState
          title="No active lease yet"
          message="Once your landlord assigns you to a unit, your lease details will appear here."
        />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <StatCard tone="navy" label="Monthly Rent" value={fmtMoney(l.monthly_rent)} />
            <StatCard
              tone="lightBlue"
              label="Lease Ends"
              value={l.end_date ? fmtDate(l.end_date) : 'Month-to-month'}
            />
            <StatCard
              tone="gold"
              label="Security Deposit"
              value={fmtMoney(l.security_deposit)}
            />
          </div>

          <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader title="Your unit" />
              <p className="font-display text-lg font-bold text-navy">
                {property?.name ?? 'Your home'} · Unit {unit?.unit_number ?? '—'}
              </p>
              <p className="text-ink/70">
                {[property?.address, property?.city, property?.state, property?.zip]
                  .filter(Boolean)
                  .join(', ')}
              </p>
              <p className="mt-2 text-ink">
                {unit?.bedrooms ?? '—'} bed · {unit?.bathrooms ?? '—'} bath
              </p>
              <div className="mt-3">
                <Badge value={l.status} />
              </div>
            </Card>

            <Card>
              <CardHeader title="Quick actions" />
              <div className="flex flex-col gap-3">
                <LinkButton href="/tenant/rent" variant="gold">
                  Pay rent
                </LinkButton>
                <LinkButton href="/tenant/maintenance/new" variant="primary">
                  Submit a maintenance request
                </LinkButton>
                <LinkButton href="/tenant/documents" variant="outline">
                  View documents
                </LinkButton>
              </div>
            </Card>
          </div>
        </>
      )}
    </>
  );
}
