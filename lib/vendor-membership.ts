import { getStripe } from '@/lib/stripe';
import type { Vendor } from '@/types/database';

/**
 * Vendor marketplace membership billing — admin-triggered, one-time Stripe
 * Checkout charge per quarter (NOT a subscription). Locked pricing: $199/mo,
 * billed quarterly = $597 charged per quarter.
 */
export const MEMBERSHIP_QUARTERLY_PRICE_CENTS = 59700;

/**
 * Creates a one-time (mode: 'payment') Checkout Session for a vendor's
 * quarterly membership charge, on the platform account — vendors have no
 * Stripe Connect account, unlike landlords' rent payments. Tags the session
 * with `rental911_vendor_membership_payment_id` so the webhook can resolve
 * the exact vendor_membership_payments row without relying on amount matching.
 */
export async function createMembershipCheckoutSession(
  vendor: Pick<Vendor, 'id' | 'name'>,
  paymentId: string
) {
  const stripe = getStripe();
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://rental911-app.vercel.app';

  return stripe.checkout.sessions.create({
    mode: 'payment',
    line_items: [
      {
        price_data: {
          currency: 'usd',
          product_data: {
            name: 'Rental911 Vendor Network Membership — Quarterly',
            description: vendor.name || undefined,
          },
          unit_amount: MEMBERSHIP_QUARTERLY_PRICE_CENTS,
        },
        quantity: 1,
      },
    ],
    metadata: {
      rental911_vendor_membership_payment_id: paymentId,
      rental911_vendor_id: vendor.id,
    },
    success_url: `${siteUrl}/admin/vendors/${vendor.id}?membership=success`,
    cancel_url: `${siteUrl}/admin/vendors/${vendor.id}?membership=cancelled`,
  });
}
