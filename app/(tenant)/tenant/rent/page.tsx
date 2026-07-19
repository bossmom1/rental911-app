import { cookies } from 'next/headers';
import { createSupabaseServerClient } from '@/lib/supabase';
import { getCurrentUser } from '@/lib/auth';
import { PageHeader } from '@/components/ui/PortalShell';
import { StatCard } from '@/components/ui/StatCard';
import { Card, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { DataTable, EmptyState } from '@/components/ui/EmptyState';
import { Badge } from '@/components/ui/Badge';
import { fmtMoney, fmtDate } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function TenantRent() {
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

  return (
    <>
      <PageHeader title="Rent" subtitle="Pay rent and view your payment history." />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <StatCard
          tone="navy"
          label="Monthly Rent"
          value={fmtMoney(lease?.monthly_rent)}
        />
        <Card className="flex flex-col justify-center">
          <p className="mb-3 text-ink/70">
            Online rent payments (ACH &amp; card) go live in <strong>Phase 2</strong>.
          </p>
          <Button variant="gold" disabled>
            Pay rent (coming soon)
          </Button>
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
          <DataTable columns={['Due', 'Amount', 'Status', 'Paid']}>
            {rows.map((p) => (
              <tr key={p.id}>
                <td className="px-4 py-3">{fmtDate(p.due_date)}</td>
                <td className="px-4 py-3">{fmtMoney(p.amount)}</td>
                <td className="px-4 py-3">
                  <Badge value={p.status} />
                </td>
                <td className="px-4 py-3">{fmtDate(p.paid_date)}</td>
              </tr>
            ))}
          </DataTable>
        )}
      </div>
    </>
  );
}
