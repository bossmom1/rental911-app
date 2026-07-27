'use server';

import { submitOnboardingCheckout, type CheckoutContactInput } from '@/app/checkout/actions';
import type { OnboardingCheckoutParams } from '@/lib/landlord-onboarding';

export async function submitPlacementOnlyCheckout(
  contact: CheckoutContactInput,
  params: OnboardingCheckoutParams,
  paymentMethodId: string
) {
  return submitOnboardingCheckout('placement_only', contact, params, paymentMethodId);
}
