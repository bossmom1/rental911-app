import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { OnboardingWizard } from '@/components/landlord/OnboardingWizard';

export const dynamic = 'force-dynamic';

export default async function OnboardingPage() {
  const current = await getCurrentUser();
  const profile = current?.profile;
  if (!profile) redirect('/login');

  // Already finished the wizard -> straight to the portal.
  if (profile.onboarding_complete) redirect('/landlord/dashboard');

  return (
    <OnboardingWizard
      initialStep={profile.onboarding_step ?? 1}
      landlordId={profile.id}
      email={profile.email}
    />
  );
}
