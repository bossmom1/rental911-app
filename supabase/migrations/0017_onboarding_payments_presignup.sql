-- =============================================================================
-- Landlord onboarding-fee billing — public pre-signup checkout. Payment now
-- happens BEFORE any account exists (matching the old rental911.net
-- marketing-funnel order), so landlord_id must be nullable until the
-- post-payment account-linking step sets it. Contact info is captured
-- directly on the ledger row until then.
-- Idempotent: safe to re-run.
-- =============================================================================

alter table public.landlord_onboarding_payments alter column landlord_id drop not null;
alter table public.landlord_onboarding_payments add column if not exists contact_email text;
alter table public.landlord_onboarding_payments add column if not exists contact_name text;
alter table public.landlord_onboarding_payments add column if not exists contact_phone text;
