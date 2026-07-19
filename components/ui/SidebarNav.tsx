'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export interface NavItem {
  label: string;
  href: string;
}

export function SidebarNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  return (
    <nav className="flex flex-1 flex-col gap-1">
      {items.map((item) => {
        const active =
          pathname === item.href || pathname.startsWith(item.href + '/');
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`rounded-lg px-3 py-2 font-display font-bold transition ${
              active
                ? 'bg-white text-navy'
                : 'text-white/90 hover:bg-white/10'
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
