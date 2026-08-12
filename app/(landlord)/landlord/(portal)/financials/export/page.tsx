import { cookies } from 'next/headers';
import { createSupabaseServerClient } from '@/lib/supabase';
import { getCurrentUser } from '@/lib/auth';
import { PageHeader } from '@/components/ui/PortalShell';
import { ExportForm } from './ExportForm';

export const dynamic = 'force-dynamic';

export default async function LandlordExportPage({
  searchParams,
}: {
  searchParams: { year?: string };
}) {
  const current = await getCurrentUser();
  const meId = current!.authId;
  const year = Number(searchParams.year || new Date().getFullYear());

  return (
    <>
      <PageHeader
        title="Year-End Tax Export"
        subtitle="Download a CSV of all rent payments for your records or accountant."
      />
      <ExportForm landlordId={meId} defaultYear={year} />
      <p className="mt-4 text-xs text-ink/50 max-w-lg">
        For use with Schedule E or your accountant — consult a tax professional regarding your specific reporting requirements.
      </p>
    </>
  );
}
