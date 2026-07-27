'use server';

import { submitOnboardingCheckout, type CheckoutContactInput } from '@/app/checkout/actions';
import type { OnboardingCheckoutParams } from '@/lib/landlord-onboarding';

export async function submitLandlordCheckout(
  contact: CheckoutContactInput,
  params: OnboardingCheckoutParams,
  paymentMethodId: string
) {
  return submitOnboardingCheckout('standard', contact, params, paymentMethodId);
}
