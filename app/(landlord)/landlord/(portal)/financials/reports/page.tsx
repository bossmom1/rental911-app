import { cookies } from 'next/headers';
import { createSupabaseServerClient } from '@/lib/supabase';
import { PageHeader } from '@/components/ui/PortalShell';
import { PnlReportView } from '@/components/financials/PnlReportView';
import {
  buildPnlReport,
  formatReferenceDateParam,
  parsePeriod,
  parseReferenceDate,
  shiftRangeStart,
} from '@/lib/pnl';

export const dynamic = 'force-dynamic';

export default async function LandlordPnlReports({
  searchParams,
}: {
  searchParams: { period?: string; date?: string };
}) {
  const supabase = createSupabaseServerClient(cookies());
  const period = parsePeriod(searchParams.period);
  const referenceDate = parseReferenceDate(searchParams.date);
  const referenceDateParam = formatReferenceDateParam(referenceDate);
  const report = await buildPnlReport(supabase, period, referenceDate);

  const basePath = '/landlord/financials/reports';
  const prevDateParam = formatReferenceDateParam(shiftRangeStart(report.range, -1));
  const nextDateParam = formatReferenceDateParam(shiftRangeStart(report.range, 1));

  return (
    <>
      <PageHeader
        title="P&L Reports"
        subtitle="Rent due, collected, and outstanding by property and unit."
      />
      <PnlReportView
        report={report}
        period={period}
        basePath={basePath}
        referenceDateParam={referenceDateParam}
        prevHref={`${basePath}?period=${period}&date=${prevDateParam}`}
        nextHref={`${basePath}?period=${period}&date=${nextDateParam}`}
        pdfHref={`/api/financials/pnl-pdf?period=${period}&date=${referenceDateParam}`}
        emptyMessage="Your P&L will populate once you have active leases and collected rent."
      />
    </>
  );
}
