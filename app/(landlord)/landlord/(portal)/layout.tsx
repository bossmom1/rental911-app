import { getCurrentUser } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { PortalShell } from '@/components/ui/PortalShell';
import { LimitedAccessBanner } from '@/components/landlord/LimitedAccessBanner';
import type { NavItem } from '@/components/ui/SidebarNav';

const SUBSCRIPTION_NAV: NavItem[] = [
  { label: 'Dashboard',    href: '/landlord/dashboard' },
  { label: 'Properties',   href: '/landlord/properties' },
  { label: 'Tenants',      href: '/landlord/tenants' },
  { label: 'Documents',    href: '/landlord/documents' },
  { label: 'Maintenance',  href: '/landlord/maintenance' },
  { label: 'Renewals',     href: '/landlord/renewals' },
  { label: 'Financials',   href: '/landlord/financials' },
  { label: 'P&L Reports',  href: '/landlord/financials/reports' },
  { label: 'Tax Export',   href: '/landlord/financials/export' },
  { label: 'Verifications',href: '/landlord/verifications' },
  { label: 'My Survey',    href: '/landlord/survey' },
];

// Members (plan_type='membership') don't have properties/tenants managed in
// this app — they get the lighter view: dashboard, their own documents, and
// the Q&A replay library.
const MEMBERSHIP_NAV: NavItem[] = [
  { label: 'Dashboard',  href: '/landlord/dashboard' },
  { label: 'Documents',  href: '/landlord/documents' },
  { label: 'Q&A Replays',href: '/landlord/replays' },
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
  const nav = profile.plan_type === 'membership' ? MEMBERSHIP_NAV : SUBSCRIPTION_NAV;

  return (
    <PortalShell
      roleLabel={profile.plan_type === 'membership' ? 'Member' : 'Landlord'}
      userName={profile.full_name || profile.email}
      navItems={nav}
    >
      {limited && <LimitedAccessBanner />}
      {children}
    </PortalShell>
  );
}
