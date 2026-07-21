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

/**
 * NOTE: Rental911 takes no platform fee on rent. The entire tenant payment
 * belongs to the landlord; Christine's revenue is flat service fees billed
 * separately, outside this flow. The former PLATFORM_FEE_PERCENT /
 * platformFeeCents helpers were removed deliberately — do not reintroduce an
 * application fee on rent charges.
 */
