import Link from 'next/link';
import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
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

/**
 * Admin-only view of a single landlord's P&L — same report/PDF/period logic
 * as /landlord/financials/reports, just scoped to `landlordId` instead of
 * the caller's own id. The admin server client already bypasses the
 * landlord-only RLS restriction on properties/leases/rent_payments (see
 * `*_admin_all` policies in supabase/schema.sql via `is_admin()`); the
 * landlordId param is what narrows that otherwise-platform-wide access down
 * to one landlord (see lib/pnl.ts buildPnlReport).
 */
export default async function AdminLandlordPnlReports({
  params,
  searchParams,
}: {
  params: { landlordId: string };
  searchParams: { period?: string; date?: string };
}) {
  const supabase = createSupabaseServerClient(cookies());

  const { data: landlord } = await supabase
    .from('users')
    .select('id, full_name, email')
    .eq('id', params.landlordId)
    .eq('role', 'landlord')
    .maybeSingle();
  if (!landlord) notFound();

  const period = parsePeriod(searchParams.period);
  const referenceDate = parseReferenceDate(searchParams.date);
  const referenceDateParam = formatReferenceDateParam(referenceDate);
  const report = await buildPnlReport(supabase, period, referenceDate, landlord.id);

  const basePath = `/admin/landlords/${landlord.id}/financials/reports`;
  const prevDateParam = formatReferenceDateParam(shiftRangeStart(report.range, -1));
  const nextDateParam = formatReferenceDateParam(shiftRangeStart(report.range, 1));

  return (
    <>
      <PageHeader
        title={`P&L Reports — ${landlord.full_name || landlord.email}`}
        subtitle="Rent due, collected, and outstanding by property and unit."
        action={
          <Link href="/admin/landlords" className="text-navy underline">
            Back to Landlords
          </Link>
        }
      />
      <PnlReportView
        report={report}
        period={period}
        basePath={basePath}
        referenceDateParam={referenceDateParam}
        prevHref={`${basePath}?period=${period}&date=${prevDateParam}`}
        nextHref={`${basePath}?period=${period}&date=${nextDateParam}`}
        pdfHref={`/api/financials/pnl-pdf?period=${period}&date=${referenceDateParam}&landlordId=${landlord.id}`}
        emptyMessage="This landlord's P&L will populate once they have active leases and collected rent."
      />
    </>
  );
}
