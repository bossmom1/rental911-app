import { cookies } from 'next/headers';
import { NextResponse, type NextRequest } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase';
import { getCurrentUser } from '@/lib/auth';
import { buildPnlReport, parsePeriod } from '@/lib/pnl';
import { renderPnlPdf } from '@/lib/pnl-pdf';
import { fmtDate } from '@/lib/format';

/**
 * GET /api/financials/pnl-pdf?period=month|quarter|year[&landlordId=...] —
 * renders the P&L PDF on demand (period is dynamic; unlike receipts this is
 * never pre-stored). RLS-scoped via the caller's own client (admin sees all,
 * landlord sees own).
 *
 * `landlordId` is honored ONLY for admin callers (see
 * /admin/landlords/[landlordId]/financials/reports) — a landlord's own RLS
 * already restricts them to their own data regardless of this param, so it's
 * ignored for that role rather than trusted from the query string.
 */
export async function GET(request: NextRequest) {
  const current = await getCurrentUser();
  if (!current?.profile || (current.profile.role !== 'landlord' && current.profile.role !== 'admin')) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 403 });
  }

  const period = parsePeriod(request.nextUrl.searchParams.get('period'));
  const supabase = createSupabaseServerClient(cookies());

  const requestedLandlordId =
    current.profile.role === 'admin'
      ? request.nextUrl.searchParams.get('landlordId') || undefined
      : undefined;

  let landlordName = current.profile.full_name || current.profile.email;
  if (requestedLandlordId) {
    const { data: landlord } = await supabase
      .from('users')
      .select('full_name, email')
      .eq('id', requestedLandlordId)
      .eq('role', 'landlord')
      .maybeSingle();
    if (!landlord) {
      return NextResponse.json({ error: 'Landlord not found.' }, { status: 404 });
    }
    landlordName = landlord.full_name || landlord.email;
  }

  const report = await buildPnlReport(supabase, period, new Date(), requestedLandlordId);

  const pdfBuffer = await renderPnlPdf({
    landlordName,
    generatedDate: fmtDate(new Date().toISOString().slice(0, 10)),
    report,
  });

  return new NextResponse(new Uint8Array(pdfBuffer), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="rental911-pnl-${period}.pdf"`,
    },
  });
}
