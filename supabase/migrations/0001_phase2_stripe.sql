-- =============================================================================
-- Phase 2 — Stripe rent collection
-- Run AFTER supabase/schema.sql. Idempotent: safe to re-run.
--
-- Adds the columns Connect Express + Checkout need, which the Phase 1 schema
-- did not have:
--   * users.stripe_account_id      — the landlord's Connect Express acct_...
--                                    Destination charges cannot route without it.
--   * users.stripe_charges_enabled — mirror of the Stripe account's charges_enabled,
--                                    kept fresh by the account.updated webhook so
--                                    the app can block payments to a landlord who
--                                    has not finished Stripe's KYC.
--   * rent_payments.stripe_checkout_session_id — webhook idempotency key. Stripe
--                                    retries deliveries, so the handler must be
--                                    able to recognise a session it already wrote.
-- =============================================================================

alter table public.users
  add column if not exists stripe_account_id text;

alter table public.users
  add column if not exists stripe_charges_enabled boolean default false;

alter table public.rent_payments
  add column if not exists stripe_checkout_session_id text;

-- One rent_payments row per Checkout Session. Partial index so the many
-- pre-existing/manual rows with a NULL session id do not collide.
create unique index if not exists rent_payments_checkout_session_uniq
  on public.rent_payments (stripe_checkout_session_id)
  where stripe_checkout_session_id is not null;

-- Webhooks look payments up by payment intent; keep that lookup indexed too.
create index if not exists idx_rent_payments_payment_intent
  on public.rent_payments (stripe_payment_intent_id);

create index if not exists idx_users_stripe_account
  on public.users (stripe_account_id);
