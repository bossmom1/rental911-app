import { cookies } from 'next/headers';
import { createSupabaseServerClient } from '@/lib/supabase';
import { PageHeader } from '@/components/ui/PortalShell';
import { PnlReportView } from '@/components/financials/PnlReportView';
import { buildPnlReport, parsePeriod } from '@/lib/pnl';

export const dynamic = 'force-dynamic';

export default async function LandlordPnlReports({
  searchParams,
}: {
  searchParams: { period?: string };
}) {
  const supabase = createSupabaseServerClient(cookies());
  const period = parsePeriod(searchParams.period);
  const report = await buildPnlReport(supabase, period, new Date());

  return (
    <>
      <PageHeader
        title="P&L Reports"
        subtitle="Rent due, collected, and outstanding by property and unit."
      />
      <PnlReportView
        report={report}
        period={period}
        basePath="/landlord/financials/reports"
        pdfHref={`/api/financials/pnl-pdf?period=${period}`}
        emptyMessage="Your P&L will populate once you have active leases and collected rent."
      />
    </>
  );
}
