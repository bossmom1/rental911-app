import { cookies } from 'next/headers';
import { createSupabaseServerClient } from '@/lib/supabase';
import { getCurrentUser } from '@/lib/auth';
import { PageHeader } from '@/components/ui/PortalShell';
import { RequestList } from '@/components/maintenance/RequestList';

export const dynamic = 'force-dynamic';

export default async function LandlordMaintenance() {
  const supabase = createSupabaseServerClient(cookies());
  const current = await getCurrentUser();
  const { data } = await supabase
    .from('maintenance_requests')
    .select('id, title, category, priority, status, created_at')
    .eq('landlord_id', current!.authId)
    .order('created_at', { ascending: false });

  return (
    <>
      <PageHeader
        title="Maintenance"
        subtitle="Requests submitted by your tenants."
      />
      <RequestList requests={data ?? []} basePath="/landlord/maintenance" />
    </>
  );
}
