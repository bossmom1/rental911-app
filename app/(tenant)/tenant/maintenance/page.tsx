import { cookies } from 'next/headers';
import { createSupabaseServerClient } from '@/lib/supabase';
import { getCurrentUser } from '@/lib/auth';
import { PageHeader } from '@/components/ui/PortalShell';
import { RequestList } from '@/components/maintenance/RequestList';
import { LinkButton } from '@/components/ui/Button';

export const dynamic = 'force-dynamic';

export default async function TenantMaintenance() {
  const supabase = createSupabaseServerClient(cookies());
  const current = await getCurrentUser();
  const { data } = await supabase
    .from('maintenance_requests')
    .select('id, title, category, priority, status, created_at')
    .eq('tenant_id', current!.authId)
    .order('created_at', { ascending: false });

  return (
    <>
      <PageHeader
        title="Maintenance"
        subtitle="Your maintenance requests."
        action={
          <LinkButton href="/tenant/maintenance/new" variant="gold">
            + New request
          </LinkButton>
        }
      />
      <RequestList requests={data ?? []} basePath="/tenant/maintenance" />
    </>
  );
}
