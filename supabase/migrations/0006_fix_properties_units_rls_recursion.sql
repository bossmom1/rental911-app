-- =============================================================================
-- Fix: infinite recursion between the properties and units RLS policies.
--
-- properties_tenant_read (on properties) subqueries units + leases to check
-- whether the caller is a tenant of that property. units_landlord_all (on
-- units) subqueries properties to check landlord ownership. Any query that
-- joins units -> properties (e.g. the tenant dashboard's
-- `leases -> units -> properties` embed) makes Postgres evaluate both
-- policies, which each re-trigger the other table's RLS, looping forever:
--   ERROR: infinite recursion detected in policy for relation "properties"
--
-- Fix: SECURITY DEFINER helper functions (same pattern as the existing
-- is_admin()) that read the other table directly, bypassing its RLS, so
-- evaluating one policy never re-triggers the other's.
-- Idempotent: safe to re-run.
-- =============================================================================

create or replace function public.property_owned_by_caller(prop_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.properties where id = prop_id and landlord_id = auth.uid()
  )
$$;

create or replace function public.property_leased_by_caller(prop_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.units u
    join public.leases l on l.unit_id = u.id
    where u.property_id = prop_id and l.tenant_id = auth.uid()
  )
$$;

drop policy if exists units_landlord_all on public.units;
create policy units_landlord_all on public.units
  for all using (public.property_owned_by_caller(property_id))
  with check (public.property_owned_by_caller(property_id));

drop policy if exists properties_tenant_read on public.properties;
create policy properties_tenant_read on public.properties
  for select using (public.property_leased_by_caller(id));
