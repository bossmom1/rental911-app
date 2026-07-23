import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { createSupabaseServerClient } from '@/lib/supabase';
import { getCurrentUser } from '@/lib/auth';
import { PageHeader } from '@/components/ui/PortalShell';
import { RequestDetail } from '@/components/maintenance/RequestDetail';
import { RealtimeRefresher } from '@/components/RealtimeRefresher';
import { TenantDispatchPanel } from '@/components/maintenance/TenantDispatchPanel';
import { RatingPanel } from '@/components/maintenance/RatingPanel';

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

  const { data: dispatches } = await supabase
    .from('vendor_dispatches')
    .select('*, vendor:vendors(name, phone, trade)')
    .eq('request_id', params.id)
    .order('dispatched_at', { ascending: false });

  // Vendor pool for self-dispatch: matching trade, active, not lapsed — RLS
  // already scopes tenants to is_hidden_lapsed=false + active=true.
  const { data: vendors } =
    request.priority !== 'emergency'
      ? await supabase.from('vendors').select('id, name, trade, avg_response_hours').eq('trade', request.category)
      : { data: [] };

  return (
    <>
      <RealtimeRefresher
        table="maintenance_requests"
        filter={`id=eq.${params.id}`}
        channelKey={`maint-detail-${params.id}`}
      />
      <RealtimeRefresher
        table="vendor_dispatches"
        filter={`request_id=eq.${params.id}`}
        channelKey={`dispatch-tenant-${params.id}`}
      />
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
      <TenantDispatchPanel
        requestId={params.id}
        priority={request.priority}
        vendors={vendors ?? []}
        dispatches={dispatches ?? []}
      />
      {request.status === 'completed' && dispatches && dispatches.length > 0 && (
        <RatingPanel dispatch={dispatches[0]} />
      )}
    </>
  );
}
