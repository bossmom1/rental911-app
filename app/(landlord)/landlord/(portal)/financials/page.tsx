import { cookies } from 'next/headers';
import { createSupabaseServerClient } from '@/lib/supabase';
import { getCurrentUser } from '@/lib/auth';
import { PageHeader } from '@/components/ui/PortalShell';
import { StatCard } from '@/components/ui/StatCard';
import { Card } from '@/components/ui/Card';
import { fmtMoney } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function LandlordFinancials() {
  const supabase = createSupabaseServerClient(cookies());
  const current = await getCurrentUser();

  const { data: payments } = await supabase
    .from('rent_payments')
    .select('amount, status, lease:leases!inner(landlord_id)')
    .eq('lease.landlord_id', current!.authId);

  const rows = (payments ?? []) as any[];
  const collected = rows
    .filter((p) => p.status === 'paid')
    .reduce((s, p) => s + Number(p.amount ?? 0), 0);
  const outstanding = rows
    .filter((p) => ['pending', 'late', 'failed'].includes(p.status))
    .reduce((s, p) => s + Number(p.amount ?? 0), 0);

  return (
    <>
      <PageHeader title="Financials" subtitle="Rent collected across your properties." />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <StatCard tone="gold" label="Total Collected" value={fmtMoney(collected)} />
        <StatCard tone="navy" label="Outstanding" value={fmtMoney(outstanding)} />
      </div>
      <Card className="mt-8">
        <p className="text-ink/70">
          Rent collection, payouts, and per-property P&amp;L statements are
          delivered in <strong>Phase 2</strong>. Amounts above reflect any
          payments already recorded against your leases.
        </p>
      </Card>
    </>
  );
}
