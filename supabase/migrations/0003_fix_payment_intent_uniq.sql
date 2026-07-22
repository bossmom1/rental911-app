-- =============================================================================
-- Fix: rent_payments_payment_intent_uniq was created as a PARTIAL unique index
-- (WHERE stripe_payment_intent_id is not null). Postgres will not use a partial
-- index as an ON CONFLICT arbiter unless the conflict clause repeats the exact
-- same WHERE predicate, which Supabase's .upsert({ onConflict: '...' }) has no
-- way to express — every webhook upsert was failing with:
--   "there is no unique or exclusion constraint matching the ON CONFLICT specification"
--
-- The WHERE clause was unnecessary anyway: a plain (non-partial) unique index
-- already permits unlimited NULLs without collision, so dropping the predicate
-- loses nothing. Idempotent: safe to re-run.
-- =============================================================================

drop index if exists rent_payments_payment_intent_uniq;

create unique index if not exists rent_payments_payment_intent_uniq
  on public.rent_payments (stripe_payment_intent_id);
