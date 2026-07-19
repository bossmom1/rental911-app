import Link from 'next/link';

/** Rental911 wordmark. Navy "Rental" + gold "911". */
export function Logo({ href = '/', light = false }: { href?: string; light?: boolean }) {
  return (
    <Link href={href} className="inline-flex items-center font-display text-2xl font-bold">
      <span className={light ? 'text-white' : 'text-navy'}>Rental</span>
      <span className="text-gold">911</span>
    </Link>
  );
}
