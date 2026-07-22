'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase';

/**
 * Drops into any server-rendered page to make it "live": subscribes to
 * Postgres changes on `table` (optionally scoped by `filter`, e.g.
 * `tenant_id=eq.${id}`) and calls router.refresh() on any change, so the
 * Server Component re-fetches fresh data instead of needing the aggregation
 * logic duplicated client-side. Renders nothing.
 *
 * Requires the table to be in the supabase_realtime publication — see
 * supabase/migrations/0007_enable_realtime.sql.
 */
export function RealtimeRefresher({
  table,
  filter,
  channelKey,
}: {
  table: string;
  filter?: string;
  channelKey: string;
}) {
  const router = useRouter();

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    const channel = supabase
      .channel(`live-${channelKey}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table, ...(filter ? { filter } : {}) },
        () => {
          router.refresh();
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [table, filter, channelKey, router]);

  return null;
}
