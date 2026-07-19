'use client';

import { useState } from 'react';
import Link from 'next/link';
import { createSupabaseBrowserClient } from '@/lib/supabase';
import { Logo } from '@/components/ui/Logo';
import { Field, Input, Select } from '@/components/ui/Field';
import { Button } from '@/components/ui/Button';
import type { UserRole } from '@/types/database';

export default function SignupPage() {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState<Exclude<UserRole, 'admin'>>('landlord');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        // Consumed by the handle_new_user DB trigger to populate public.users.
        data: { full_name: fullName, role, phone },
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }

    // Background CRM sync (non-blocking — failures are logged server-side only).
    fetch('/api/ghl/sync-contact', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: fullName, email, phone, role }),
    }).catch(() => {});

    setDone(true);
  }

  if (done) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-light-blue/20 px-4">
        <div className="w-full max-w-md rounded-2xl border border-light-blue bg-white p-8 text-center shadow-md">
          <Logo href="/" />
          <h1 className="mt-4 font-display text-2xl font-bold text-navy">
            Confirm your email
          </h1>
          <p className="mt-2 text-ink/70">
            We sent a confirmation link to <strong>{email}</strong>. Click it to
            activate your account, then log in to continue
            {role === 'landlord' ? ' your onboarding.' : '.'}
          </p>
          <Link
            href="/login"
            className="mt-6 inline-block font-display font-bold text-navy underline"
          >
            Go to login
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-light-blue/20 px-4 py-10">
      <div className="w-full max-w-md rounded-2xl border border-light-blue bg-white p-8 shadow-md">
        <div className="mb-6 text-center">
          <Logo href="/" />
          <h1 className="mt-4 font-display text-2xl font-bold text-navy">
            Create your account
          </h1>
          <p className="mt-1 text-ink/70">Step 1 of onboarding.</p>
        </div>

        <form onSubmit={onSubmit}>
          <Field label="Full name" htmlFor="fullName">
            <Input
              id="fullName"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
            />
          </Field>
          <Field label="I am a…" htmlFor="role">
            <Select
              id="role"
              value={role}
              onChange={(e) =>
                setRole(e.target.value as Exclude<UserRole, 'admin'>)
              }
            >
              <option value="landlord">Landlord</option>
              <option value="tenant">Tenant</option>
            </Select>
          </Field>
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
          <Field label="Phone" htmlFor="phone">
            <Input
              id="phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </Field>
          <Field label="Password" htmlFor="password" hint="At least 6 characters.">
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              required
              minLength={6}
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
            {loading ? 'Creating account…' : 'Create account'}
          </Button>
        </form>

        <p className="mt-6 text-center text-ink/70">
          Already have an account?{' '}
          <Link href="/login" className="font-display font-bold text-navy underline">
            Log in
          </Link>
        </p>
      </div>
    </main>
  );
}
