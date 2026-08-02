import { requireRole } from '@/lib/auth';
import { PortalShell } from '@/components/ui/PortalShell';
import { GhlButton } from '@/components/ui/GhlButton';
import { AfcButton } from '@/components/ui/AfcButton';
import type { NavItem } from '@/components/ui/SidebarNav';

const NAV: NavItem[] = [
  { label: 'Dashboard', href: '/admin/dashboard' },
  { label: 'Properties', href: '/admin/properties' },
  { label: 'Landlords', href: '/admin/landlords' },
  { label: 'Tenants', href: '/admin/tenants' },
  { label: 'Maintenance', href: '/admin/maintenance' },
  { label: 'Vendors', href: '/admin/vendors' },
  { label: 'Compliance', href: '/admin/compliance' },
  { label: 'AFC Claims', href: '/admin/afc-claims' },
  { label: 'Financials', href: '/admin/financials' },
  { label: 'Documents', href: '/admin/documents' },
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
      sidebarFooter={
        <>
          <GhlButton />
          <AfcButton />
        </>
      }
    >
      {children}
    </PortalShell>
  );
}
