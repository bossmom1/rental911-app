-- =============================================================================
-- Membership portal: account provisioning, intake form, and Q&A replay
-- library. Membership ($95/mo) customers had no portal account at all before
-- this — membership-checkout.ts only charges Stripe. This migration adds what
-- the post-payment onboarding + restricted portal view need.
--
-- Idempotent: safe to re-run.
-- =============================================================================

-- 1. Distinguish Membership portal users from full Subscription landlords.
--    Reuses role='landlord' (Members ARE self-managing landlords) rather than
--    adding a new role value, so middleware/ROLE_HOME routing is untouched.
--    null = existing Subscription/placement/portfolio landlords (unaffected).
alter table public.users add column if not exists plan_type text
  check (plan_type in ('membership', 'subscription'));

-- 2. Public, unguessable token for the post-payment intake-form link sent by
--    email — avoids exposing the real landlord_onboarding_payments.id (which
--    is sequential-ish and used elsewhere) in a public URL.
alter table public.landlord_onboarding_payments add column if not exists intake_token uuid
  not null default gen_random_uuid();
alter table public.landlord_onboarding_payments add column if not exists intake_email_sent_at timestamptz;

-- 3. Membership intake responses — collected on the public, token-gated
--    intake form before the kickoff-call booking step. Deliberately NOT the
--    same shape as the Subscription property/unit wizard (no structured
--    property records) — Members don't have properties managed in this app.
create table if not exists public.membership_intake_responses (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.landlord_onboarding_payments(id) on delete cascade,
  lease_file_path text,
  lease_file_name text,
  rental_license_file_path text,
  rental_license_file_name text,
  current_pm_software text,              -- free text: DoorLoop, Buildium, spreadsheets, none, etc.
  additional_documents jsonb not null default '[]'::jsonb, -- [{label, file_path, file_name}], court papers/notices/etc.
  lead_paint_status text check (lead_paint_status in ('yes', 'no', 'not_sure')),
  rental_license_status text check (rental_license_status in ('yes', 'no', 'not_sure')),
  biggest_challenge text,
  preferred_contact_method text check (preferred_contact_method in ('text', 'email', 'call')),
  submitted_at timestamptz default now(),
  created_at timestamptz default now()
);

alter table public.membership_intake_responses enable row level security;

-- No public SELECT policy — the intake form is server-action-only (admin
-- client, service role), never read back by the public page. Admins can read
-- via the admin client (service role bypasses RLS) for now; a dedicated admin
-- UI is a later follow-up.

-- 4. Q&A replay library — admin-uploaded recordings of the live Q&A sessions.
--    Visible to Membership portal users (plan_type='membership') and admins.
create table if not exists public.qa_replays (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  recording_url text not null,
  recorded_at date not null default current_date,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz default now()
);

alter table public.qa_replays enable row level security;

drop policy if exists "qa_replays_select_members_and_admins" on public.qa_replays;
create policy "qa_replays_select_members_and_admins" on public.qa_replays
  for select
  using (
    exists (
      select 1 from public.users u
      where u.id = auth.uid()
        and (u.role = 'admin' or (u.role = 'landlord' and u.plan_type = 'membership'))
    )
  );

drop policy if exists "qa_replays_admin_write" on public.qa_replays;
create policy "qa_replays_admin_write" on public.qa_replays
  for all
  using (exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin'))
  with check (exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin'));
