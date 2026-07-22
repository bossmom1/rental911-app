import { cookies } from 'next/headers';
import { createSupabaseServerClient } from '@/lib/supabase';
import { getCurrentUser } from '@/lib/auth';
import { getStripe, achSurchargeCents, creditSurchargeCents } from '@/lib/stripe';
import { PageHeader } from '@/components/ui/PortalShell';
import { StatCard } from '@/components/ui/StatCard';
import { Card, CardHeader } from '@/components/ui/Card';
import { DataTable, EmptyState } from '@/components/ui/EmptyState';
import { Badge } from '@/components/ui/Badge';
import { fmtMoney, fmtDate } from '@/lib/format';
import { fetchPaymentRows, isThisMonth, OUTSTANDING_STATUSES, sumAmount, sumLateFees } from '@/lib/financials';

export const dynamic = 'force-dynamic';

const methodLabels: Record<string, string> = {
  ach: 'Bank transfer',
  card_credit: 'Credit card',
  card_debit: 'Debit card',
};

/** Estimated Stripe processing fee absorbed by the landlord for one payment. */
function estimatedFeeCents(amountDollars: number, surchargeDollars: number, method: string | null): number {
  const rentCents = Math.round(amountDollars * 100);
  const surchargeCents = Math.round(surchargeDollars * 100);
  if (method === 'ach') return achSurchargeCents(rentCents); // grossed-up surcharge covers the fee
  if (method === 'card_credit') {
    const trueFee = Math.round((rentCents + surchargeCents + 30) * 0.029) + 30;
    return Math.max(0, trueFee - surchargeCents);
  }
  if (method === 'card_debit') {
    return Math.round(rentCents * 0.029) + 30;
  }
  return 0;
}

export default async function LandlordFinancials() {
  const supabase = createSupabaseServerClient(cookies());
  const current = await getCurrentUser();
  const rows = await fetchPaymentRows(supabase);

  const paidThisMonth = rows.filter((r) => r.status === 'paid' && isThisMonth(r.paid_date));
  const collectedThisMonth = sumAmount(paidThisMonth);
  const lateFeesThisMonth = sumLateFees(paidThisMonth);
  const outstanding = sumAmount(rows.filter((r) => OUTSTANDING_STATUSES.includes(r.status ?? '')));

  const paidRows = rows
    .filter((r) => r.status === 'paid')
    .sort((a, b) => (b.paid_date ?? '').localeCompare(a.paid_date ?? ''));

  // Monthly P&L: group paid rows by paid_date's year-month. Late fees are
  // landlord revenue (not a Stripe cost), so they get their own column rather
  // than being folded into "rent collected" or the processing-fee estimate.
  const byMonth = new Map<string, { collected: number; lateFees: number; fees: number }>();
  for (const r of paidRows) {
    if (!r.paid_date) continue;
    const key = r.paid_date.slice(0, 7); // "2026-07"
    if (!byMonth.has(key)) byMonth.set(key, { collected: 0, lateFees: 0, fees: 0 });
    const entry = byMonth.get(key)!;
    const amount = Number(r.amount ?? 0);
    const surcharge = Number(r.surcharge_amount ?? 0);
    entry.collected += amount;
    entry.lateFees += Number(r.late_fee_amount ?? 0);
    entry.fees += estimatedFeeCents(amount, surcharge, r.payment_method) / 100;
  }
  const monthRows = [...byMonth.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .slice(0, 12);

  // Stripe payout data — only if the landlord has a connected account.
  const stripeAccountId = current?.profile?.stripe_account_id ?? null;
  let nextPayoutDate: string | null = null;
  let payouts: { id: string; amount: number; arrivalDate: string; status: string }[] = [];
  if (stripeAccountId) {
    try {
      const stripe = getStripe();
      const list = await stripe.payouts.list({ limit: 20 }, { stripeAccount: stripeAccountId });
      payouts = list.data.map((p) => ({
        id: p.id,
        amount: p.amount / 100,
        arrivalDate: new Date(p.arrival_date * 1000).toISOString(),
        status: p.status,
      }));
      const pending = payouts
        .filter((p) => p.status === 'pending' || p.status === 'in_transit')
        .sort((a, b) => a.arrivalDate.localeCompare(b.arrivalDate));
      nextPayoutDate = pending[0]?.arrivalDate ?? null;
    } catch (err) {
      console.error('[landlord/financials] Stripe payouts.list failed:', err);
    }
  }

  return (
    <>
      <PageHeader title="Financials" subtitle="Rent collected across your properties." />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        <StatCard tone="gold" label="Rent Collected This Month" value={fmtMoney(collectedThisMonth)} />
        <StatCard
          tone="lightBlue"
          label="Late Fees Collected This Month"
          value={fmtMoney(lateFeesThisMonth)}
          sublabel="5% of rent — yours, not Rental911's"
        />
        <StatCard tone="navy" label="Outstanding Balance" value={fmtMoney(outstanding)} />
        <StatCard
          tone="lightBlue"
          label="Next Payout"
          value={nextPayoutDate ? fmtDate(nextPayoutDate) : '—'}
          sublabel={!stripeAccountId ? 'Connect Stripe to see payouts' : undefined}
        />
      </div>

      <Card className="mt-8">
        <CardHeader title="Transaction history" />
        {paidRows.length === 0 ? (
          <EmptyState title="No payments yet" message="Paid rent will appear here." />
        ) : (
          <DataTable columns={['Tenant', 'Unit', 'Amount', 'Method', 'Late Fee', 'Surcharge', 'Date', 'Status', 'Receipt']}>
            {paidRows.map((r) => (
              <tr key={r.id}>
                <td className="px-4 py-3 font-display font-bold text-navy">{r.tenant_name || '—'}</td>
                <td className="px-4 py-3">
                  {r.property_name || '—'}
                  {r.unit_number ? `, Unit ${r.unit_number}` : ''}
                </td>
                <td className="px-4 py-3">{fmtMoney(r.amount)}</td>
                <td className="px-4 py-3">{methodLabels[r.payment_method ?? ''] ?? '—'}</td>
                <td className="px-4 py-3">
                  {r.late_fee_amount ? fmtMoney(r.late_fee_amount) : '—'}
                </td>
                <td className="px-4 py-3">
                  {r.surcharge_amount ? fmtMoney(r.surcharge_amount) : '—'}
                </td>
                <td className="px-4 py-3">{fmtDate(r.paid_date)}</td>
                <td className="px-4 py-3">
                  <Badge value={r.status} />
                </td>
                <td className="px-4 py-3">
                  {r.receipt_path ? (
                    <a
                      href={`/api/receipts/${r.id}`}
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
      </Card>

      <Card className="mt-8">
        <CardHeader
          title="Monthly P&amp;L"
          subtitle="Rent and late fees collected, minus estimated Stripe processing fees you absorb (Rental911 takes no cut of either)."
        />
        {monthRows.length === 0 ? (
          <EmptyState title="Nothing yet" message="Your monthly summary will appear once rent has been collected." />
        ) : (
          <DataTable columns={['Month', 'Rent Collected', 'Late Fees', 'Est. Processing Fees', 'Net']}>
            {monthRows.map(([month, v]) => (
              <tr key={month}>
                <td className="px-4 py-3 font-display font-bold text-navy">{month}</td>
                <td className="px-4 py-3">{fmtMoney(v.collected)}</td>
                <td className="px-4 py-3">{fmtMoney(v.lateFees)}</td>
                <td className="px-4 py-3">{fmtMoney(v.fees)}</td>
                <td className="px-4 py-3">{fmtMoney(v.collected + v.lateFees - v.fees)}</td>
              </tr>
            ))}
          </DataTable>
        )}
      </Card>

      <Card className="mt-8">
        <CardHeader title="Payout history" subtitle="From your connected Stripe account." />
        {!stripeAccountId ? (
          <EmptyState title="Stripe not connected" message="Finish onboarding to start receiving payouts." />
        ) : payouts.length === 0 ? (
          <EmptyState title="No payouts yet" message="Payouts appear here once Stripe sends your first one." />
        ) : (
          <DataTable columns={['Amount', 'Arrival Date', 'Status']}>
            {payouts.map((p) => (
              <tr key={p.id}>
                <td className="px-4 py-3">{fmtMoney(p.amount)}</td>
                <td className="px-4 py-3">{fmtDate(p.arrivalDate)}</td>
                <td className="px-4 py-3">
                  <Badge value={p.status} />
                </td>
              </tr>
            ))}
          </DataTable>
        )}
      </Card>
    </>
  );
}
