import type Stripe from 'stripe';
import { getStripe } from '@/lib/stripe';
import {
  MEMBERSHIP_SETUP_FEE_CENTS,
  MEMBERSHIP_MONTHLY_CENTS,
  MEMBERSHIP_SETUP_FEE_NAME,
  MEMBERSHIP_SUBSCRIPTION_NAME,
} from '@/lib/membership-pricing';

/**
 * DIY Landlord Membership billing — public, pre-signup checkout
 * (`app/checkout/membership`), inline Stripe Card Element, same
 * create->confirm pattern as `lib/landlord-onboarding.ts`'s
 * chargeOnboardingOneTime/activateOnboardingSubscription, but deliberately
 * NOT built on top of that file's `OnboardingTier` union — Membership is
 * flat-rate (no units, no billing-frequency choice) and always activates its
 * subscription immediately (no 30-day-trial deferral toggle; the product is
 * month-to-month from day one).
 *
 * Two Stripe objects, same reasoning as the onboarding flow: the $297 setup
 * fee is a directly-confirmed PaymentIntent; the $95/mo is a separate real
 * Stripe Subscription. The DB write that marks the payment row 'paid' happens
 * in the webhook (`payment_intent.succeeded`), not here.
 */

export interface MembershipBillingContact {
  email: string;
  full_name: string | null;
  stripe_customer_id: string | null;
}

export type MembershipChargeResult =
  | { ok: true; status: string; requiresAction: boolean; clientSecret: string | null }
  | { ok: false; error: string };

export async function chargeMembershipSetupFee(
  contact: MembershipBillingContact,
  paymentId: string,
  paymentMethodId: string
): Promise<MembershipChargeResult & { customerId?: string }> {
  const stripe = getStripe();

  try {
    const customerId =
      contact.stripe_customer_id ??
      (
        await stripe.customers.create({
          email: contact.email,
          name: contact.full_name ?? undefined,
        })
      ).id;

    await stripe.paymentMethods.attach(paymentMethodId, { customer: customerId });
    await stripe.customers.update(customerId, {
      invoice_settings: { default_payment_method: paymentMethodId },
    });

    const intent = await stripe.paymentIntents.create({
      amount: MEMBERSHIP_SETUP_FEE_CENTS,
      currency: 'usd',
      customer: customerId,
      payment_method: paymentMethodId,
      confirm: true,
      automatic_payment_methods: { enabled: true, allow_redirects: 'never' },
      description: MEMBERSHIP_SETUP_FEE_NAME,
      receipt_email: contact.email,
      metadata: { rental911_landlord_onboarding_payment_id: paymentId },
    });

    return {
      ok: true,
      status: intent.status,
      requiresAction: intent.status === 'requires_action',
      clientSecret: intent.client_secret,
      customerId,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Stripe request failed.';
    console.error('[membership-checkout/setup-fee] failed:', message);
    return { ok: false, error: message };
  }
}

/**
 * Always charges the first month today — unlike Standard/Portfolio, there is
 * no "activate now" toggle for Membership; the subscription is live from the
 * moment of signup.
 */
export async function activateMembershipSubscription(
  customerId: string,
  paymentId: string,
  paymentMethodId: string
): Promise<MembershipChargeResult & { subscriptionId?: string }> {
  const stripe = getStripe();

  try {
    const price = await stripe.prices.create({
      currency: 'usd',
      unit_amount: MEMBERSHIP_MONTHLY_CENTS,
      recurring: { interval: 'month', interval_count: 1 },
      product_data: { name: MEMBERSHIP_SUBSCRIPTION_NAME },
    });

    const subscription = await stripe.subscriptions.create({
      customer: customerId,
      items: [{ price: price.id, quantity: 1 }],
      default_payment_method: paymentMethodId,
      metadata: { rental911_landlord_onboarding_payment_id: paymentId },
      payment_behavior: 'default_incomplete',
      expand: ['latest_invoice.payment_intent'],
    });

    const invoice = subscription.latest_invoice as Stripe.Invoice | null;
    let intent = invoice?.payment_intent as Stripe.PaymentIntent | null | undefined;

    // Same confirmed behavior as activateOnboardingSubscription: setting
    // default_payment_method on the subscription does NOT auto-confirm the
    // first invoice's PaymentIntent — confirm explicitly.
    if (intent && intent.status === 'requires_confirmation') {
      intent = await stripe.paymentIntents.confirm(intent.id, { payment_method: paymentMethodId });
    }

    return {
      ok: true,
      status: intent?.status ?? subscription.status,
      requiresAction: intent?.status === 'requires_action',
      clientSecret: intent?.client_secret ?? null,
      subscriptionId: subscription.id,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Stripe request failed.';
    console.error('[membership-checkout/subscription] failed:', message);
    return { ok: false, error: message };
  }
}
