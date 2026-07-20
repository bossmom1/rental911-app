'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase';
import { ROLE_HOME } from '@/lib/routes';
import { Logo } from '@/components/ui/Logo';
import { Field, Input } from '@/components/ui/Field';
import { Button } from '@/components/ui/Button';
import type { UserRole } from '@/types/database';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      // Client construction throws if the Supabase env vars are missing, so it
      // has to be inside the try — otherwise the rejection is swallowed and the
      // form just sits there with no request and no message.
      const supabase = createSupabaseBrowserClient();
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        setError(error.message);
        return;
      }

      // Middleware parks the original destination here when it bounces a
      // signed-out user to /login. Read it off the URL rather than with
      // useSearchParams so the page doesn't need a Suspense boundary.
      const redirectedFrom = new URLSearchParams(window.location.search).get(
        'redirectedFrom'
      );

      // Route straight to the role home. Going via '/' relied on the landing
      // page's server-side redirect, which the client router cache serves from
      // its signed-out copy — so the user just landed back on the marketing page.
      let dest = redirectedFrom;
      if (!dest) {
        const { data: profile } = await supabase
          .from('users')
          .select('role')
          .eq('id', data.user.id)
          .maybeSingle();
        const role = profile?.role as UserRole | undefined;
        if (!role) {
          setError('Your account has no role assigned yet. Please contact support.');
          return;
        }
        dest = ROLE_HOME[role];
      }

      // refresh() first so the destination is fetched with the new session
      // cookie; replace() keeps /login out of the back-stack.
      router.refresh();
      router.replace(dest);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-light-blue/20 px-4">
      <div className="w-full max-w-md rounded-2xl border border-light-blue bg-white p-8 shadow-md">
        <div className="mb-6 text-center">
          <Logo href="/" />
          <h1 className="mt-4 font-display text-2xl font-bold text-navy">
            Welcome back
          </h1>
          <p className="mt-1 text-ink/70">Log in to your Rental911 portal.</p>
        </div>

        <form onSubmit={onSubmit}>
          <Field label="Email" htmlFor="email">
            <Input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </Field>
          <Field label="Password" htmlFor="password">
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>

          {error && (
            <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-red-700">
              {error}
            </p>
          )}

          <Button type="submit" disabled={loading} className="w-full">
            {loading ? 'Logging in…' : 'Log in'}
          </Button>
        </form>

        <p className="mt-6 text-center text-ink/70">
          New landlord or tenant?{' '}
          <Link href="/signup" className="font-display font-bold text-navy underline">
            Create an account
          </Link>
        </p>
      </div>
    </main>
  );
}
