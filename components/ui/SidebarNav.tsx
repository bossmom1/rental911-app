'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';

/** A single child link inside a nav group. */
export interface NavChild {
  label: string;
  /** Internal path (/admin/...) or external https:// URL. */
  href: string;
}

/** A nav item is either a direct link or an expandable group. */
export type NavItem =
  | { label: string; href: string; children?: never }
  | { label: string; href?: never; children: NavChild[] };

function isExternal(href: string) {
  return href.startsWith('http');
}

export function SidebarNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  const [openGroups, setOpenGroups] = useState<string[]>([]);

  const toggleGroup = (label: string) => {
    setOpenGroups((prev) =>
      prev.includes(label) ? prev.filter((l) => l !== label) : [...prev, label],
    );
  };

  return (
    <nav className="flex flex-1 flex-col gap-1">
      {items.map((item) => {
        /* ── Expandable group ── */
        if (item.children) {
          const isOpen = openGroups.includes(item.label);
          return (
            <div key={item.label}>
              <button
                onClick={() => toggleGroup(item.label)}
                className="w-full text-left rounded-lg px-3 py-2 font-display font-bold transition text-white/90 hover:bg-white/10 flex items-center justify-between"
              >
                <span>{item.label}</span>
                <span className="text-[10px] opacity-70">{isOpen ? '▲' : '▼'}</span>
              </button>
              {isOpen && (
                <div className="ml-2 mt-0.5 flex flex-col gap-0.5 border-l border-white/20 pl-2">
                  {item.children.map((child) =>
                    isExternal(child.href) ? (
                      <a
                        key={child.href}
                        href={child.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded-lg px-3 py-2 text-sm font-display font-bold transition text-white/80 hover:bg-white/10"
                      >
                        {child.label} ↗
                      </a>
                    ) : (
                      <Link
                        key={child.href}
                        href={child.href}
                        className={`rounded-lg px-3 py-2 text-sm font-display font-bold transition ${
                          pathname === child.href || pathname.startsWith(child.href + '/')
                            ? 'bg-white text-navy'
                            : 'text-white/80 hover:bg-white/10'
                        }`}
                      >
                        {child.label}
                      </Link>
                    ),
                  )}
                </div>
              )}
            </div>
          );
        }

        /* ── Regular link ── */
        const active =
          pathname === item.href || pathname.startsWith(item.href + '/');
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`rounded-lg px-3 py-2 font-display font-bold transition ${
              active ? 'bg-white text-navy' : 'text-white/90 hover:bg-white/10'
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
