import Link from 'next/link';
import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Variant = 'primary' | 'gold' | 'outline' | 'ghost' | 'danger';

const base =
  'inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 font-display font-bold transition disabled:cursor-not-allowed disabled:opacity-50';

const variants: Record<Variant, string> = {
  primary: 'bg-navy text-white hover:opacity-90',
  gold: 'bg-gold text-navy hover:opacity-90',
  outline: 'border-2 border-navy text-navy hover:bg-light-blue/30',
  ghost: 'text-navy hover:bg-light-blue/30',
  danger: 'bg-red-600 text-white hover:bg-red-700',
};

interface CommonProps {
  variant?: Variant;
  className?: string;
  children: ReactNode;
}

export function Button({
  variant = 'primary',
  className = '',
  children,
  ...props
}: CommonProps & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button className={`${base} ${variants[variant]} ${className}`} {...props}>
      {children}
    </button>
  );
}

export function LinkButton({
  href,
  variant = 'primary',
  className = '',
  children,
  target,
}: CommonProps & { href: string; target?: string }) {
  return (
    <Link
      href={href}
      target={target}
      rel={target === '_blank' ? 'noopener noreferrer' : undefined}
      className={`${base} ${variants[variant]} ${className}`}
    >
      {children}
    </Link>
  );
}
