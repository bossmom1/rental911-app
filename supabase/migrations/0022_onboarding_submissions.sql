-- =============================================================================
-- Rental911 — Migration 0022: GHL Landlord Onboarding Survey Submissions
--
-- Stores submissions from the Rental911 Landlord Onboarding Survey
-- (GHL Survey ID: 7G9rYnBPXg57BDmHgqGy) received via the
-- POST /api/webhooks/ghl-survey endpoint.
--
-- Source of truth: GHL stores the raw submission; this table gives the
-- admin team access from the Rental911 app without leaving the platform.
-- =============================================================================

-- Status enum for the admin workflow
create type public.onboarding_submission_status as enum ('new', 'reviewed', 'converted');

create table public.onboarding_submissions (
  id                          uuid primary key default gen_random_uuid(),

  -- GHL identifiers
  ghl_contact_id              text,
  ghl_submission_id           text unique,          -- deduplication key

  -- Contact info (parsed from GHL payload)
  landlord_name               text,
  landlord_email              text,
  landlord_phone              text,

  -- Property basics (Slide 1)
  property_address            text,
  property_type               text,                 -- Single Family / Townhome / Condo / Duplex / Other
  year_built                  text,
  property_count              text,
  active_leases               text,
  lease_expiration_date       text,
  monthly_rent                text,
  utilities_selection         text,
  utilities_initials          text,                 -- single_line_239xr7

  -- Tenant / compliance (Slide 1)
  section8_tenants            text,
  code_violations             text,
  pets_on_property            text,
  pet_policy                  text,
  eviction_history            text,

  -- Security deposit (Slide 1)
  security_deposit_amount     text,
  no_funds_initials           text,

  -- Home warranty (Slide 2)
  has_existing_warranty       text,                 -- Yes / No
  keep_own_warranty           text,                 -- Yes / No
  warranty_initials           text,                 -- single_line_2355dw
  afc_tier                    text,                 -- Diamond / Platinum
  afc_deductible              text,                 -- $75 / $125  (radio_37552)
  afc_addons                  text,                 -- checkbox_12879, comma-joined

  -- HVAC / filter (Slide 2)
  hvac_make_model             text,
  multi_property_list         text,

  -- Maintenance threshold (Slide 3)
  maintenance_threshold_choice    text,             -- accept $500 / custom
  maintenance_threshold_custom    text,
  maintenance_threshold_initials  text,

  -- Right of entry (Slide 3)
  right_of_entry_initials     text,

  -- Signature (Slide 3)
  typed_signature             text,                 -- single_line_243i9r
  signature_url               text,                 -- draw pad image URL from GHL

  -- Full raw payload — safety net so nothing is ever lost
  raw_responses               jsonb,

  -- Admin workflow
  status                      public.onboarding_submission_status not null default 'new',
  reviewed_by                 uuid references public.users(id),
  reviewed_at                 timestamptz,
  notes                       text,
  converted_landlord_id       uuid references public.users(id),  -- set when admin creates app account

  submitted_at                timestamptz not null default now(),
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);

-- Fast lookups for admin table (newest first) and email search
create index idx_onboarding_submissions_submitted_at
  on public.onboarding_submissions (submitted_at desc);

create index idx_onboarding_submissions_email
  on public.onboarding_submissions (landlord_email);

create index idx_onboarding_submissions_status
  on public.onboarding_submissions (status);

-- Auto-update updated_at
create or replace function public.touch_onboarding_submissions()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_onboarding_submissions_updated_at
  before update on public.onboarding_submissions
  for each row execute function public.touch_onboarding_submissions();

-- RLS: admin-only access
alter table public.onboarding_submissions enable row level security;

create policy "Admins can read onboarding submissions"
  on public.onboarding_submissions for select
  using (public.is_admin());

create policy "Admins can insert onboarding submissions"
  on public.onboarding_submissions for insert
  with check (public.is_admin());

create policy "Admins can update onboarding submissions"
  on public.onboarding_submissions for update
  using (public.is_admin());

-- Service role (webhook) bypasses RLS by default — no extra policy needed.
