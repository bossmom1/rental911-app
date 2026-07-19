import { requireRole } from '@/lib/auth';

/**
 * Landlord scope guard. The onboarding wizard and the portal (with its sidebar
 * shell) provide their own layouts underneath this one.
 */
export default async function LandlordScopeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireRole(['landlord']);
  return <>{children}</>;
}
