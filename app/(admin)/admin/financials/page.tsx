import { cookies } from 'next/headers';
import { createSupabaseServerClient } from '@/lib/supabase';
import { PageHeader } from '@/components/ui/PortalShell';
import { StatCard } from '@/components/ui/StatCard';
import { Card } from '@/components/ui/Card';
import { fmtMoney } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function AdminFinancials() {
  const supabase = createSupabaseServerClient(cookies());
  const { data: payments } = await supabase
    .from('rent_payments')
    .select('amount, platform_fee, status');

  const rows = payments ?? [];
  const paid = rows.filter((p) => p.status === 'paid');
  const collected = paid.reduce((s, p) => s + Number(p.amount ?? 0), 0);
  const fees = paid.reduce((s, p) => s + Number(p.platform_fee ?? 0), 0);
  const outstanding = rows
    .filter((p) => ['pending', 'late', 'failed'].includes(p.status ?? ''))
    .reduce((s, p) => s + Number(p.amount ?? 0), 0);

  return (
    <>
      <PageHeader
        title="Financials"
        subtitle="Platform-wide rent collection and fee revenue."
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard tone="gold" label="Total Collected" value={fmtMoney(collected)} />
        <StatCard
          tone="navy"
          label="Platform Fees Earned"
          value={fmtMoney(fees)}
          sublabel="2.5% of rent collected"
        />
        <StatCard tone="gold" label="Outstanding" value={fmtMoney(outstanding)} />
      </div>

      <Card className="mt-8">
        <p className="text-ink/70">
          Full financial reporting — per-property P&amp;L, monthly statements, and
          year-end CSV exports — is delivered in <strong>Phase 2</strong> (rent
          collection + Stripe Connect) and <strong>Phase 4</strong> (reporting).
          Totals above reflect any <code>rent_payments</code> already in the
          database.
        </p>
      </Card>
    </>
  );
}
