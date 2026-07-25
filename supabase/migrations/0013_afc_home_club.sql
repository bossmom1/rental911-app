-- =============================================================================
-- AFC Home Club integration — warranty path + tier on properties, and a
-- record of each generated invoice (warranty purchase is tracked via
-- properties.afc_warranty_invoice_sent_at; claim/service invoices get their
-- own row per maintenance request). Idempotent: safe to re-run.
--
-- warranty_path: 'afc' (Rental911-managed warranty automation) or
-- 'own_warranty' (landlord keeps their existing provider, self-files, no
-- automation applies — see lib/afc.ts). Both afc_tier and
-- afc_service_fee_cents are only ever set when warranty_path = 'afc'; the
-- landlord picks both in the GHL onboarding form, Rental911 never chooses
-- for them. afc_service_fee_cents is the tenant-facing deductible tier
-- ($75/$100/$125) — NOT AFC's actual tier pricing, which is confidential
-- and lives only in lib/afc.ts, server-side, never in this table.
-- =============================================================================

alter table public.properties add column if not exists warranty_path text
  check (warranty_path in ('afc', 'own_warranty'));
alter table public.properties add column if not exists afc_tier text
  check (afc_tier in ('diamond', 'platinum'));
alter table public.properties add column if not exists afc_service_fee_cents integer
  check (afc_service_fee_cents in (7500, 10000, 12500));
alter table public.properties add column if not exists afc_warranty_invoice_sent_at timestamptz;

-- ---- afc_claim_invoices: one row per AFC claim/service invoice filed ------
create table if not exists public.afc_claim_invoices (
  id uuid primary key default gen_random_uuid(),
  property_id uuid references public.properties(id) on delete cascade,
  maintenance_request_id uuid references public.maintenance_requests(id) on delete cascade,
  landlord_id uuid references public.users(id) on delete set null,  -- denormalized for simple RLS
  service_fee_cents integer,
  status text check (status in ('pending', 'submitted', 'failed')) default 'pending',
  generated_at timestamptz default now(),
  submitted_at timestamptz,
  error text
);

create index if not exists idx_afc_claims_property on public.afc_claim_invoices(property_id);
create index if not exists idx_afc_claims_request on public.afc_claim_invoices(maintenance_request_id);

alter table public.afc_claim_invoices enable row level security;

drop policy if exists afc_claims_admin_all on public.afc_claim_invoices;
create policy afc_claims_admin_all on public.afc_claim_invoices
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists afc_claims_landlord_read on public.afc_claim_invoices;
create policy afc_claims_landlord_read on public.afc_claim_invoices
  for select using (landlord_id = auth.uid());

-- Tenants can read the claim invoice for their own maintenance request — this
-- is where they see the service-fee amount they'll owe the technician
-- directly (never paid in-app).
drop policy if exists afc_claims_tenant_read on public.afc_claim_invoices;
create policy afc_claims_tenant_read on public.afc_claim_invoices
  for select using (
    maintenance_request_id in (
      select id from public.maintenance_requests where tenant_id = auth.uid()
    )
  );
