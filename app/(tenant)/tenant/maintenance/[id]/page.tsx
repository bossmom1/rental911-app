import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { createSupabaseServerClient } from '@/lib/supabase';
import { getCurrentUser } from '@/lib/auth';
import { PageHeader } from '@/components/ui/PortalShell';
import { RequestDetail } from '@/components/maintenance/RequestDetail';

export const dynamic = 'force-dynamic';

export default async function TenantMaintenanceDetail({
  params,
}: {
  params: { id: string };
}) {
  const supabase = createSupabaseServerClient(cookies());
  const current = await getCurrentUser();

  const { data: request } = await supabase
    .from('maintenance_requests')
    .select('*, unit:units(unit_number, property:properties(name))')
    .eq('id', params.id)
    .maybeSingle();

  if (!request) notFound();

  const { data: messages } = await supabase
    .from('maintenance_chat')
    .select('*')
    .eq('request_id', params.id)
    .order('created_at', { ascending: true });

  const unit = (request as any).unit;
  const unitLabel = unit
    ? `${unit.property?.name ?? 'Your home'} · Unit ${unit.unit_number ?? '—'}`
    : 'Your home';

  return (
    <>
      <div className="mb-4">
        <Link href="/tenant/maintenance" className="text-navy underline">
          ← Back to maintenance
        </Link>
      </div>
      <PageHeader title={request.title || 'Maintenance request'} subtitle={unitLabel} />
      {/* Tenants can chat but not change status; AI summary is admin/landlord-only. */}
      <RequestDetail
        request={request}
        unitLabel={unitLabel}
        messages={messages ?? []}
        currentUserId={current!.authId}
        currentRole="tenant"
        canEditStatus={false}
        showSummary={false}
      />
    </>
  );
}
