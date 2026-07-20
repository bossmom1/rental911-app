'use client';

import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/Button';
import { startRentCheckout } from '@/app/(tenant)/tenant/rent/actions';

/**
 * Sends the tenant to Stripe's hosted Checkout for this month's rent.
 * The session is created server-side so the amount and platform fee are never
 * client-controlled.
 */
export function PayRentButton({ disabled }: { disabled?: boolean }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onClick() {
    setError(null);
    startTransition(async () => {
      const result = await startRentCheckout();
      if (!result.ok) {
        setError(result.error);
        return;
      }
      // Full navigation, not router.push — Checkout is on Stripe's domain.
      window.location.assign(result.url);
    });
  }

  return (
    <div>
      <Button variant="gold" onClick={onClick} disabled={pending || disabled} className="w-full">
        {pending ? 'Starting checkout…' : 'Pay rent'}
      </Button>
      {error && (
        <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}
    </div>
  );
}
