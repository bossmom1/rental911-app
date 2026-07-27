-- =============================================================================
-- Public checkout pages (inline Card Element, not hosted Checkout) charge the
-- one-time portion via a directly-confirmed PaymentIntent, mirroring
-- rent_payments.stripe_payment_intent_id.
-- Idempotent: safe to re-run.
-- =============================================================================

alter table public.landlord_onboarding_payments add column if not exists stripe_payment_intent_id text;
