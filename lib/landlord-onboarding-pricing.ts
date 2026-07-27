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
