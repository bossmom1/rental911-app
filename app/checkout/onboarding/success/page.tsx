'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { createSupabaseBrowserClient } from '@/lib/supabase';
import { Logo } from '@/components/ui/Logo';
import { Field, Input } from '@/components/ui/Field';
import { Button } from '@/components/ui/Button';
import { getCheckoutPaymentStatus, linkOnboardingPaymentToAccount, type CheckoutPaymentSummary } from './actions';

const POLL_INTERVAL_MS = 1500;
const MAX_POLLS = 8;

export default function CheckoutSuccessPage() {
  return (
    <Suspense fallback={null}>
      <CheckoutSuccessInner />
    </Suspense>
  );
}

function CheckoutSuccessInner() {
  const searchParams = useSearchParams();
  const paymentId = searchParams.get('payment_id');

  const [phase, setPhase] = useState<'confirming' | 'ready' | 'done' | 'error'>('confirming');
  const [pollExhausted, setPollExhausted] = useState(false);
  const [payment, setPayment] = useState<CheckoutPaymentSummary | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!paymentId) {
      setLoadError('No payment reference found.');
      setPhase('error');
      return;
    }
    let cancelled = false;
    let tries = 0;
    const poll = async () => {
      const result = await getCheckoutPaymentStatus(paymentId);
      if (cancelled) return;
      if (!result) {
        setLoadError('We could not find that payment.');
        setPhase('error');
        return;
      }
      if (result.status === 'paid') {
        setPayment(result);
        setPhase('ready');
        return;
      }
      tries += 1;
      if (tries >= MAX_POLLS) {
        setPollExhausted(true);
        return;
      }
      setTimeout(poll, POLL_INTERVAL_MS);
    };
    poll();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paymentId]);

  if (phase === 'error') {
    return (
      <Centered>
        <Logo href="/" />
        <h1 className="mt-4 font-display text-2xl font-bold text-navy">Something went wrong</h1>
        <p className="mt-2 text-ink/70">{loadError}</p>
        <p className="mt-2 text-ink/70">
          If you were charged, contact <a href="mailto:Info@rental911.net" className="font-bold text-navy underline">Info@rental911.net</a> and we&apos;ll sort it out.
        </p>
      </Centered>
    );
  }

  if (phase === 'confirming') {
    return (
      <Centered>
        <Logo href="/" />
        <h1 className="mt-4 font-display text-2xl font-bold text-navy">Confirming your payment…</h1>
        <p className="mt-2 text-ink/70">This usually takes just a few seconds.</p>
        {pollExhausted && (
          <div className="mt-4">
            <p className="mb-3 text-ink/70">
              Still processing — you can check again, or come back to this page in a minute. Your payment went
              through even if this page hasn&apos;t caught up yet.
            </p>
            <Button variant="outline" onClick={() => window.location.reload()}>Check again</Button>
          </div>
        )}
      </Centered>
    );
  }

  if (phase === 'done') {
    return (
      <Centered>
        <Logo href="/" />
        <h1 className="mt-4 font-display text-2xl font-bold text-navy">Confirm your email</h1>
        <p className="mt-2 text-ink/70">
          We sent a confirmation link to <strong>{payment?.contactEmail}</strong>. Click it to activate your
          account, then log in to continue your onboarding.
        </p>
        <Link href="/login" className="mt-6 inline-block font-display font-bold text-navy underline">
          Go to login
        </Link>
      </Centered>
    );
  }

  return payment ? <CreateAccountForm paymentId={paymentId!} payment={payment} onDone={() => setPhase('done')} /> : null;
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-light-blue/20 px-4">
      <div className="w-full max-w-md rounded-2xl border border-light-blue bg-white p-8 text-center shadow-md">
        {children}
      </div>
    </main>
  );
}

function CreateAccountForm({
  paymentId,
  payment,
  onDone,
}: {
  paymentId: string;
  payment: CheckoutPaymentSummary;
  onDone: () => void;
}) {
  const [fullName, setFullName] = useState(payment.contactName);
  const [email, setEmail] = useState(payment.contactEmail);
  const [phone, setPhone] = useState(payment.contactPhone);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: fullName, role: 'landlord', phone },
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      });
      if (signUpError) {
        setError(signUpError.message);
        return;
      }
      if (!data.user) {
        setError('Could not create your account. Please try again.');
        return;
      }

      const linkResult = await linkOnboardingPaymentToAccount(paymentId, data.user.id);
      if (!linkResult.ok) {
        // The account was created either way — this only affects whether the
        // wizard already shows "paid" on first login. Not worth blocking on.
        console.error('[checkout/success] link failed (non-blocking):', linkResult.error);
      }

      // No GHL sync call here — the webhook already created/tagged the
      // contact at payment time, from this same payment row's contact info.
      onDone();
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-light-blue/20 px-4 py-10">
      <div className="w-full max-w-md rounded-2xl border border-light-blue bg-white p-8 shadow-md">
        <div className="mb-6 text-center">
          <Logo href="/" />
          <h1 className="mt-4 font-display text-2xl font-bold text-navy">Payment received ✓</h1>
          <p className="mt-1 text-ink/70">Create your account to get started.</p>
        </div>

        <form onSubmit={onSubmit}>
          <Field label="Full name" htmlFor="fullName">
            <Input id="fullName" required value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </Field>
          <Field label="Email" htmlFor="email">
            <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Field label="Phone" htmlFor="phone">
            <Input id="phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
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

          {error && <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-red-700">{error}</p>}

          <Button type="submit" disabled={loading} className="w-full">
            {loading ? 'Creating account…' : 'Create account'}
          </Button>
        </form>

        <p className="mt-6 text-center text-ink/70">
          Already have an account?{' '}
          <Link href="/login" className="font-display font-bold text-navy underline">Log in</Link>
        </p>
      </div>
    </main>
  );
}
