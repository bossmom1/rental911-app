import { requireRole } from '@/lib/auth';
import { PortalShell } from '@/components/ui/PortalShell';
import type { NavItem } from '@/components/ui/SidebarNav';

const NAV: NavItem[] = [
  { label: 'Dashboard', href: '/tenant/dashboard' },
  { label: 'Rent', href: '/tenant/rent' },
  { label: 'Maintenance', href: '/tenant/maintenance' },
  { label: 'Documents', href: '/tenant/documents' },
];

export default async function TenantLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await requireRole(['tenant']);
  return (
    <PortalShell
      roleLabel="Tenant"
      userName={profile.full_name || profile.email}
      navItems={NAV}
    >
      {children}
    </PortalShell>
  );
}
