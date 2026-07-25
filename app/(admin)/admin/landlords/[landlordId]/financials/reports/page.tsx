import Link from 'next/link';
import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase';
import { PageHeader } from '@/components/ui/PortalShell';
import { PnlReportView } from '@/components/financials/PnlReportView';
import { buildPnlReport, parsePeriod } from '@/lib/pnl';

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
  searchParams: { period?: string };
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
  const report = await buildPnlReport(supabase, period, new Date(), landlord.id);

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
        basePath={`/admin/landlords/${landlord.id}/financials/reports`}
        pdfHref={`/api/financials/pnl-pdf?period=${period}&landlordId=${landlord.id}`}
        emptyMessage="This landlord's P&L will populate once they have active leases and collected rent."
      />
    </>
  );
}
