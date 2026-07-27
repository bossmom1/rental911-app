'use server';

import { submitOnboardingCheckout, type CheckoutContactInput } from '@/app/checkout/actions';
import type { OnboardingCheckoutParams } from '@/lib/landlord-onboarding';

export async function submitInvestorCheckout(
  contact: CheckoutContactInput,
  params: OnboardingCheckoutParams,
  paymentMethodId: string
) {
  return submitOnboardingCheckout('portfolio', contact, params, paymentMethodId);
}
