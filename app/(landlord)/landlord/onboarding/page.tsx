import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase';
import { getCurrentUser } from '@/lib/auth';
import { OnboardingWizard } from '@/components/landlord/OnboardingWizard';

export const dynamic = 'force-dynamic';

export default async function OnboardingPage() {
  const current = await getCurrentUser();
  const profile = current?.profile;
  if (!profile) redirect('/login');

  // Already finished the wizard AND paid the onboarding fee -> straight to the
  // portal. Finished-but-unpaid landlords (e.g. arriving via the /landlord/financials
  // fallback card) fall through and land directly on the fee step below,
  // instead of re-walking steps 1-7 they've already completed.
  if (profile.onboarding_complete && profile.onboarding_fee_status === 'paid') {
    redirect('/landlord/dashboard');
  }

  const supabase = createSupabaseServerClient(cookies());
  const { data: properties } = await supabase
    .from('properties')
    .select('unit_count')
    .eq('landlord_id', profile.id);
  const totalUnits = (properties ?? []).reduce((sum, p) => sum + (p.unit_count ?? 0), 0) || 1;

  const initialStep = profile.onboarding_complete ? 8 : (profile.onboarding_step ?? 1);

  return (
    <OnboardingWizard
      initialStep={initialStep}
      landlordId={profile.id}
      email={profile.email}
      initialTotalUnits={totalUnits}
      initialOnboardingFeeStatus={profile.onboarding_fee_status ?? 'not_started'}
    />
  );
}
