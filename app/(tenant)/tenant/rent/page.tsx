import { cookies } from 'next/headers';
import { createSupabaseServerClient } from '@/lib/supabase';
import { getCurrentUser } from '@/lib/auth';
import { PageHeader } from '@/components/ui/PortalShell';
import { StatCard } from '@/components/ui/StatCard';
import { Card, CardHeader } from '@/components/ui/Card';
import { DataTable, EmptyState } from '@/components/ui/EmptyState';
import { Badge } from '@/components/ui/Badge';
import { fmtMoney, fmtDate } from '@/lib/format';
import { RentPayment } from '@/components/tenant/RentPayment';
import { quoteRent } from './actions';

export const dynamic = 'force-dynamic';

export default async function TenantRent({
  searchParams,
}: {
  searchParams?: { paid?: string; canceled?: string };
}) {
  const supabase = createSupabaseServerClient(cookies());
  const current = await getCurrentUser();

  const { data: lease } = await supabase
    .from('leases')
    .select('id, monthly_rent')
    .eq('tenant_id', current!.authId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: payments } = await supabase
    .from('rent_payments')
    .select('*')
    .eq('tenant_id', current!.authId)
    .order('due_date', { ascending: false });

  const rows = payments ?? [];

  // Surcharges must be disclosed before the tenant picks a method, so the quote
  // is resolved server-side and passed down rather than fetched on click.
  const quoteResult = await quoteRent();
  const quote = quoteResult.ok ? quoteResult : null;

  return (
    <>
      <PageHeader title="Rent" subtitle="Pay rent and view your payment history." />

      {searchParams?.paid && (
        <div className="mb-6 rounded-lg bg-green-50 px-4 py-3 text-green-800">
          <strong>Payment submitted.</strong> Card payments post right away; bank
          (ACH) payments can take 3–5 business days to clear, and this page updates
          when they do.
        </div>
      )}
      {searchParams?.canceled && (
        <div className="mb-6 rounded-lg bg-light-blue/40 px-4 py-3 text-navy">
          Checkout canceled — you have not been charged.
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <StatCard
          tone="navy"
          label="Monthly Rent"
          value={fmtMoney(lease?.monthly_rent)}
        />
        <Card className="flex flex-col justify-center">
          <RentPayment quote={quote} />
        </Card>
      </div>

      <div className="mt-8">
        <CardHeader title="Payment history" />
        {rows.length === 0 ? (
          <EmptyState
            title="No payments yet"
            message="Your rent payment history will appear here."
          />
        ) : (
          <DataTable columns={['Due', 'Amount', 'Status', 'Paid', 'Receipt']}>
            {rows.map((p) => (
              <tr key={p.id}>
                <td className="px-4 py-3">{fmtDate(p.due_date)}</td>
                <td className="px-4 py-3">{fmtMoney(p.amount)}</td>
                <td className="px-4 py-3">
                  <Badge value={p.status} />
                </td>
                <td className="px-4 py-3">{fmtDate(p.paid_date)}</td>
                <td className="px-4 py-3">
                  {p.receipt_path ? (
                    <a
                      href={`/api/receipts/${p.id}`}
                      className="font-display font-bold text-navy underline"
                    >
                      View
                    </a>
                  ) : (
                    <span className="text-ink/50">—</span>
                  )}
                </td>
              </tr>
            ))}
          </DataTable>
        )}
      </div>
    </>
  );
}
