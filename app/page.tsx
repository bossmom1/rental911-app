import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { ROLE_HOME } from '@/lib/routes';
import { Logo } from '@/components/ui/Logo';

/**
 * Public landing page. Signed-in users are sent to their role home.
 */
export default async function Home() {
  const current = await getCurrentUser();
  if (current?.profile?.role) {
    redirect(ROLE_HOME[current.profile.role]);
  }

  return (
    <main className="min-h-screen bg-white">
      <header className="flex items-center justify-between px-6 py-5 md:px-12">
        <Logo />
        <nav className="flex items-center gap-3">
          <Link
            href="/login"
            className="rounded-lg px-4 py-2 font-display font-bold text-navy hover:bg-light-blue/40"
          >
            Log in
          </Link>
          <Link
            href="/signup"
            className="rounded-lg bg-navy px-4 py-2 font-display font-bold text-white hover:opacity-90"
          >
            Get started
          </Link>
        </nav>
      </header>

      <section className="mx-auto max-w-4xl px-6 py-20 text-center md:py-28">
        <p className="mb-3 font-display font-bold uppercase tracking-wide text-gold">
          Maryland Property Management
        </p>
        <h1 className="font-display text-4xl font-bold leading-tight text-navy md:text-5xl">
          Rent, maintenance, and compliance — all in one place.
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-ink">
          Rental911 gives landlords and tenants a single portal for rent
          collection, maintenance requests, documents, and Maryland compliance
          tracking across Charles, St. Mary&apos;s, and Prince George&apos;s counties.
        </p>
        <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
          <Link
            href="/signup"
            className="w-full rounded-lg bg-gold px-8 py-3 font-display font-bold text-navy hover:opacity-90 sm:w-auto"
          >
            Create your account
          </Link>
          <Link
            href="/login"
            className="w-full rounded-lg border-2 border-navy px-8 py-3 font-display font-bold text-navy hover:bg-light-blue/30 sm:w-auto"
          >
            Log in
          </Link>
        </div>
      </section>
    </main>
  );
}
