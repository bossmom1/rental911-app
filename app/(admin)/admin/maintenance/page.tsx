import { cookies } from 'next/headers';
import { createSupabaseServerClient } from '@/lib/supabase';
import { PageHeader } from '@/components/ui/PortalShell';
import { RequestList } from '@/components/maintenance/RequestList';

export const dynamic = 'force-dynamic';

export default async function AdminMaintenance() {
  const supabase = createSupabaseServerClient(cookies());
  const { data } = await supabase
    .from('maintenance_requests')
    .select('id, title, category, priority, status, created_at')
    .order('created_at', { ascending: false });

  return (
    <>
      <PageHeader
        title="Maintenance"
        subtitle="All maintenance requests across the platform."
      />
      <RequestList requests={data ?? []} basePath="/admin/maintenance" />
    </>
  );
}
