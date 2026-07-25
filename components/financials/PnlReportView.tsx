import Link from 'next/link';
import { Card, CardHeader } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { fmtMoney } from '@/lib/format';
import type { PnlPeriod, PnlReport } from '@/lib/pnl';

const TABS: { key: PnlPeriod; label: string }[] = [
  { key: 'month', label: 'Month' },
  { key: 'quarter', label: 'Quarter' },
  { key: 'year', label: 'Year' },
];

/**
 * Shared P&L presentation: period toggle, PDF download link, per-property →
 * per-unit breakdown, totals. Used by both the landlord-facing report
 * (/landlord/financials/reports) and the admin per-landlord report
 * (/admin/landlords/[landlordId]/financials/reports) — `basePath` builds the
 * period-tab links and `pdfHref` is the full (already query-stringed) PDF
 * download URL, so the two callers only differ in routing, not rendering.
 */
export function PnlReportView({
  report,
  period,
  basePath,
  pdfHref,
  emptyMessage = 'The P&L will populate once there are active leases and collected rent.',
}: {
  report: PnlReport;
  period: PnlPeriod;
  basePath: string;
  pdfHref: string;
  emptyMessage?: string;
}) {
  return (
    <>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex gap-2">
          {TABS.map((t) => (
            <Link
              key={t.key}
              href={`${basePath}?period=${t.key}`}
              className={`rounded-lg px-4 py-2.5 font-display font-bold ${
                period === t.key ? 'bg-navy text-white' : 'border-2 border-navy text-navy'
              }`}
            >
              {t.label}
            </Link>
          ))}
        </div>
        <a
          href={pdfHref}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center rounded-lg border-2 border-navy px-4 py-2.5 font-display font-bold text-navy hover:bg-light-blue/30"
        >
          Download PDF
        </a>
      </div>

      {report.properties.length === 0 ? (
        <EmptyState title="Nothing to report yet" message={emptyMessage} />
      ) : (
        <div className="space-y-4">
          {report.properties.map((p) => (
            <Card key={p.propertyId}>
              <CardHeader
                title={p.propertyName}
                subtitle={`Rent Due ${fmtMoney(p.rentDue)} · Collected ${fmtMoney(p.rentCollected)} · Outstanding ${fmtMoney(p.outstanding)} · Net ${fmtMoney(p.netToLandlord)}`}
              />
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-light-blue/60">
                      <th className="px-3 py-2 font-display font-bold text-navy">Unit</th>
                      <th className="px-3 py-2 font-display font-bold text-navy">Rent Due</th>
                      <th className="px-3 py-2 font-display font-bold text-navy">Collected</th>
                      <th className="px-3 py-2 font-display font-bold text-navy">Outstanding</th>
                      <th className="px-3 py-2 font-display font-bold text-navy">Net</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-light-blue/40">
                    {p.units.map((u) => (
                      <tr key={u.unitId}>
                        <td className="px-3 py-2 pl-6 text-ink/80">Unit {u.unitNumber ?? '—'}</td>
                        <td className="px-3 py-2">{fmtMoney(u.rentDue)}</td>
                        <td className="px-3 py-2">{fmtMoney(u.rentCollected)}</td>
                        <td className="px-3 py-2">{fmtMoney(u.outstanding)}</td>
                        <td className="px-3 py-2">{fmtMoney(u.netToLandlord)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          ))}

          <Card className="bg-light-blue/10">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div>
                <p className="text-ink/60">Rent Due</p>
                <p className="font-display text-xl font-bold text-navy">{fmtMoney(report.totals.rentDue)}</p>
              </div>
              <div>
                <p className="text-ink/60">Rent Collected</p>
                <p className="font-display text-xl font-bold text-navy">{fmtMoney(report.totals.rentCollected)}</p>
              </div>
              <div>
                <p className="text-ink/60">Outstanding</p>
                <p className="font-display text-xl font-bold text-navy">{fmtMoney(report.totals.outstanding)}</p>
              </div>
              <div>
                <p className="text-ink/60">Net to Landlord</p>
                <p className="font-display text-xl font-bold text-navy">{fmtMoney(report.totals.netToLandlord)}</p>
              </div>
            </div>
          </Card>
        </div>
      )}
    </>
  );
}
