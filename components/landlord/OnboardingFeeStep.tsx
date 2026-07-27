'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import {
  generateOnboardingFeeCheckout,
  getOnboardingFeeStatus,
} from '@/app/(landlord)/landlord/onboarding/actions';
import { OnboardingFeeCalculator } from '@/components/landlord/OnboardingFeeCalculator';
import type { OnboardingFeeStatus } from '@/types/database';

const POLL_INTERVAL_MS = 1500;
const MAX_POLLS = 8;

export function OnboardingFeeStep({
  initialTotalUnits,
  initialOnboardingFeeStatus,
  pending,
  onContinue,
}: {
  initialTotalUnits: number;
  initialOnboardingFeeStatus: OnboardingFeeStatus;
  pending: boolean;
  onContinue: () => void;
}) {
  const searchParams = useSearchParams();
  const [phase, setPhase] = useState<'form' | 'processing' | 'paid'>(
    initialOnboardingFeeStatus === 'paid' ? 'paid' : 'form'
  );
  const [cancelledNotice, setCancelledNotice] = useState(searchParams.get('onboarding_fee') === 'cancelled');
  const [pollExhausted, setPollExhausted] = useState(false);

  // Returning from Stripe with ?onboarding_fee=success — poll until the
  // webhook flips onboarding_fee_status, rather than trusting the redirect
  // alone (webhooks are near-instant in practice, but not guaranteed first).
  useEffect(() => {
    if (searchParams.get('onboarding_fee') !== 'success' || phase === 'paid') return;
    setPhase('processing');
    let cancelled = false;
    let tries = 0;
    const poll = async () => {
      const status = await getOnboardingFeeStatus();
      if (cancelled) return;
      if (status === 'paid') {
        setPhase('paid');
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
  }, []);

  if (phase === 'paid') {
    return (
      <div>
        <div className="mb-6 rounded-lg bg-green-50 p-4 text-green-800">
          <p className="font-display font-bold">Onboarding fee paid ✓</p>
          <p className="mt-1">Thanks — your onboarding payment has been received.</p>
        </div>
        <Button disabled={pending} onClick={onContinue}>
          {pending ? 'Continuing…' : 'Continue'}
        </Button>
      </div>
    );
  }

  if (phase === 'processing') {
    return (
      <div className="rounded-lg bg-light-blue/30 p-4 text-ink">
        <p className="font-display font-bold text-navy">Confirming your payment…</p>
        <p className="mt-1">This usually takes just a few seconds.</p>
        {pollExhausted && (
          <div className="mt-4">
            <p className="mb-2 text-ink/70">
              Still processing — this can take a little longer occasionally. You can check again, or come back to
              this page in a minute.
            </p>
            <Button variant="outline" onClick={() => window.location.reload()}>
              Check again
            </Button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div>
      {cancelledNotice && (
        <div className="mb-4 flex items-center justify-between rounded-lg bg-warning-yellow/20 p-3 text-ink">
          <span>Checkout was cancelled — your card was not charged. Pick your options and try again below.</span>
          <button type="button" className="ml-3 font-bold" onClick={() => setCancelledNotice(false)}>
            ×
          </button>
        </div>
      )}
      <OnboardingFeeCalculator initialTotalUnits={initialTotalUnits} onSubmit={generateOnboardingFeeCheckout} />
    </div>
  );
}
