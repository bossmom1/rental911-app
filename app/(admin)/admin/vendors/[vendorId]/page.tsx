import Link from 'next/link';
import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase';
import { PageHeader } from '@/components/ui/PortalShell';
import { Card, CardHeader } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { DataTable, EmptyState } from '@/components/ui/EmptyState';
import { GenerateMembershipInvoiceButton } from '@/components/admin/GenerateMembershipInvoiceButton';
import { fmtDate, fmtMoneyCents } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function AdminVendorDetail({ params }: { params: { vendorId: string } }) {
  const supabase = createSupabaseServerClient(cookies());
  const { data: vendor } = await supabase.from('vendors').select('*').eq('id', params.vendorId).maybeSingle();
  if (!vendor) notFound();

  const { data: payments } = await supabase
    .from('vendor_membership_payments')
    .select('*')
    .eq('vendor_id', params.vendorId)
    .order('created_at', { ascending: false });

  const rows = payments ?? [];

  return (
    <>
      <PageHeader
        title={vendor.name || 'Vendor'}
        subtitle={[vendor.trade, vendor.phone, vendor.email].filter(Boolean).join(' — ')}
        action={
          <Link href="/admin/vendors" className="text-navy underline">
            Back to Vendors
          </Link>
        }
      />

      <Card className="mb-6">
        <CardHeader
          title="Membership"
          subtitle="Quarterly billing — $199/mo, $597 charged per quarter as a one-time payment. Not a subscription."
          action={<Badge value={vendor.membership_status} />}
        />
        <div className="mb-4 grid gap-4 sm:grid-cols-2">
          <div>
            <p className="text-ink/60">Start date</p>
            <p className="font-display font-bold text-navy">{fmtDate(vendor.membership_start_date)}</p>
          </div>
          <div>
            <p className="text-ink/60">Term</p>
            <p className="font-display font-bold text-navy">{vendor.membership_term_months} months</p>
          </div>
        </div>
        <GenerateMembershipInvoiceButton vendorId={vendor.id} />
      </Card>

      <Card>
        <CardHeader title="Payment history" />
        {rows.length === 0 ? (
          <EmptyState
            title="No invoices yet"
            message="Generate the first membership invoice above, then copy the link to send to this vendor."
          />
        ) : (
          <DataTable columns={['Period', 'Amount', 'Status', 'Created', 'Paid']}>
            {rows.map((p) => (
              <tr key={p.id}>
                <td className="px-4 py-3">
                  {fmtDate(p.period_start)} – {fmtDate(p.period_end)}
                </td>
                <td className="px-4 py-3">{fmtMoneyCents(p.amount_cents)}</td>
                <td className="px-4 py-3">
                  <Badge value={p.status} />
                </td>
                <td className="px-4 py-3 text-ink/70">{fmtDate(p.created_at)}</td>
                <td className="px-4 py-3 text-ink/70">{fmtDate(p.paid_at)}</td>
              </tr>
            ))}
          </DataTable>
        )}
      </Card>
    </>
  );
}
