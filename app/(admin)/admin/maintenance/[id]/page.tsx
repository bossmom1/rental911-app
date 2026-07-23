import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { createSupabaseServerClient } from '@/lib/supabase';
import { getCurrentUser } from '@/lib/auth';
import { PageHeader } from '@/components/ui/PortalShell';
import { RequestDetail } from '@/components/maintenance/RequestDetail';
import { RealtimeRefresher } from '@/components/RealtimeRefresher';
import { AdminDispatchPanel } from '@/components/maintenance/AdminDispatchPanel';
import { isDispatchOverdue, isVendorLapsed } from '@/lib/vendors';

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

  const { data: rawDispatches } = await supabase
    .from('vendor_dispatches')
    .select('*, vendor:vendors(name, phone, avg_response_hours)')
    .eq('request_id', params.id)
    .order('dispatched_at', { ascending: false });

  const dispatches = (rawDispatches ?? []).map((d) => ({
    ...d,
    vendor: d.vendor ? { name: d.vendor.name, phone: d.vendor.phone } : null,
    overdue: isDispatchOverdue(d, d.vendor?.avg_response_hours ?? 24),
  }));

  const { data: rawVendors } = await supabase
    .from('vendors')
    .select('id, name, trade, avg_response_hours, active, license_status, next_reverification_due, is_hidden_lapsed')
    .eq('trade', request.category)
    .eq('active', true);

  const vendors = (rawVendors ?? []).filter((v) => !isVendorLapsed(v));

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
        channelKey={`dispatch-admin-${params.id}`}
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
      <AdminDispatchPanel requestId={params.id} vendors={vendors} dispatches={dispatches} />
    </>
  );
}
