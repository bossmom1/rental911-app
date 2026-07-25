-- =============================================================================
-- Phase 4 — Compliance module + lease renewal workflow.
-- Idempotent: safe to re-run (add column if not exists / create table if not
-- exists no-op on rerun; the inline unique constraint below only ever applies
-- on first creation, matching the pattern established in migration 0008).
-- =============================================================================

-- ---- compliance_items: last-updated tracking + upsert-safety ----------------
alter table public.compliance_items add column if not exists updated_at timestamptz default now();

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'compliance_items_property_type_key'
  ) then
    alter table public.compliance_items
      add constraint compliance_items_property_type_key unique (property_id, type);
  end if;
end $$;

-- ---- daily compliance-status flip, called by app/api/cron/compliance-check --
-- Mirrors the two UPDATEs from the Phase 4 spec exactly (same predicates/order).
-- Returns only the rows that just transitioned to expiring_soon, so the caller
-- knows exactly which landlords to email — expired transitions are silent
-- (surfaced instead via the live admin/landlord dashboard queries).
create or replace function public.flip_compliance_statuses()
returns setof public.compliance_items
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
    update public.compliance_items
    set status = 'expiring_soon', alert_sent = true, updated_at = now()
    where expiry_date <= current_date + interval '30 days'
      and expiry_date > current_date
      and status = 'current'
      and alert_sent = false
    returning *;

  update public.compliance_items
  set status = 'expired', updated_at = now()
  where expiry_date < current_date
    and status != 'expired';
end;
$$;

-- ---- leases: month-to-month flag (Option B of the renewal workflow) ---------
-- A new leases.status value would break every existing status='active' filter
-- (rent_payments joins, tenant-facing queries, the new P&L "Rent Due" calc), so
-- month-to-month stays status='active' with a side flag instead.
alter table public.leases add column if not exists is_month_to_month boolean default false;
alter table public.leases add column if not exists month_to_month_note text;

-- ---- lease_renewals: draft renewal workflow (Option A) ----------------------
-- Kept entirely separate from `leases` so a draft never leaks into any
-- status='active' filter before the landlord confirms the tenant has signed.
create table if not exists public.lease_renewals (
  id uuid primary key default gen_random_uuid(),
  lease_id uuid references public.leases(id) on delete cascade,
  landlord_id uuid references public.users(id) on delete set null,  -- denormalized for simple RLS
  new_end_date date,
  new_monthly_rent numeric,
  status text check (status in ('draft_review', 'sent_to_tenant', 'signed', 'cancelled'))
    default 'draft_review',
  sent_to_tenant_at timestamptz,
  signed_at timestamptz,
  new_lease_id uuid references public.leases(id) on delete set null,  -- set once signed
  created_at timestamptz default now()
);

create index if not exists idx_lease_renewals_lease on public.lease_renewals(lease_id);

alter table public.lease_renewals enable row level security;

drop policy if exists lease_renewals_admin_all on public.lease_renewals;
create policy lease_renewals_admin_all on public.lease_renewals
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists lease_renewals_landlord_all on public.lease_renewals;
create policy lease_renewals_landlord_all on public.lease_renewals
  for all using (landlord_id = auth.uid()) with check (landlord_id = auth.uid());

-- Intentionally no tenant policy: a renewal draft must never be tenant-visible
-- before the landlord approves it and the (placeholder) send-for-signature
-- step runs. RLS default-denies with no policy — do not "fix" this later by
-- assuming every table needs a tenant read policy.

-- ---- move_out_checklists: Option C (turnover) minimal tracking --------------
create table if not exists public.move_out_checklists (
  id uuid primary key default gen_random_uuid(),
  lease_id uuid references public.leases(id) on delete cascade,
  unit_id uuid references public.units(id) on delete set null,
  landlord_id uuid references public.users(id) on delete set null,
  keys_returned boolean default false,
  walkthrough_completed boolean default false,
  deposit_disposition_sent boolean default false,
  unit_ready_for_relist boolean default false,
  notes text,
  created_at timestamptz default now(),
  completed_at timestamptz
);

create index if not exists idx_move_out_lease on public.move_out_checklists(lease_id);

alter table public.move_out_checklists enable row level security;

drop policy if exists move_out_admin_all on public.move_out_checklists;
create policy move_out_admin_all on public.move_out_checklists
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists move_out_landlord_all on public.move_out_checklists;
create policy move_out_landlord_all on public.move_out_checklists
  for all using (landlord_id = auth.uid()) with check (landlord_id = auth.uid());

-- Intentionally no tenant policy: landlord-only this phase (default-deny).

-- ---- backfill: create compliance_items for every property added before this
-- migration (no rows have ever been inserted anywhere prior to Phase 4).
-- Mirrors lib/compliance.ts's createComplianceItems() rules exactly — keep the
-- two in sync if the county rules ever change.
insert into public.compliance_items (property_id, type, status)
select id, 'inspection_cert', 'not_on_file' from public.properties
union all
select id, 'rental_license', 'not_on_file' from public.properties
  where county is distinct from 'Prince George’s'
union all
select id, 'dpie_rental_license', 'not_on_file' from public.properties
  where county = 'Prince George’s'
union all
select id, 'tenant_bill_of_rights', 'not_on_file' from public.properties
  where county = 'Prince George’s'
union all
select id, 'lead_paint_disclosure', 'not_on_file' from public.properties
  where lead_paint_required = true
union all
select id, 'lead_paint_cert', 'not_on_file' from public.properties
  where lead_paint_required = true
union all
select id, 'county_rental_license', 'not_on_file' from public.properties
  where county = 'Charles'
union all
select id, 'smoke_co_cert', 'not_on_file' from public.properties
  where county = 'Charles'
union all
select id, 'charles_lead_paint_inspection_cert', 'not_on_file' from public.properties
  where county = 'Charles' and lead_paint_required = true
union all
select id, 'county_registration', 'not_on_file' from public.properties
  where county = 'St. Mary''s'
on conflict (property_id, type) do nothing;
