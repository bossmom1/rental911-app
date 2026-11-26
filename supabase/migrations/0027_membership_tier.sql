-- =============================================================================
-- Adds the 'membership' tier (DIY Landlord Membership — $95/mo + $297 one-time
-- setup fee) to landlord_onboarding_payments. Deliberately reuses this table
-- rather than a new one — membership is still a pre-signup, inline-Card-
-- Element checkout exactly like placement_only, just flat-rate (no units,
-- no billing_option/portfolio_service_model). Those columns stay null/1 for
-- membership rows, same as placement_only already leaves several columns
-- unused.
--
-- 'membership' is intentionally NOT added to the app-level `OnboardingTier`
-- TypeScript union (lib/landlord-onboarding-pricing.ts) — that type backs the
-- authenticated in-wizard Step 8 fee calculator and hosted-Checkout-Session
-- flow, which have nothing to do with this product. Membership has its own
-- parallel, independent charge logic (lib/membership-checkout.ts) so it can
-- never silently fall through an unguarded tier switch (see
-- lib/agreements/agreement-pdf.tsx's `default: StandardAgreement` case, which
-- is exactly the trap this avoids).
--
-- Idempotent: safe to re-run.
-- =============================================================================

alter table public.landlord_onboarding_payments drop constraint if exists landlord_onboarding_payments_tier_check;
alter table public.landlord_onboarding_payments add constraint landlord_onboarding_payments_tier_check
  check (tier in ('standard', 'placement_only', 'portfolio', 'membership'));
