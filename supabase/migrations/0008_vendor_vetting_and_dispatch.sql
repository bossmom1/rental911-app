-- =============================================================================
-- Phase 3 — vendor vetting/compliance fields + split dispatch model.
-- Idempotent: safe to re-run (add column if not exists no-ops on rerun, so
-- the inline check constraints below only ever apply on first creation).
-- =============================================================================

-- ---- vendors: vetting/compliance/membership fields --------------------------
alter table public.vendors add column if not exists license_number text;
alter table public.vendors add column if not exists license_expiry date;
alter table public.vendors add column if not exists license_status text
  check (license_status in ('active', 'expired', 'pending'));
alter table public.vendors add column if not exists insurance_confirmed boolean default false;
alter table public.vendors add column if not exists insurance_confirmed_date date;
alter table public.vendors add column if not exists vetted_at timestamptz;
-- Re-verify license + insurance every 6 months from vetted_at.
alter table public.vendors add column if not exists next_reverification_due timestamptz;
-- Authoritative for RLS (tenant visibility); the actual "is this really still
-- valid" check is also computed live wherever it matters (see lib/vendors.ts),
-- since there's no cron in this app to flip this the instant a date passes —
-- it's kept in sync whenever an admin edits a vendor's license/reverification
-- fields, and admin's own vendor list always shows the live-computed state
-- regardless of this column, so a stale flag can't hide an expired vendor
-- from the person who'd fix it.
alter table public.vendors add column if not exists is_hidden_lapsed boolean default false;
alter table public.vendors add column if not exists discount_offered text;
alter table public.vendors add column if not exists membership_start_date date;
alter table public.vendors add column if not exists membership_term_months integer default 6;
alter table public.vendors add column if not exists membership_status text
  check (membership_status in ('active', 'expired', 'pending'));
-- Vendor's GHL contact id, so dispatch notifications (email+SMS) can target them.
alter table public.vendors add column if not exists ghl_contact_id text;

-- ---- vendor_dispatches: split dispatch model ---------------------------------
alter table public.vendor_dispatches add column if not exists dispatch_type text
  check (dispatch_type in ('tenant', 'admin'));
-- Path A only: tenant's stated availability, shown to the vendor in the notification.
alter table public.vendor_dispatches add column if not exists tenant_availability text;
alter table public.vendor_dispatches add column if not exists confirmed_by text
  check (confirmed_by in ('tenant', 'vendor', 'admin'));

-- vendor_response previously had no check constraint and used 'accepted'/
-- 'declined'/'no_response' in comments only (never enforced). Both dispatch
-- paths are confirmation-based now, not accept/decline — add the constraint
-- fresh with the new vocabulary, and default new rows to 'pending'.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'vendor_dispatches_vendor_response_check'
  ) then
    alter table public.vendor_dispatches
      add constraint vendor_dispatches_vendor_response_check
      check (vendor_response in ('pending', 'confirmed', 'no_response'));
  end if;
end $$;
alter table public.vendor_dispatches alter column vendor_response set default 'pending';

-- ---- RLS ----------------------------------------------------------------------

-- Tenants may read the vendor directory, filtered to active + not lapsed —
-- this is the pool they self-dispatch from (Path A). Combined with the
-- landlord-read policy that already existed; admin already has full access.
drop policy if exists vendors_tenant_read on public.vendors;
create policy vendors_tenant_read on public.vendors
  for select using (
    public.current_user_role() = 'tenant' and is_hidden_lapsed = false and active = true
  );

-- Tenants may see dispatch records on their own maintenance requests.
drop policy if exists dispatch_tenant_select on public.vendor_dispatches;
create policy dispatch_tenant_select on public.vendor_dispatches
  for select using (
    request_id in (select id from public.maintenance_requests where tenant_id = auth.uid())
  );

-- Tenants may self-dispatch (Path A) on their own requests only.
drop policy if exists dispatch_tenant_insert on public.vendor_dispatches;
create policy dispatch_tenant_insert on public.vendor_dispatches
  for insert with check (
    dispatch_type = 'tenant'
    and request_id in (select id from public.maintenance_requests where tenant_id = auth.uid())
  );

-- Tenants may log a confirmed date/time (or a rating post-completion) on
-- their own request's dispatch. Row-scoped only — the Server Action layer is
-- what actually restricts which columns get sent in any given update, same
-- pattern as the rest of this app's write paths.
drop policy if exists dispatch_tenant_update on public.vendor_dispatches;
create policy dispatch_tenant_update on public.vendor_dispatches
  for update using (
    request_id in (select id from public.maintenance_requests where tenant_id = auth.uid())
  ) with check (
    request_id in (select id from public.maintenance_requests where tenant_id = auth.uid())
  );

-- ---- seed: starter vendor network --------------------------------------------
insert into public.vendors (name, trade, phone, email, avg_response_hours, active, license_status, membership_status, membership_term_months)
select 'SoMD Plumbing & Drain', 'plumbing', null, null, 24, true, 'pending', 'pending', 6
where not exists (select 1 from public.vendors where name = 'SoMD Plumbing & Drain');

insert into public.vendors (name, trade, phone, email, avg_response_hours, active, license_status, membership_status, membership_term_months)
select 'Charles County Electric', 'electrical', null, null, 24, true, 'pending', 'pending', 6
where not exists (select 1 from public.vendors where name = 'Charles County Electric');

insert into public.vendors (name, trade, phone, email, avg_response_hours, active, license_status, membership_status, membership_term_months)
select 'SoMD HVAC Solutions', 'hvac', null, null, 24, true, 'pending', 'pending', 6
where not exists (select 1 from public.vendors where name = 'SoMD HVAC Solutions');
