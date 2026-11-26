'use client';

import { useState } from 'react';
import { CardElement, useElements, useStripe } from '@stripe/react-stripe-js';
import { submitMembershipCheckout, activateMembershipSubscriptionAction, type MembershipContactInput } from '@/app/checkout/membership/actions';

/**
 * Submit orchestration for the Membership checkout page — trimmed version of
 * `useOnboardingSubmit`. No tier params to thread through (Membership is
 * always the same flat product), so this stays its own small hook rather
 * than forcing Membership's contact-only shape through that hook's
 * tier-parameterized signature.
 */
export function useMembershipSubmit() {
  const stripe = useStripe();
  const elements = useElements();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(contact: MembershipContactInput) {
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

      const result = await submitMembershipCheckout(contact, paymentMethod.id);
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

      const subResult = await activateMembershipSubscriptionAction(result.paymentId, result.customerId, paymentMethod.id);
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

      window.location.assign(`/checkout/onboarding/success?payment_id=${result.paymentId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }

  return { submit, busy, error, stripeReady: Boolean(stripe && elements) };
}
