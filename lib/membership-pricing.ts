/**
 * Pricing constants for the DIY Landlord Membership product — deliberately
 * separate from `lib/landlord-onboarding-pricing.ts`. That file's
 * `OnboardingTier` union backs the per-unit, 1-5-units Standard/Placement/
 * Portfolio logic (the in-wizard fee calculator, the hosted Checkout Session
 * flow); Membership is flat-rate, no units, no billing-frequency choice, and
 * never flows through the wizard at all. Keeping it in its own file/type
 * means a new Membership-specific field can never accidentally widen (or
 * silently fall through) that older, unrelated switch logic.
 */

export const MEMBERSHIP_SETUP_FEE_CENTS = 29700; // $297 one-time, non-refundable
export const MEMBERSHIP_MONTHLY_CENTS = 9500; // $95/mo
export const MEMBERSHIP_PRODUCT_NAME = 'Rental911 DIY Landlord Membership';
export const MEMBERSHIP_SETUP_FEE_NAME = 'Rental911 DIY Landlord Membership — Setup Fee (non-refundable)';
export const MEMBERSHIP_SUBSCRIPTION_NAME = 'Rental911 DIY Landlord Membership — monthly subscription';
