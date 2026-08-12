import Link from 'next/link';
import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase';
import { PageHeader } from '@/components/ui/PortalShell';
import { Card, CardHeader } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { RenewalWorkflow } from '@/components/landlord/RenewalWorkflow';
import { fmtDate, fmtMoney } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function LeaseDetail({ params }: { params: { leaseId: string } }) {
  const supabase = createSupabaseServerClient(cookies());

  const { data: lease } = await supabase
    .from('leases')
    .select(
      `id, status, start_date, end_date, monthly_rent, security_deposit,
       is_month_to_month, month_to_month_note, tenant_id,
       tenant:users!leases_tenant_id_fkey(full_name, email, phone),
       unit:units(unit_number, property:properties(name, address))`
    )
    .eq('id', params.leaseId)
    .maybeSingle();

  if (!lease) notFound();

  const [{ data: renewal }, { data: moveOutChecklist }, { data: tenantDocs }] =
    await Promise.all([
      supabase
        .from('lease_renewals')
        .select('*')
        .eq('lease_id', params.leaseId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from('move_out_checklists')
        .select('*')
        .eq('lease_id', params.leaseId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from('tenant_documents')
        .select('id')
        .eq('tenant_id', lease.tenant_id ?? '')
        .eq('archived', false),
    ]);

  const tenant = (lease as any).tenant;
  const unit = (lease as any).unit;
  const property = unit?.property;
  const docCount = tenantDocs?.length ?? 0;

  return (
    <>
      <PageHeader
        title={tenant?.full_name || 'Tenant'}
        subtitle={`${property?.name ?? ''}${unit?.unit_number ? ` · Unit ${unit.unit_number}` : ''}`}
        action={
          <Link href="/landlord/tenants" className="text-navy underline">
            Back to Tenants
          </Link>
        }
      />

      <div className="mb-6">
        <Card>
          <CardHeader title="Lease" action={<Badge value={lease.status} />} />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <p>
              <span className="text-ink/60">Start:</span> {fmtDate(lease.start_date)}
            </p>
            <p>
              <span className="text-ink/60">End:</span> {fmtDate(lease.end_date)}
            </p>
            <p>
              <span className="text-ink/60">Monthly rent:</span> {fmtMoney(lease.monthly_rent)}
            </p>
            <p>
              <span className="text-ink/60">Security deposit:</span>{' '}
              {fmtMoney(lease.security_deposit)}
            </p>
            <p>
              <span className="text-ink/60">Contact:</span> {tenant?.email} {tenant?.phone}
            </p>
          </div>
          {lease.is_month_to_month && (
            <p className="mt-3 text-ink/70">
              Month-to-month
              {lease.month_to_month_note ? ` — ${lease.month_to_month_note}` : ''}
            </p>
          )}
        </Card>
      </div>

      {/* Tenant Documents quick-link */}
      <div className="mb-6">
        <Card>
          <CardHeader
            title="Tenant Documents"
            action={
              <Link
                href={`/landlord/tenants/${params.leaseId}/documents`}
                className="font-display font-bold text-navy underline text-sm"
              >
                View all →
              </Link>
            }
          />
          {docCount === 0 ? (
            <p className="text-ink/60 text-sm">No documents uploaded by this tenant yet.</p>
          ) : (
            <p className="text-sm text-ink/70">
              <span className="font-semibold text-navy">{docCount}</span> document
              {docCount !== 1 ? 's' : ''} on file.{' '}
              <Link
                href={`/landlord/tenants/${params.leaseId}/documents`}
                className="text-navy underline"
              >
                View →
              </Link>
            </p>
          )}
        </Card>
      </div>

      <RenewalWorkflow
        leaseId={lease.id}
        tenantId={lease.tenant_id ?? ''}
        isMonthToMonth={lease.is_month_to_month}
        renewal={(renewal as any) ?? null}
        moveOutChecklist={(moveOutChecklist as any) ?? null}
      />
    </>
  );
}
