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
 *
 * Rent is collected as a DIRECT charge on the landlord's connected account, so
 * Stripe's processing fee is debited from the landlord's balance and never from
 * the platform. The surcharges below decide who effectively bears that fee:
 *
 *   ACH    — surcharge added, grossed up, landlord nets the full rent.
 *   Credit — surcharge added, capped at the 3% US maximum.
 *   Debit  — NO surcharge (illegal under card network rules + Durbin);
 *            the fee comes out of the landlord's payout.
 */

/** Stripe US pricing. Verify against the dashboard before relying on these. */
export const ACH_FEE_PERCENT = 0.008;
export const ACH_FEE_CAP_CENTS = 500;
export const CARD_FEE_PERCENT = 0.029;
export const CARD_FEE_FIXED_CENTS = 30;

/** US card-network surcharge ceiling (Visa 3%, below Maryland's 4% statutory cap). */
export const MAX_CARD_SURCHARGE_PERCENT = 0.03;

/**
 * ACH surcharge, grossed up so the fee lands on the *total* rather than the
 * rent alone, then capped where Stripe's own $5 cap bites.
 * At $1,500 rent this is the flat $5.00.
 */
export function achSurchargeCents(rentCents: number): number {
  const grossedUp = Math.round(rentCents / (1 - ACH_FEE_PERCENT)) - rentCents;
  return Math.min(grossedUp, ACH_FEE_CAP_CENTS);
}

/**
 * Credit-card surcharge. Full recovery needs ~3.01% because of the fixed $0.30,
 * which exceeds the 3% ceiling — so the landlord absorbs roughly 11c per
 * payment at $1,500 rent. Charging the true cost would be non-compliant.
 */
export function creditSurchargeCents(rentCents: number): number {
  const grossedUp =
    Math.round((rentCents + CARD_FEE_FIXED_CENTS) / (1 - CARD_FEE_PERCENT)) - rentCents;
  const ceiling = Math.floor(rentCents * MAX_CARD_SURCHARGE_PERCENT);
  return Math.min(grossedUp, ceiling);
}

/**
 * Surcharge for a card whose funding type we have just read.
 * Anything that is not definitively 'credit' — debit, prepaid, unknown — gets
 * zero. Failing closed keeps us on the right side of the debit prohibition.
 */
export function cardSurchargeCents(
  rentCents: number,
  funding: string | null | undefined
): number {
  return funding === 'credit' ? creditSurchargeCents(rentCents) : 0;
}
