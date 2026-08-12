import { notFound } from 'next/navigation';
import { cookies } from 'next/headers';
import { createSupabaseServerClient } from '@/lib/supabase';
import { getCurrentUser } from '@/lib/auth';
import { PageHeader } from '@/components/ui/PortalShell';
import { Card, CardHeader } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { RenewalReviewButtons } from './RenewalReviewButtons';

export const dynamic = 'force-dynamic';

export default async function RenewalReviewPage({
  params,
}: {
  params: { renewalId: string };
}) {
  const supabase = createSupabaseServerClient(cookies());
  const current = await getCurrentUser();
  const meId = current!.authId;

  const { data: renewal } = await supabase
    .from('lease_renewals')
    .select(`
      id, status, new_end_date, new_monthly_rent, sent_to_tenant_at, signed_at, created_at,
      lease:leases (
        id, start_date, end_date, monthly_rent, security_deposit,
        unit:units (unit_number, property:properties (name, address)),
        tenant:users!leases_tenant_id_fkey (full_name, email)
      )
    `)
    .eq('id', params.renewalId)
    .eq('landlord_id', meId)
    .single();

  if (!renewal) notFound();

  const lease = renewal.lease as any;
  const unit = lease?.unit as any;
  const prop = unit?.property as any;
  const tenant = lease?.tenant as any;

  const fmtDate = (d: string | null) =>
    d
      ? new Date(d + (d.includes('T') ? '' : 'T00:00:00')).toLocaleDateString('en-US', {
          month: 'long',
          day: 'numeric',
          year: 'numeric',
        })
      : '—';

  return (
    <>
      <PageHeader
        title="Lease Renewal Review"
        subtitle={`${prop?.name || prop?.address} ${unit?.unit_number ? `· Unit ${unit.unit_number}` : ''}`}
      />

      <div className="grid gap-6 md:grid-cols-2">
        {/* Current lease */}
        <Card>
          <CardHeader title="Current Lease" />
          <div className="px-4 pb-4 space-y-2 text-sm">
            <Row label="Tenant" value={tenant?.full_name ?? '—'} />
            <Row label="Start Date" value={fmtDate(lease?.start_date)} />
            <Row label="End Date" value={fmtDate(lease?.end_date)} />
            <Row
              label="Monthly Rent"
              value={`$${Number(lease?.monthly_rent ?? 0).toLocaleString()}/mo`}
            />
            <Row
              label="Security Deposit"
              value={lease?.security_deposit ? `$${Number(lease.security_deposit).toLocaleString()}` : '—'}
            />
          </div>
        </Card>

        {/* Renewal terms */}
        <Card>
          <CardHeader title="Renewal Terms" />
          <div className="px-4 pb-4 space-y-2 text-sm">
            <Row label="New End Date" value={fmtDate(renewal.new_end_date)} />
            <Row
              label="New Monthly Rent"
              value={`$${Number(renewal.new_monthly_rent ?? 0).toLocaleString()}/mo`}
            />
            <Row label="Status">
              <Badge value={renewal.status ?? 'draft_review'} />
            </Row>
            {renewal.sent_to_tenant_at && (
              <Row label="Sent to Tenant" value={fmtDate(renewal.sent_to_tenant_at)} />
            )}
            {renewal.signed_at && (
              <Row label="Signed" value={fmtDate(renewal.signed_at)} />
            )}
          </div>
        </Card>
      </div>

      {/* Renewal flow explanation */}
      <div className="mt-6 rounded-lg bg-lightBlue/20 border border-lightBlue px-4 py-3 text-sm text-navy">
        <p className="font-bold mb-1">How this works:</p>
        <ol className="list-decimal list-inside space-y-1 text-ink">
          <li>Review the renewal terms above.</li>
          <li>Click <strong>Send to Tenant</strong> — this marks the renewal as sent. The tenant receives an email with the lease details and instructions to sign outside the portal.</li>
          <li>Once the tenant has physically or electronically signed, click <strong>Mark as Signed</strong>. This creates the new lease record and closes the old one.</li>
        </ol>
        <p className="mt-2 text-ink/70 text-xs">
          (E-signature integration will be added in a future update. For now, coordinate signing directly with the tenant and use "Mark as Signed" to confirm completion.)
        </p>
      </div>

      <div className="mt-6">
        <RenewalReviewButtons renewalId={renewal.id} status={renewal.status ?? 'draft_review'} />
      </div>
    </>
  );
}

function Row({
  label,
  value,
  children,
}: {
  label: string;
  value?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex justify-between">
      <span className="text-ink/60">{label}</span>
      {children ?? <span className="font-medium">{value}</span>}
    </div>
  );
}
