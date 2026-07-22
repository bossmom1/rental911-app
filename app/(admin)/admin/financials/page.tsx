import { cookies } from 'next/headers';
import { createSupabaseServerClient } from '@/lib/supabase';
import { PageHeader } from '@/components/ui/PortalShell';
import { StatCard } from '@/components/ui/StatCard';
import { Card, CardHeader } from '@/components/ui/Card';
import { DataTable, EmptyState } from '@/components/ui/EmptyState';
import { fmtMoney, fmtDate } from '@/lib/format';
import {
  fetchPaymentRows,
  isThisMonth,
  LATE_STATUSES,
  OUTSTANDING_STATUSES,
  sumAmount,
  sumLateFees,
} from '@/lib/financials';
import { RealtimeRefresher } from '@/components/RealtimeRefresher';

export const dynamic = 'force-dynamic';

const methodLabels: Record<string, string> = {
  ach: 'Bank transfer',
  card_credit: 'Credit card',
  card_debit: 'Debit card',
};

export default async function AdminFinancials() {
  const supabase = createSupabaseServerClient(cookies());
  const rows = await fetchPaymentRows(supabase);

  const paidThisMonth = rows.filter((r) => r.status === 'paid' && isThisMonth(r.paid_date));
  const collectedThisMonth = sumAmount(paidThisMonth);
  const lateFeesThisMonth = sumLateFees(paidThisMonth);
  const outstandingRows = rows.filter((r) => OUTSTANDING_STATUSES.includes(r.status ?? ''));
  const outstanding = sumAmount(outstandingRows);
  const lateRows = rows
    .filter((r) => LATE_STATUSES.includes(r.status ?? ''))
    .sort((a, b) => (a.due_date ?? '').localeCompare(b.due_date ?? ''));

  // Group by property for the per-property table.
  const byProperty = new Map<
    string,
    { name: string; unitIds: Set<string>; due: number; collected: number; lateFees: number; outstanding: number }
  >();
  for (const r of rows) {
    const key = r.property_id ?? 'unassigned';
    if (!byProperty.has(key)) {
      byProperty.set(key, {
        name: r.property_name ?? 'Unassigned property',
        unitIds: new Set(),
        due: 0,
        collected: 0,
        lateFees: 0,
        outstanding: 0,
      });
    }
    const entry = byProperty.get(key)!;
    if (r.unit_number) entry.unitIds.add(`${key}:${r.unit_number}`);
    const amount = Number(r.amount ?? 0);
    entry.due += amount;
    if (r.status === 'paid' && isThisMonth(r.paid_date)) {
      entry.collected += amount;
      entry.lateFees += Number(r.late_fee_amount ?? 0);
    }
    if (OUTSTANDING_STATUSES.includes(r.status ?? '')) entry.outstanding += amount;
  }
  const propertyRows = [...byProperty.values()].sort((a, b) => b.due - a.due);

  return (
    <>
      <RealtimeRefresher table="rent_payments" channelKey="rent-admin" />
      <PageHeader
        title="Financials"
        subtitle="Platform-wide rent collection. Rental911 takes no cut of rent — there is no platform-fee figure here."
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard tone="gold" label="Rent Collected This Month" value={fmtMoney(collectedThisMonth)} />
        <StatCard
          tone="lightBlue"
          label="Late Fees Collected This Month"
          value={fmtMoney(lateFeesThisMonth)}
          sublabel="5% of rent, tenant-paid — not blended into rent"
        />
        <StatCard tone="navy" label="Outstanding Balances" value={fmtMoney(outstanding)} />
      </div>

      <Card className="mt-8">
        <CardHeader title="By property" subtitle="Rent due, collected this month, late fees, and outstanding, per property." />
        {propertyRows.length === 0 ? (
          <EmptyState title="No rent activity yet" message="Payments will appear here once tenants start paying rent." />
        ) : (
          <DataTable columns={['Property', 'Units', 'Rent Due', 'Rent Collected', 'Late Fees', 'Outstanding']}>
            {propertyRows.map((p, i) => (
              <tr key={i}>
                <td className="px-4 py-3 font-display font-bold text-navy">{p.name}</td>
                <td className="px-4 py-3">{p.unitIds.size || '—'}</td>
                <td className="px-4 py-3">{fmtMoney(p.due)}</td>
                <td className="px-4 py-3">{fmtMoney(p.collected)}</td>
                <td className="px-4 py-3">{fmtMoney(p.lateFees)}</td>
                <td className="px-4 py-3">{fmtMoney(p.outstanding)}</td>
              </tr>
            ))}
          </DataTable>
        )}
      </Card>

      <Card className="mt-8">
        <CardHeader title="Late rent" subtitle="Payments currently late or failed." />
        {lateRows.length === 0 ? (
          <EmptyState title="Nothing late" message="All rent is current." />
        ) : (
          <DataTable columns={['Tenant', 'Property', 'Amount', 'Due Date', 'Status']}>
            {lateRows.map((r) => (
              <tr key={r.id}>
                <td className="px-4 py-3 font-display font-bold text-navy">{r.tenant_name || '—'}</td>
                <td className="px-4 py-3">
                  {r.property_name || '—'}
                  {r.unit_number ? `, Unit ${r.unit_number}` : ''}
                </td>
                <td className="px-4 py-3">{fmtMoney(r.amount)}</td>
                <td className="px-4 py-3">{fmtDate(r.due_date)}</td>
                <td className="px-4 py-3 capitalize">{r.status}</td>
              </tr>
            ))}
          </DataTable>
        )}
      </Card>
    </>
  );
}
