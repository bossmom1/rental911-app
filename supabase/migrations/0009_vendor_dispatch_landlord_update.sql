-- =============================================================================
-- Landlords could read vendor_dispatches for their own requests but never
-- update them, so StatusUpdater had no RLS-legal way to flip
-- completion_confirmed when a landlord (not admin) marks a request completed
-- — the admin-only "dispatch_admin_all" policy silently blocked it. Row-scoped
-- only, matching the existing dispatch_tenant_update convention: the Server/
-- client code layer is what actually restricts which columns get sent.
-- =============================================================================
drop policy if exists dispatch_landlord_update on public.vendor_dispatches;
create policy dispatch_landlord_update on public.vendor_dispatches
  for update using (
    request_id in (select id from public.maintenance_requests where landlord_id = auth.uid())
  ) with check (
    request_id in (select id from public.maintenance_requests where landlord_id = auth.uid())
  );
