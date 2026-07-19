import { requireRole } from '@/lib/auth';
import { PortalShell } from '@/components/ui/PortalShell';
import { GhlButton } from '@/components/ui/GhlButton';
import type { NavItem } from '@/components/ui/SidebarNav';

const NAV: NavItem[] = [
  { label: 'Dashboard', href: '/admin/dashboard' },
  { label: 'Properties', href: '/admin/properties' },
  { label: 'Landlords', href: '/admin/landlords' },
  { label: 'Tenants', href: '/admin/tenants' },
  { label: 'Maintenance', href: '/admin/maintenance' },
  { label: 'Compliance', href: '/admin/compliance' },
  { label: 'Financials', href: '/admin/financials' },
];

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await requireRole(['admin']);
  return (
    <PortalShell
      roleLabel="Admin"
      userName={profile.full_name || profile.email}
      navItems={NAV}
      sidebarFooter={<GhlButton />}
    >
      {children}
    </PortalShell>
  );
}
