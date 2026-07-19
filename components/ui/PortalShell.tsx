import type { ReactNode } from 'react';
import { Logo } from '@/components/ui/Logo';
import { SidebarNav, type NavItem } from '@/components/ui/SidebarNav';
import { SignOutButton } from '@/components/ui/SignOutButton';

/**
 * Shared portal chrome: navy sidebar + main content area.
 * Used by the admin, landlord, and tenant layouts.
 * `sidebarFooter` is where the admin GHL button is injected.
 */
export function PortalShell({
  roleLabel,
  userName,
  navItems,
  sidebarFooter,
  children,
}: {
  roleLabel: string;
  userName: string;
  navItems: NavItem[];
  sidebarFooter?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-screen bg-light-blue/10">
      <aside className="sticky top-0 flex h-screen w-64 flex-col gap-4 bg-navy p-4">
        <div className="px-2 py-2">
          <Logo href="#" light />
          <p className="mt-1 font-display font-bold uppercase tracking-wide text-gold">
            {roleLabel}
          </p>
        </div>

        <SidebarNav items={navItems} />

        {sidebarFooter && <div className="space-y-2">{sidebarFooter}</div>}

        <div className="border-t border-white/20 pt-3">
          <p className="px-3 pb-1 text-white/70">{userName}</p>
          <SignOutButton />
        </div>
      </aside>

      <div className="flex-1">
        <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
      </div>
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="font-display text-3xl font-bold text-navy">{title}</h1>
        {subtitle && <p className="mt-1 text-ink/70">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}
