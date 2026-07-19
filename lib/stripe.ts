import Stripe from 'stripe';

/**
 * Stripe client (server-only). Payment flows are built in Phase 2
 * (rent collection + Connect Express). Phase 1 only needs the client to exist.
 */
let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (_stripe) return _stripe;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error('STRIPE_SECRET_KEY is not set');
  }
  _stripe = new Stripe(key, { apiVersion: '2024-06-20' });
  return _stripe;
}

/** Platform fee applied to every rent payment (2.5% by default). */
export const PLATFORM_FEE_PERCENT = Number(
  process.env.PLATFORM_FEE_PERCENT ?? '2.5'
);

/** Platform fee in cents for a given rent amount (in cents). */
export function platformFeeCents(amountCents: number): number {
  return Math.round(amountCents * (PLATFORM_FEE_PERCENT / 100));
}
