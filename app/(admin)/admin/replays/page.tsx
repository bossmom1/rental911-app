import { cookies } from 'next/headers';
import { createSupabaseServerClient } from '@/lib/supabase';
import { PageHeader } from '@/components/ui/PortalShell';
import { DataTable, EmptyState } from '@/components/ui/EmptyState';
import { AddReplayPanel } from '@/components/admin/AddReplayPanel';
import { ReplayRow } from '@/components/admin/ReplayRow';

export const dynamic = 'force-dynamic';

export default async function AdminReplays() {
  const supabase = createSupabaseServerClient(cookies());
  const { data: replays } = await supabase.from('qa_replays').select('*').order('recorded_at', { ascending: false });

  const rows = replays ?? [];

  return (
    <>
      <PageHeader title="Q&A Replays" subtitle="Upload recordings for Members to view in their portal." />
      <AddReplayPanel />
      {rows.length === 0 ? (
        <EmptyState title="No replays yet" message="Add the first Q&A replay for Members to watch." />
      ) : (
        <DataTable columns={['Title', 'Recorded', 'Recording', 'Action']}>
          {rows.map((r) => (
            <ReplayRow key={r.id} replay={r} />
          ))}
        </DataTable>
      )}
    </>
  );
}
