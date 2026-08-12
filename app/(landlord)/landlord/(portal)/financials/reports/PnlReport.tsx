'use client';

import Link from 'next/link';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';

interface RentPayment {
  id: string;
  amount: number | null;
  status: string | null;
  due_date: string | null;
  paid_date: string | null;
}

interface Lease {
  id: string;
  monthly_rent: number | null;
  status: string | null;
  start_date: string | null;
  end_date: string | null;
  rent_payments: RentPayment[];
}

interface Unit {
  id: string;
  unit_number: string | null;
  monthly_rent: number | null;
  status: string | null;
  leases: Lease[];
}

interface Property {
  id: string;
  name: string | null;
  address: string | null;
  units: Unit[];
}

interface Props {
  properties: Property[];
  period: 'month' | 'quarter' | 'year';
  year: number;
  quarter: number;
  month: number;
  rangeStart: string;
  rangeEnd: string;
}

const MONTHS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];

export function PnlReport({ properties, period, year, quarter, month, rangeStart, rangeEnd }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  function nav(params: Record<string, string>) {
    const next = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(params)) next.set(k, v);
    router.push(`${pathname}?${next.toString()}`);
  }

  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 5 }, (_, i) => currentYear - i);

  // For each property, compute P&L over the range
  const propRows = properties.map((prop) => {
    const unitRows = prop.units.map((unit) => {
      // Active leases during the range
      const activeLeases = unit.leases.filter(
        (l) =>
          l.status === 'active' ||
          (l.start_date && l.start_date <= rangeEnd && (!l.end_date || l.end_date >= rangeStart))
      );

      // Rent due: sum of due dates within range across active leases
      const paymentsInRange = activeLeases.flatMap((l) =>
        l.rent_payments.filter((p) => p.due_date && p.due_date >= rangeStart && p.due_date <= rangeEnd)
      );

      const rentDue = paymentsInRange.reduce((s, p) => s + Number(p.amount ?? 0), 0);
      const rentCollected = paymentsInRange
        .filter((p) => p.status === 'paid')
        .reduce((s, p) => s + Number(p.amount ?? 0), 0);
      const outstanding = Math.max(0, rentDue - rentCollected);

      return { unit, rentDue, rentCollected, outstanding };
    });

    const totalDue = unitRows.reduce((s, r) => s + r.rentDue, 0);
    const totalCollected = unitRows.reduce((s, r) => s + r.rentCollected, 0);
    const totalOutstanding = unitRows.reduce((s, r) => s + r.outstanding, 0);

    return { prop, unitRows, totalDue, totalCollected, totalOutstanding };
  });

  const grandDue = propRows.reduce((s, r) => s + r.totalDue, 0);
  const grandCollected = propRows.reduce((s, r) => s + r.totalCollected, 0);
  const grandOutstanding = propRows.reduce((s, r) => s + r.totalOutstanding, 0);

  const fmt = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const periodLabel =
    period === 'month'
      ? `${MONTHS[month - 1]} ${year}`
      : period === 'quarter'
      ? `Q${quarter} ${year}`
      : `${year} (Full Year)`;

  return (
    <div>
      {/* Period controls */}
      <div className="mb-6 flex flex-wrap gap-3 items-center">
        <div className="flex rounded border border-gray-300 overflow-hidden text-sm font-bold">
          {(['month', 'quarter', 'year'] as const).map((p) => (
            <button
              key={p}
              onClick={() => nav({ period: p })}
              className={`px-4 py-1.5 ${period === p ? 'bg-navy text-white' : 'text-navy bg-white hover:bg-gray-50'}`}
            >
              {p === 'month' ? 'Month' : p === 'quarter' ? 'Quarter' : 'Year'}
            </button>
          ))}
        </div>

        <select
          value={year}
          onChange={(e) => nav({ year: e.target.value })}
          className="rounded border border-gray-300 px-3 py-1.5 text-sm"
        >
          {years.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>

        {period === 'month' && (
          <select
            value={month}
            onChange={(e) => nav({ month: e.target.value })}
            className="rounded border border-gray-300 px-3 py-1.5 text-sm"
          >
            {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
          </select>
        )}

        {period === 'quarter' && (
          <select
            value={quarter}
            onChange={(e) => nav({ quarter: e.target.value })}
            className="rounded border border-gray-300 px-3 py-1.5 text-sm"
          >
            {[1, 2, 3, 4].map((q) => <option key={q} value={q}>Q{q}</option>)}
          </select>
        )}

        <Link
          href={`/landlord/financials/export?year=${year}`}
          className="ml-auto text-sm font-bold text-navy underline"
        >
          Year-End Export →
        </Link>
      </div>

      <h2 className="mb-4 font-display font-bold text-navy text-lg">{periodLabel}</h2>

      {propRows.length === 0 ? (
        <p className="text-ink/60 text-sm">No properties yet.</p>
      ) : (
        <div className="space-y-6">
          {propRows.map(({ prop, unitRows, totalDue, totalCollected, totalOutstanding }) => (
            <div key={prop.id} className="rounded-lg border border-gray-200 overflow-hidden">
              {/* Property header */}
              <div className="flex items-center justify-between bg-navy/5 px-4 py-2">
                <span className="font-display font-bold text-navy">
                  {prop.name || prop.address}
                </span>
                <div className="flex gap-6 text-sm text-right">
                  <span className="text-ink/70">Due: <strong>{fmt(totalDue)}</strong></span>
                  <span className="text-green-700">Collected: <strong>{fmt(totalCollected)}</strong></span>
                  {totalOutstanding > 0 && (
                    <span className="text-red-600">Outstanding: <strong>{fmt(totalOutstanding)}</strong></span>
                  )}
                </div>
              </div>

              {/* Unit breakdown */}
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-ink/60 text-xs">
                    <th className="px-4 py-2 text-left font-normal">Unit</th>
                    <th className="px-4 py-2 text-right font-normal">Rent Due</th>
                    <th className="px-4 py-2 text-right font-normal">Collected</th>
                    <th className="px-4 py-2 text-right font-normal">Outstanding</th>
                    <th className="px-4 py-2 text-right font-normal">Net to You</th>
                  </tr>
                </thead>
                <tbody>
                  {unitRows.map(({ unit, rentDue, rentCollected, outstanding }) => (
                    <tr key={unit.id} className="border-b border-gray-50 last:border-0">
                      <td className="px-4 py-2">{unit.unit_number ?? 'Unit'}</td>
                      <td className="px-4 py-2 text-right">{fmt(rentDue)}</td>
                      <td className="px-4 py-2 text-right text-green-700">{fmt(rentCollected)}</td>
                      <td className="px-4 py-2 text-right text-red-600">
                        {outstanding > 0 ? fmt(outstanding) : '—'}
                      </td>
                      <td className="px-4 py-2 text-right font-medium">{fmt(rentCollected)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}

          {/* Grand total */}
          <div className="rounded-lg border-2 border-navy px-4 py-3 flex flex-wrap gap-6 items-center">
            <span className="font-display font-bold text-navy">Total — {periodLabel}</span>
            <span className="text-sm text-ink/70">Due: <strong>{fmt(grandDue)}</strong></span>
            <span className="text-sm text-green-700">Collected: <strong>{fmt(grandCollected)}</strong></span>
            {grandOutstanding > 0 && (
              <span className="text-sm text-red-600">Outstanding: <strong>{fmt(grandOutstanding)}</strong></span>
            )}
            <span className="text-sm font-bold text-navy ml-auto">Net to You: {fmt(grandCollected)}</span>
          </div>

          <p className="text-xs text-ink/50">
            Net to You = rent collected. Rental911 does not take a platform fee from rent payments.
          </p>
        </div>
      )}
    </div>
  );
}
