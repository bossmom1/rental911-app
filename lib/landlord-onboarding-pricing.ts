/**
 * Landlord onboarding-fee pricing constants — split out from
 * `lib/landlord-onboarding.ts` so client components (the Step 8 fee
 * calculator) can import pricing figures without pulling the server-only
 * `stripe` package into the client bundle. Keep this file free of any
 * server-only imports.
 */

export const STANDARD_ONBOARDING_FEE_PER_UNIT_CENTS = 59500;
export const STANDARD_MONTHLY_PER_UNIT_CENTS = 18500;
export const STANDARD_QUARTERLY_PER_UNIT_CENTS = 55500;
export const PLACEMENT_ONLY_PER_UNIT_CENTS = 87500;
export const PORTFOLIO_AUDIT_PER_UNIT_CENTS = 25000;
export const PORTFOLIO_MONTHLY_PER_UNIT_CENTS = 9500;
export const PORTFOLIO_QUARTERLY_PER_UNIT_CENTS = 28500;
export const ELITE_ADDON_HOURLY_CENTS = 13500;

export const ELITE_ADDON_SERVICES = [
  'Lease Renewal Package',
  'Eviction Filing Support',
  'Rental Licensing & Inspection Concierge',
  'Tenant-to-Buyer Transition',
] as const;

export type OnboardingTier = 'standard' | 'placement_only' | 'portfolio';
export type OnboardingBillingOption = 'monthly' | 'quarterly';
export type PortfolioServiceModel = 'rental911_portal' | 'external_system';

export interface OnboardingAmountInput {
  tier: OnboardingTier;
  billingOption: OnboardingBillingOption | null;
  portfolioServiceModel: PortfolioServiceModel | null;
  totalUnits: number;
  eliteAddonServices: string[];
}

/**
 * Pure cents math shared by the inline-Card-Element checkout pages (public,
 * pre-signup) — kept separate from `generateOnboardingFeeCheckout`'s own
 * inline math in the already-shipped, already-verified in-wizard flow, which
 * is left untouched rather than refactored onto this.
 */
export function computeOnboardingAmounts(input: OnboardingAmountInput) {
  const units = Math.max(1, input.totalUnits);
  const isStandard = input.tier === 'standard';
  const isPortfolio = input.tier === 'portfolio';
  const isPlacementOnly = input.tier === 'placement_only';

  const onboardingFeeUnitCents = isPlacementOnly
    ? PLACEMENT_ONLY_PER_UNIT_CENTS
    : isStandard
      ? STANDARD_ONBOARDING_FEE_PER_UNIT_CENTS
      : PORTFOLIO_AUDIT_PER_UNIT_CENTS;
  const onboardingFeeName = isPlacementOnly
    ? 'Rental911 Tenant Placement Only'
    : isStandard
      ? 'Rental911 Tenant Placement Plus (non-refundable)'
      : 'Rental911 Portfolio Audit';
  const onboardingFeeCents = onboardingFeeUnitCents * units;

  const isQuarterly = isStandard
    ? input.billingOption === 'quarterly'
    : input.portfolioServiceModel === 'external_system';
  const recurringUnitCents = isPlacementOnly
    ? 0
    : isStandard
      ? isQuarterly
        ? STANDARD_QUARTERLY_PER_UNIT_CENTS
        : STANDARD_MONTHLY_PER_UNIT_CENTS
      : isQuarterly
        ? PORTFOLIO_QUARTERLY_PER_UNIT_CENTS
        : PORTFOLIO_MONTHLY_PER_UNIT_CENTS;
  const recurringName = isStandard
    ? `Rental911 Landlord Rescue — ${isQuarterly ? 'quarterly' : 'monthly'} subscription`
    : `Rental911 Portfolio Investor — ${isQuarterly ? 'external system, quarterly oversight' : 'Rental911 portal, monthly'} subscription`;

  const eliteAddonServices = input.eliteAddonServices ?? [];
  const eliteAddonTotalCents = eliteAddonServices.length * ELITE_ADDON_HOURLY_CENTS;
  const oneTimeTotalCents = onboardingFeeCents + eliteAddonTotalCents;

  return {
    units,
    isStandard,
    isPortfolio,
    isPlacementOnly,
    isQuarterly,
    onboardingFeeUnitCents,
    onboardingFeeCents,
    onboardingFeeName,
    recurringUnitCents,
    recurringName,
    eliteAddonServices,
    eliteAddonTotalCents,
    oneTimeTotalCents,
  };
}
