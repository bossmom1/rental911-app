import { getCurrentUser } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { PortalShell } from '@/components/ui/PortalShell';
import { LimitedAccessBanner } from '@/components/landlord/LimitedAccessBanner';
import type { NavItem } from '@/components/ui/SidebarNav';

const NAV: NavItem[] = [
  { label: 'Dashboard', href: '/landlord/dashboard' },
  { label: 'Properties', href: '/landlord/properties' },
  { label: 'Tenants', href: '/landlord/tenants' },
  { label: 'Maintenance', href: '/landlord/maintenance' },
  { label: 'Financials', href: '/landlord/financials' },
];

export default async function LandlordPortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const current = await getCurrentUser();
  const profile = current?.profile;
  if (!profile) redirect('/login');
  // Middleware also enforces this, but guard here too.
  if (!profile.onboarding_complete) redirect('/landlord/onboarding');

  const limited = profile.access_level === 'limited';

  return (
    <PortalShell
      roleLabel="Landlord"
      userName={profile.full_name || profile.email}
      navItems={NAV}
    >
      {limited && <LimitedAccessBanner />}
      {children}
    </PortalShell>
  );
}
