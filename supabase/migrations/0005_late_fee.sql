-- =============================================================================
-- Phase 2 — late fees
-- Rent is due by the 5th of the month. A payment initiated on the 6th or
-- later automatically gets a flat 5% late fee (Maryland's statutory cap),
-- tracked separately from `amount` (rent) and `surcharge_amount` (card/ACH
-- processing fee) so each shows as its own line on receipts and financials.
-- Idempotent: safe to re-run.
-- =============================================================================

alter table public.rent_payments
  add column if not exists late_fee_amount numeric default 0;
