-- =============================================================================
-- Rental911 — Database Schema
-- Run this in the Supabase SQL Editor (or via `supabase db push`).
-- Order: extensions -> tables -> indexes -> auth trigger -> RLS helpers -> RLS.
-- =============================================================================

create extension if not exists "pgcrypto";

-- -----------------------------------------------------------------------------
-- TABLES
-- -----------------------------------------------------------------------------

-- Profiles. id matches auth.users.id (populated by the handle_new_user trigger).
create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  full_name text,
  role text check (role in ('admin', 'landlord', 'tenant')),
  phone text,
  avatar_url text,
  onboarding_complete boolean default false,
  onboarding_step integer default 1,
  access_level text check (access_level in ('full', 'limited')) default 'limited',
  stripe_customer_id text,
  -- Landlord payout account (Connect Express) + its KYC state. See
  -- migrations/0001_phase2_stripe.sql for existing databases.
  stripe_account_id text,
  stripe_charges_enabled boolean default false,
  created_at timestamptz default now()
);

create table if not exists public.properties (
  id uuid primary key default gen_random_uuid(),
  landlord_id uuid references public.users(id) on delete set null,
  name text,
  address text,
  city text,
  state text default 'MD',
  zip text,
  county text,               -- Charles, St. Mary's, Prince George's, etc.
  property_type text,        -- single_family, multi_unit, condo, etc.
  unit_count integer default 1,
  lead_paint_required boolean default false,  -- MD: pre-1978 units
  rental_license_number text,
  rental_license_expiry date,
  created_at timestamptz default now()
);

create table if not exists public.units (
  id uuid primary key default gen_random_uuid(),
  property_id uuid references public.properties(id) on delete cascade,
  unit_number text,
  bedrooms integer,
  bathrooms numeric,
  sqft integer,
  monthly_rent numeric,
  status text check (status in ('vacant', 'occupied', 'maintenance')),
  created_at timestamptz default now()
);

create table if not exists public.leases (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid references public.units(id) on delete set null,
  tenant_id uuid references public.users(id) on delete set null,
  landlord_id uuid references public.users(id) on delete set null,
  start_date date,
  end_date date,
  monthly_rent numeric,
  security_deposit numeric,
  status text check (status in ('active', 'expired', 'terminated')),
  renewal_alert_sent boolean default false,
  created_at timestamptz default now()
);

create table if not exists public.rent_payments (
  id uuid primary key default gen_random_uuid(),
  lease_id uuid references public.leases(id) on delete set null,
  tenant_id uuid references public.users(id) on delete set null,
  amount numeric,
  due_date date,
  paid_date date,
  status text check (status in ('pending', 'paid', 'late', 'failed')),
  stripe_payment_intent_id text,
  stripe_transfer_id text,
  stripe_checkout_session_id text,  -- webhook idempotency key
  platform_fee numeric,       -- 2.5% collected by Rental911
  created_at timestamptz default now()
);

create table if not exists public.maintenance_requests (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid references public.units(id) on delete set null,
  tenant_id uuid references public.users(id) on delete set null,
  landlord_id uuid references public.users(id) on delete set null,
  title text,
  description text,
  category text,              -- plumbing, electrical, hvac, appliance, structural, other
  priority text check (priority in ('low', 'medium', 'high', 'emergency')),
  status text check (status in ('open', 'in_progress', 'vendor_assigned', 'completed', 'closed')),
  chat_summary text,          -- AI-generated on close via Anthropic API
  created_at timestamptz default now(),
  closed_at timestamptz
);

create table if not exists public.maintenance_chat (
  id uuid primary key default gen_random_uuid(),
  request_id uuid references public.maintenance_requests(id) on delete cascade,
  sender_id uuid references public.users(id) on delete set null,
  sender_role text check (sender_role in ('admin', 'landlord', 'tenant', 'system')),
  message text,
  created_at timestamptz default now()
);

create table if not exists public.vendors (
  id uuid primary key default gen_random_uuid(),
  name text,
  trade text,                 -- plumbing, electrical, hvac, general, etc.
  phone text,
  email text,
  avg_response_hours integer default 24,
  active boolean default true,
  created_at timestamptz default now()
);

create table if not exists public.vendor_dispatches (
  id uuid primary key default gen_random_uuid(),
  request_id uuid references public.maintenance_requests(id) on delete cascade,
  vendor_id uuid references public.vendors(id) on delete set null,
  dispatched_at timestamptz default now(),
  dispatched_by uuid references public.users(id) on delete set null,
  vendor_response text,       -- 'accepted', 'declined', 'no_response'
  responded_at timestamptz,
  scheduled_date date,
  scheduled_time text,
  completion_confirmed boolean default false,
  tenant_rating integer,      -- 1-5 after job complete
  tenant_feedback text
);

create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references public.users(id) on delete set null,  -- who uploaded it
  lease_id uuid references public.leases(id) on delete cascade,  -- scoped to lease/unit only
  unit_id uuid references public.units(id) on delete set null,
  type text,                  -- lease, lead_paint, renters_insurance, gov_id, income_verification, other
  file_url text,
  file_name text,
  uploaded_by_role text check (uploaded_by_role in ('admin', 'landlord', 'tenant')),
  created_at timestamptz default now()
);

create table if not exists public.compliance_items (
  id uuid primary key default gen_random_uuid(),
  property_id uuid references public.properties(id) on delete cascade,
  type text,                  -- rental_license, lead_paint_cert, inspection_cert
  status text check (status in ('current', 'expiring_soon', 'expired', 'not_on_file')),
  expiry_date date,
  alert_sent boolean default false,
  notes text,
  created_at timestamptz default now()
);

-- -----------------------------------------------------------------------------
-- INDEXES (foreign keys used heavily by RLS predicates + dashboards)
-- -----------------------------------------------------------------------------
create index if not exists idx_properties_landlord on public.properties(landlord_id);
create index if not exists idx_units_property on public.units(property_id);
create index if not exists idx_leases_tenant on public.leases(tenant_id);
create index if not exists idx_leases_landlord on public.leases(landlord_id);
create index if not exists idx_leases_unit on public.leases(unit_id);
create index if not exists idx_rent_lease on public.rent_payments(lease_id);
create index if not exists idx_rent_tenant on public.rent_payments(tenant_id);
create index if not exists idx_maint_tenant on public.maintenance_requests(tenant_id);
create index if not exists idx_maint_landlord on public.maintenance_requests(landlord_id);
create index if not exists idx_maint_unit on public.maintenance_requests(unit_id);
create index if not exists idx_chat_request on public.maintenance_chat(request_id);
create index if not exists idx_dispatch_request on public.vendor_dispatches(request_id);
create index if not exists idx_docs_lease on public.documents(lease_id);
create index if not exists idx_docs_owner on public.documents(owner_id);
create index if not exists idx_compliance_property on public.compliance_items(property_id);

-- -----------------------------------------------------------------------------
-- AUTH TRIGGER — create a profile row whenever a Supabase Auth user is created.
-- role/full_name come from signUp options.data (raw_user_meta_data).
-- -----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.users (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    nullif(new.raw_user_meta_data ->> 'role', '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- =============================================================================
-- ROW LEVEL SECURITY
-- =============================================================================

-- SECURITY DEFINER helpers avoid RLS recursion when checking the caller's role.
create or replace function public.current_user_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.users where id = auth.uid()
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.users where id = auth.uid() and role = 'admin')
$$;

-- Enable RLS on every table.
alter table public.users               enable row level security;
alter table public.properties          enable row level security;
alter table public.units               enable row level security;
alter table public.leases              enable row level security;
alter table public.rent_payments       enable row level security;
alter table public.maintenance_requests enable row level security;
alter table public.maintenance_chat    enable row level security;
alter table public.vendors             enable row level security;
alter table public.vendor_dispatches   enable row level security;
alter table public.documents           enable row level security;
alter table public.compliance_items    enable row level security;

-- ---- users ------------------------------------------------------------------
drop policy if exists users_admin_all on public.users;
create policy users_admin_all on public.users
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists users_self_select on public.users;
create policy users_self_select on public.users
  for select using (id = auth.uid());

drop policy if exists users_self_update on public.users;
create policy users_self_update on public.users
  for update using (id = auth.uid()) with check (id = auth.uid());

-- A landlord can read the profiles of tenants on their leases.
drop policy if exists users_landlord_read_tenants on public.users;
create policy users_landlord_read_tenants on public.users
  for select using (
    id in (select tenant_id from public.leases where landlord_id = auth.uid())
  );

-- ---- properties -------------------------------------------------------------
drop policy if exists properties_admin_all on public.properties;
create policy properties_admin_all on public.properties
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists properties_landlord_all on public.properties;
create policy properties_landlord_all on public.properties
  for all using (landlord_id = auth.uid()) with check (landlord_id = auth.uid());

-- A tenant may read the property behind their leased unit.
drop policy if exists properties_tenant_read on public.properties;
create policy properties_tenant_read on public.properties
  for select using (
    id in (
      select u.property_id from public.units u
      join public.leases l on l.unit_id = u.id
      where l.tenant_id = auth.uid()
    )
  );

-- ---- units ------------------------------------------------------------------
drop policy if exists units_admin_all on public.units;
create policy units_admin_all on public.units
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists units_landlord_all on public.units;
create policy units_landlord_all on public.units
  for all using (
    property_id in (select id from public.properties where landlord_id = auth.uid())
  ) with check (
    property_id in (select id from public.properties where landlord_id = auth.uid())
  );

drop policy if exists units_tenant_read on public.units;
create policy units_tenant_read on public.units
  for select using (
    id in (select unit_id from public.leases where tenant_id = auth.uid())
  );

-- ---- leases -----------------------------------------------------------------
drop policy if exists leases_admin_all on public.leases;
create policy leases_admin_all on public.leases
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists leases_landlord_all on public.leases;
create policy leases_landlord_all on public.leases
  for all using (landlord_id = auth.uid()) with check (landlord_id = auth.uid());

drop policy if exists leases_tenant_read on public.leases;
create policy leases_tenant_read on public.leases
  for select using (tenant_id = auth.uid());

-- ---- rent_payments ----------------------------------------------------------
drop policy if exists rent_admin_all on public.rent_payments;
create policy rent_admin_all on public.rent_payments
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists rent_landlord_read on public.rent_payments;
create policy rent_landlord_read on public.rent_payments
  for select using (
    lease_id in (select id from public.leases where landlord_id = auth.uid())
  );

drop policy if exists rent_tenant_rw on public.rent_payments;
create policy rent_tenant_rw on public.rent_payments
  for select using (tenant_id = auth.uid());

-- ---- maintenance_requests ---------------------------------------------------
drop policy if exists maint_admin_all on public.maintenance_requests;
create policy maint_admin_all on public.maintenance_requests
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists maint_landlord_all on public.maintenance_requests;
create policy maint_landlord_all on public.maintenance_requests
  for all using (landlord_id = auth.uid()) with check (landlord_id = auth.uid());

-- Tenants can create and read their own requests, and update (e.g. rating flow).
drop policy if exists maint_tenant_read on public.maintenance_requests;
create policy maint_tenant_read on public.maintenance_requests
  for select using (tenant_id = auth.uid());

drop policy if exists maint_tenant_insert on public.maintenance_requests;
create policy maint_tenant_insert on public.maintenance_requests
  for insert with check (tenant_id = auth.uid());

drop policy if exists maint_tenant_update on public.maintenance_requests;
create policy maint_tenant_update on public.maintenance_requests
  for update using (tenant_id = auth.uid()) with check (tenant_id = auth.uid());

-- ---- maintenance_chat -------------------------------------------------------
-- All participants on the request (tenant, landlord, admin) may read + insert.
-- No delete/update policies -> those actions are denied for everyone.
drop policy if exists chat_participants_select on public.maintenance_chat;
create policy chat_participants_select on public.maintenance_chat
  for select using (
    public.is_admin()
    or request_id in (
      select id from public.maintenance_requests
      where tenant_id = auth.uid() or landlord_id = auth.uid()
    )
  );

drop policy if exists chat_participants_insert on public.maintenance_chat;
create policy chat_participants_insert on public.maintenance_chat
  for insert with check (
    public.is_admin()
    or request_id in (
      select id from public.maintenance_requests
      where tenant_id = auth.uid() or landlord_id = auth.uid()
    )
  );

-- ---- vendors ----------------------------------------------------------------
drop policy if exists vendors_admin_all on public.vendors;
create policy vendors_admin_all on public.vendors
  for all using (public.is_admin()) with check (public.is_admin());

-- Landlords may read the vendor directory (names shown on dispatch records).
drop policy if exists vendors_landlord_read on public.vendors;
create policy vendors_landlord_read on public.vendors
  for select using (public.current_user_role() = 'landlord');

-- ---- vendor_dispatches ------------------------------------------------------
-- admin full; landlords read-only for their properties; tenants no access.
drop policy if exists dispatch_admin_all on public.vendor_dispatches;
create policy dispatch_admin_all on public.vendor_dispatches
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists dispatch_landlord_read on public.vendor_dispatches;
create policy dispatch_landlord_read on public.vendor_dispatches
  for select using (
    request_id in (
      select id from public.maintenance_requests where landlord_id = auth.uid()
    )
  );

-- ---- documents --------------------------------------------------------------
drop policy if exists docs_admin_all on public.documents;
create policy docs_admin_all on public.documents
  for all using (public.is_admin()) with check (public.is_admin());

-- Landlords manage documents on their leases/units.
drop policy if exists docs_landlord_all on public.documents;
create policy docs_landlord_all on public.documents
  for all using (
    lease_id in (select id from public.leases where landlord_id = auth.uid())
    or unit_id in (
      select u.id from public.units u
      join public.properties p on p.id = u.property_id
      where p.landlord_id = auth.uid()
    )
  ) with check (
    lease_id in (select id from public.leases where landlord_id = auth.uid())
    or unit_id in (
      select u.id from public.units u
      join public.properties p on p.id = u.property_id
      where p.landlord_id = auth.uid()
    )
  );

-- Tenants read documents scoped to their lease.
drop policy if exists docs_tenant_read on public.documents;
create policy docs_tenant_read on public.documents
  for select using (
    lease_id in (select id from public.leases where tenant_id = auth.uid())
  );

-- Tenants may upload ONLY to their own lease/unit (owner_id = self AND lease = theirs).
drop policy if exists docs_tenant_insert on public.documents;
create policy docs_tenant_insert on public.documents
  for insert with check (
    owner_id = auth.uid()
    and lease_id in (select id from public.leases where tenant_id = auth.uid())
  );

-- ---- compliance_items -------------------------------------------------------
drop policy if exists compliance_admin_all on public.compliance_items;
create policy compliance_admin_all on public.compliance_items
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists compliance_landlord_all on public.compliance_items;
create policy compliance_landlord_all on public.compliance_items
  for all using (
    property_id in (select id from public.properties where landlord_id = auth.uid())
  ) with check (
    property_id in (select id from public.properties where landlord_id = auth.uid())
  );

-- =============================================================================
-- End of schema. Run supabase/seed.sql next for test accounts + sample vendor.
-- =============================================================================
