-- =============================================================================
-- Enable Supabase Realtime for maintenance_chat, maintenance_requests, and
-- rent_payments.
--
-- No table in this project was ever added to the supabase_realtime
-- publication. MaintenanceChat.tsx already subscribes to postgres_changes
-- INSERT events on maintenance_chat for live updates between tenant/landlord/
-- admin participants, but the subscription silently never fired — degrading
-- (by design, per the component's own comment) to each participant only
-- seeing their own messages append locally until a manual refresh.
--
-- maintenance_requests (status changes) and rent_payments (payment updates)
-- are added here too, with RealtimeRefresher (components/RealtimeRefresher.tsx)
-- wired into every relevant list/detail/financials page to router.refresh()
-- on change. This migration is the other half — without it, none of those
-- subscriptions receive anything, same as maintenance_chat's silent no-op.
-- Idempotent: safe to re-run (no-ops if already added).
-- =============================================================================

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'maintenance_chat'
  ) then
    alter publication supabase_realtime add table public.maintenance_chat;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'maintenance_requests'
  ) then
    alter publication supabase_realtime add table public.maintenance_requests;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'rent_payments'
  ) then
    alter publication supabase_realtime add table public.rent_payments;
  end if;
end $$;
