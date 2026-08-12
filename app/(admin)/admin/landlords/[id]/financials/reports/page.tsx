import { notFound } from 'next/navigation';
import { cookies } from 'next/headers';
import { createSupabaseServerClient } from '@/lib/supabase';
import { PageHeader } from '@/components/ui/PortalShell';
import { PnlReport } from '@/app/(landlord)/landlord/(portal)/financials/reports/PnlReport';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default async function AdminLandlordReportsPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { period?: string; year?: string; quarter?: string; month?: string };
}) {
  const supabase = createSupabaseServerClient(cookies());

  const [{ data: landlord }, { data: properties }] = await Promise.all([
    supabase
      .from('users')
      .select('id, full_name, email')
      .eq('id', params.id)
      .single(),
    supabase
      .from('properties')
      .select(`
        id, name, address,
        units (
          id, unit_number, monthly_rent, status,
          leases (
            id, monthly_rent, status, start_date, end_date,
            rent_payments (
              id, amount, status, due_date, paid_date
            )
          )
        )
      `)
      .eq('landlord_id', params.id)
      .order('name'),
  ]);

  if (!landlord) notFound();

  const period = (searchParams.period as 'month' | 'quarter' | 'year') || 'month';
  const now = new Date();
  const year = Number(searchParams.year || now.getFullYear());
  const quarter = Number(searchParams.quarter || Math.ceil((now.getMonth() + 1) / 3));
  const month = Number(searchParams.month || now.getMonth() + 1);

  let rangeStart: string;
  let rangeEnd: string;
  if (period === 'month') {
    rangeStart = `${year}-${String(month).padStart(2, '0')}-01`;
    const last = new Date(year, month, 0).getDate();
    rangeEnd = `${year}-${String(month).padStart(2, '0')}-${last}`;
  } else if (period === 'quarter') {
    const qStart = (quarter - 1) * 3 + 1;
    const qEnd = qStart + 2;
    rangeStart = `${year}-${String(qStart).padStart(2, '0')}-01`;
    const last = new Date(year, qEnd, 0).getDate();
    rangeEnd = `${year}-${String(qEnd).padStart(2, '0')}-${last}`;
  } else {
    rangeStart = `${year}-01-01`;
    rangeEnd = `${year}-12-31`;
  }

  return (
    <>
      <PageHeader
        title={`${landlord.full_name || landlord.email} — P&L Reports`}
        subtitle={landlord.email}
      />

      <div className="mb-4">
        <Link href="/admin/landlords" className="text-sm text-navy underline">
          ← Back to Landlords
        </Link>
        {' · '}
        <a
          href={`/api/landlord/financials/export?landlordId=${params.id}&year=${year}`}
          download
          className="text-sm text-navy underline"
        >
          Download {year} CSV
        </a>
      </div>

      <PnlReport
        properties={properties ?? []}
        period={period}
        year={year}
        quarter={quarter}
        month={month}
        rangeStart={rangeStart}
        rangeEnd={rangeEnd}
      />
    </>
  );
}
