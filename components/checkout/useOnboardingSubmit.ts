'use client';

import { useState } from 'react';
import { CardElement, useElements, useStripe } from '@stripe/react-stripe-js';
import { activateSubscription } from '@/app/checkout/actions';
import type {
  OnboardingTier,
  OnboardingBillingOption,
  PortfolioServiceModel,
} from '@/lib/landlord-onboarding-pricing';

export interface CheckoutTierParams {
  tier: OnboardingTier;
  billingOption: OnboardingBillingOption | null;
  portfolioServiceModel: PortfolioServiceModel | null;
  totalUnits: number;
  eliteAddonServices: string[];
  activateNow: boolean;
}

export interface CheckoutContact {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  propertyDetails: string;
}

/**
 * Shared submit orchestration for all three public checkout pages
 * (landlord/investor/placement-only) — inline Card Element, no hosted
 * Checkout redirect. Sequenced so only one `requires_action` (3D Secure) is
 * ever pending at a time: resolve the one-time charge fully before even
 * attempting the subscription step, mirroring the tenant rent flow's
 * create -> confirm -> handleNextAction pattern.
 *
 * `submitAction` is the tier-specific action (`submitOnboardingCheckout`
 * bound to that tier) so this hook stays tier-agnostic.
 */
export function useOnboardingSubmit(
  submitAction: (
    contact: CheckoutContact,
    params: CheckoutTierParams,
    paymentMethodId: string
  ) => Promise<
    | {
        ok: true;
        paymentId: string;
        customerId: string;
        status: string;
        requiresAction: boolean;
        clientSecret: string | null;
        needsSubscription: boolean;
      }
    | { ok: false; error: string }
  >
) {
  const stripe = useStripe();
  const elements = useElements();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(contact: CheckoutContact, params: CheckoutTierParams) {
    if (!stripe || !elements) return;
    setError(null);
    setBusy(true);
    try {
      const card = elements.getElement(CardElement);
      if (!card) {
        setError('Please enter your card details.');
        return;
      }

      const { error: pmError, paymentMethod } = await stripe.createPaymentMethod({
        type: 'card',
        card,
        billing_details: {
          name: `${contact.firstName} ${contact.lastName}`.trim(),
          email: contact.email,
          phone: contact.phone,
        },
      });
      if (pmError || !paymentMethod) {
        setError(pmError?.message ?? 'Could not read your card details.');
        return;
      }

      const result = await submitAction(contact, params, paymentMethod.id);
      if (!result.ok) {
        setError(result.error);
        return;
      }

      if (result.requiresAction && result.clientSecret) {
        const { error: actionErr } = await stripe.handleNextAction({ clientSecret: result.clientSecret });
        if (actionErr) {
          setError(actionErr.message ?? 'Card authentication failed.');
          return;
        }
      }

      if (result.needsSubscription) {
        const subResult = await activateSubscription(result.paymentId, result.customerId, params, paymentMethod.id);
        if (!subResult.ok) {
          setError(subResult.error);
          return;
        }
        if (subResult.requiresAction && subResult.clientSecret) {
          const { error: actionErr } = await stripe.handleNextAction({ clientSecret: subResult.clientSecret });
          if (actionErr) {
            setError(actionErr.message ?? 'Card authentication failed.');
            return;
          }
        }
      }

      window.location.assign(`/checkout/onboarding/success?payment_id=${result.paymentId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }

  return { submit, busy, error, stripeReady: Boolean(stripe && elements) };
}
