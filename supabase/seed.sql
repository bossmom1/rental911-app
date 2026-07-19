-- =============================================================================
-- Rental911 — Seed Data
-- Run AFTER supabase/schema.sql.
--
-- HOW TEST LOGINS WORK
-- --------------------
-- Profiles in public.users must share the id of a Supabase Auth user in order
-- to log in (RLS keys off auth.uid()). Two supported paths:
--
--   A) Recommended — create the three Auth users first, then run this file.
--      Supabase Dashboard -> Authentication -> Users -> "Add user"
--      (set "Auto Confirm User"), using these emails + a password:
--         clientcare.vp@gmail.com   (admin / Christine)
--         testlandlord@example.com  (landlord)
--         testtenant@example.com    (tenant)
--      The handle_new_user trigger creates matching profile rows; the UPSERTs
--      below then set the correct role / access_level / onboarding flags.
--
--   B) Or use the app's /signup form (role chosen there). Then run only the
--      UPDATE statements at the bottom to promote the admin + set flags.
--
-- The literal INSERTs from the project brief are kept at the very bottom for
-- reference — they create standalone profiles with no Auth user (cannot log in).
-- =============================================================================

-- ---- Admin (Christine) ------------------------------------------------------
insert into public.users (id, email, full_name, role, access_level, onboarding_complete)
select au.id, 'clientcare.vp@gmail.com', 'Christine Pollard', 'admin', 'full', true
from auth.users au
where au.email = 'clientcare.vp@gmail.com'
on conflict (id) do update
  set full_name = excluded.full_name,
      role = 'admin',
      access_level = 'full',
      onboarding_complete = true;

-- ---- Test landlord (starts in limited access, step 1) -----------------------
insert into public.users (id, email, full_name, role, access_level, onboarding_complete, onboarding_step)
select au.id, 'testlandlord@example.com', 'Test Landlord', 'landlord', 'limited', false, 1
from auth.users au
where au.email = 'testlandlord@example.com'
on conflict (id) do update
  set full_name = excluded.full_name,
      role = 'landlord',
      access_level = 'limited',
      onboarding_complete = false,
      onboarding_step = 1;

-- ---- Test tenant ------------------------------------------------------------
insert into public.users (id, email, full_name, role, access_level, onboarding_complete)
select au.id, 'testtenant@example.com', 'Test Tenant', 'tenant', 'full', true
from auth.users au
where au.email = 'testtenant@example.com'
on conflict (id) do update
  set full_name = excluded.full_name,
      role = 'tenant',
      access_level = 'full',
      onboarding_complete = true;

-- ---- Sample vendor ----------------------------------------------------------
insert into public.vendors (name, trade, phone, email, avg_response_hours)
select 'SoMD Plumbing & Drain', 'plumbing', '301-555-0101', 'dispatch@somdplumbing.com', 4
where not exists (
  select 1 from public.vendors where email = 'dispatch@somdplumbing.com'
);

-- =============================================================================
-- Reference only — the literal seed from the project brief (standalone profiles,
-- no linked Auth user, so these cannot sign in). Prefer the UPSERTs above.
-- =============================================================================
-- INSERT INTO users (email, full_name, role, access_level, onboarding_complete)
-- VALUES ('clientcare.vp@gmail.com', 'Christine Pollard', 'admin', 'full', true);
--
-- INSERT INTO users (email, full_name, role, access_level, onboarding_complete, onboarding_step)
-- VALUES ('testlandlord@example.com', 'Test Landlord', 'landlord', 'limited', false, 1);
--
-- INSERT INTO users (email, full_name, role, access_level, onboarding_complete)
-- VALUES ('testtenant@example.com', 'Test Tenant', 'tenant', 'full', true);
--
-- INSERT INTO vendors (name, trade, phone, email, avg_response_hours)
-- VALUES ('SoMD Plumbing & Drain', 'plumbing', '301-555-0101', 'dispatch@somdplumbing.com', 4);
