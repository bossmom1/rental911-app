import Link from 'next/link';
import { cookies } from 'next/headers';
import { createSupabaseServerClient } from '@/lib/supabase';
import { getCurrentUser } from '@/lib/auth';
import { PageHeader } from '@/components/ui/PortalShell';
import { DataTable, EmptyState } from '@/components/ui/EmptyState';
import { Badge } from '@/components/ui/Badge';
import { RenewalActionForm } from './RenewalActionForm';

export const dynamic = 'force-dynamic';

export default async function LandlordRenewalsPage() {
  const supabase = createSupabaseServerClient(cookies());
  const current = await getCurrentUser();
  const meId = current!.authId;

  // Active leases where renewal alert was sent and no renewal is in progress/done
  // Also show any in-progress lease_renewals
  const [{ data: activeLeases }, { data: inProgressRenewals }] = await Promise.all([
    supabase
      .from('leases')
      .select(`
        id, end_date, monthly_rent, renewal_alert_sent, is_month_to_month,
        unit:units (unit_number, property:properties (name, address))
      `)
      .eq('landlord_id', meId)
      .eq('status', 'active')
      .eq('renewal_alert_sent', true)
      .eq('is_month_to_month', false)
      .order('end_date', { ascending: true }),

    supabase
      .from('lease_renewals')
      .select(`
        id, status, new_end_date, new_monthly_rent, created_at,
        lease:leases (
          id, end_date, monthly_rent,
          unit:units (unit_number, property:properties (name, address))
        )
      `)
      .eq('landlord_id', meId)
      .not('status', 'in', '("signed","cancelled")')
      .order('created_at', { ascending: false }),
  ]);

  const upcomingLeases = (activeLeases ?? []).filter(
    (l) => !(inProgressRenewals ?? []).some((r) => (r.lease as any)?.id === l.id)
  );

  return (
    <>
      <PageHeader
        title="Lease Renewals"
        subtitle="Upcoming lease expirations and renewal decisions."
      />

      {/* In-progress renewals */}
      {(inProgressRenewals ?? []).length > 0 && (
        <div className="mb-8">
          <h2 className="mb-3 font-display font-bold text-navy text-lg">In Progress</h2>
          <DataTable columns={['Property / Unit', 'Current End', 'New End', 'New Rent', 'Status', 'Action']}>
            {(inProgressRenewals ?? []).map((renewal) => {
              const lease = renewal.lease as any;
              const unit = lease?.unit as any;
              const prop = unit?.property as any;
              return (
                <tr key={renewal.id}>
                  <td className="px-4 py-3 font-medium text-sm">
                    {prop?.name || prop?.address || '—'}
                    {unit?.unit_number && <span className="text-ink/60"> · Unit {unit.unit_number}</span>}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    {lease?.end_date
                      ? new Date(lease.end_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                      : '—'}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    {renewal.new_end_date
                      ? new Date(renewal.new_end_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                      : '—'}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    {renewal.new_monthly_rent ? `$${Number(renewal.new_monthly_rent).toLocaleString()}` : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <Badge value={renewal.status ?? 'draft_review'} />
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/landlord/renewals/${renewal.id}`}
                      className="font-bold text-navy underline text-sm"
                    >
                      Review →
                    </Link>
                  </td>
                </tr>
              );
            })}
          </DataTable>
        </div>
      )}

      {/* Leases needing a decision */}
      {upcomingLeases.length === 0 && (inProgressRenewals ?? []).length === 0 ? (
        <EmptyState
          title="No renewals pending"
          message="You'll receive an email 60 days before any active lease expires. Renewals will appear here."
        />
      ) : upcomingLeases.length > 0 ? (
        <div>
          <h2 className="mb-3 font-display font-bold text-navy text-lg">Needs a Decision</h2>
          <DataTable columns={['Property / Unit', 'Lease Ends', 'Monthly Rent', 'Action']}>
            {upcomingLeases.map((lease) => {
              const unit = lease.unit as any;
              const prop = unit?.property as any;
              return (
                <tr key={lease.id}>
                  <td className="px-4 py-3 font-medium text-sm">
                    {prop?.name || prop?.address || '—'}
                    {unit?.unit_number && <span className="text-ink/60"> · Unit {unit.unit_number}</span>}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    {lease.end_date
                      ? new Date(lease.end_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                      : '—'}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    ${Number(lease.monthly_rent ?? 0).toLocaleString()}/mo
                  </td>
                  <td className="px-4 py-3">
                    <RenewalActionForm leaseId={lease.id} />
                  </td>
                </tr>
              );
            })}
          </DataTable>
        </div>
      ) : null}
    </>
  );
}
