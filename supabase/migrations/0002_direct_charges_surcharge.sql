-- =============================================================================
-- Phase 2 (revised) — direct charges + tenant surcharge
-- Run AFTER 0001_phase2_stripe.sql. Idempotent: safe to re-run.
--
-- Rent moved from destination charges to DIRECT charges on the landlord's
-- connected account, so Stripe's fee is debited from the landlord's balance and
-- never the platform's. Rental911 takes no cut of rent at all.
--
-- Who absorbs the processing fee now depends on the method, so we have to record
-- it per payment:
--   * payment_method    — 'ach' | 'card_credit' | 'card_debit'
--   * surcharge_amount  — what the tenant paid ON TOP of rent (0 for debit)
--   * total_charged     — what the tenant actually paid
--
-- `amount` keeps meaning the RENT itself, so existing landlord/admin views and
-- the tenant history table stay correct.
-- =============================================================================

alter table public.rent_payments
  add column if not exists payment_method text;

alter table public.rent_payments
  add column if not exists surcharge_amount numeric default 0;

alter table public.rent_payments
  add column if not exists total_charged numeric;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'rent_payments_payment_method_check'
  ) then
    alter table public.rent_payments
      add constraint rent_payments_payment_method_check
      check (payment_method in ('ach', 'card_credit', 'card_debit'));
  end if;
end $$;

-- Idempotency moves from the Checkout Session to the PaymentIntent: the direct
-- charge flow creates PaymentIntents directly, so there is no Session id. Stripe
-- retries deliveries, so this is what stops duplicate rows.
--
-- Must be a plain (non-partial) unique index: the webhook upserts with
-- ON CONFLICT (stripe_payment_intent_id), and Postgres will only use a partial
-- index as a conflict arbiter if the ON CONFLICT clause repeats its exact WHERE
-- predicate — which Supabase's .upsert({ onConflict: '...' }) cannot express.
-- A plain unique index already permits unlimited NULLs without collision, so
-- no WHERE clause is needed anyway.
create unique index if not exists rent_payments_payment_intent_uniq
  on public.rent_payments (stripe_payment_intent_id);

-- Superseded by the unique index above; the plain index would be redundant.
drop index if exists idx_rent_payments_payment_intent;

-- NOTE: platform_fee and stripe_transfer_id are now permanently NULL.
-- platform_fee   — Rental911 takes no cut.
-- stripe_transfer_id — direct charges create no Transfer object.
-- Both are left in place rather than dropped; clean up once confirmed unused.
