import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { createSupabaseServerClient } from '@/lib/supabase';
import { getCurrentUser } from '@/lib/auth';
import { PageHeader } from '@/components/ui/PortalShell';
import { RequestDetail } from '@/components/maintenance/RequestDetail';
import { RealtimeRefresher } from '@/components/RealtimeRefresher';

export const dynamic = 'force-dynamic';

export default async function AdminMaintenanceDetail({
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
    ? `${unit.property?.name ?? 'Property'} · Unit ${unit.unit_number ?? '—'}`
    : 'Unit unassigned';

  return (
    <>
      <RealtimeRefresher
        table="maintenance_requests"
        filter={`id=eq.${params.id}`}
        channelKey={`maint-detail-${params.id}`}
      />
      <div className="mb-4">
        <Link href="/admin/maintenance" className="text-navy underline">
          ← Back to maintenance
        </Link>
      </div>
      <PageHeader title={request.title || 'Maintenance request'} subtitle={unitLabel} />
      <RequestDetail
        request={request}
        unitLabel={unitLabel}
        messages={messages ?? []}
        currentUserId={current!.authId}
        currentRole="admin"
        canEditStatus
        showSummary
      />
    </>
  );
}
