'use client';

import { useState } from 'react';
import { loadStripe, type Stripe as StripeJs } from '@stripe/stripe-js';
import {
  Elements,
  PaymentElement,
  useElements,
  useStripe,
} from '@stripe/react-stripe-js';
import { Button } from '@/components/ui/Button';
import {
  createRentIntent,
  confirmCardRent,
  type PaymentMethodChoice,
} from '@/app/(tenant)/tenant/rent/actions';

const usd = (cents: number) =>
  (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' });

type Quote = {
  rentCents: number;
  lateFeeCents: number;
  achSurchargeCents: number;
  achTotalCents: number;
  creditSurchargeCents: number;
  creditTotalCents: number;
};

type ActiveIntent = {
  clientSecret: string;
  paymentIntentId: string;
  connectedAccountId: string;
  method: PaymentMethodChoice;
  rentCents: number;
  lateFeeCents: number;
  surchargeCents: number;
  totalCents: number;
};

/**
 * Rent payment. Surcharges are disclosed BEFORE the tenant picks a method,
 * which card-network surcharging rules require.
 *
 * Card cannot use hosted Checkout: we must read the card's funding type and only
 * surcharge credit, so the flow is create intent -> collect card -> read funding
 * server-side -> confirm. Amounts are never client-controlled.
 */
export function RentPayment({ quote }: { quote: Quote | null }) {
  const [intent, setIntent] = useState<ActiveIntent | null>(null);
  const [loading, setLoading] = useState<PaymentMethodChoice | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!quote) {
    return (
      <p className="text-ink/70">
        Rent payments will appear here once your lease is set up.
      </p>
    );
  }

  async function choose(method: PaymentMethodChoice) {
    setError(null);
    setLoading(method);
    const result = await createRentIntent(method);
    setLoading(null);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setIntent({
      clientSecret: result.clientSecret,
      paymentIntentId: result.paymentIntentId,
      connectedAccountId: result.connectedAccountId,
      method,
      rentCents: result.rentCents,
      lateFeeCents: result.lateFeeCents,
      surchargeCents: result.surchargeCents,
      totalCents: result.totalCents,
    });
  }

  if (intent) {
    return (
      <PaymentForm
        intent={intent}
        onBack={() => {
          setIntent(null);
          setError(null);
        }}
      />
    );
  }

  return (
    <div>
      <p className="mb-4 text-ink/70">Choose how you&apos;d like to pay.</p>

      {quote.lateFeeCents > 0 && (
        <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800">
          <strong>Late fee applied.</strong> Rent was due by the 5th of the month, so
          a {usd(quote.lateFeeCents)} late fee (5% of rent) is included in the totals
          below, shown as its own line.
        </div>
      )}

      <div className="space-y-3">
        <button
          type="button"
          onClick={() => choose('ach')}
          disabled={loading !== null}
          className="w-full rounded-lg border-2 border-navy p-4 text-left transition hover:bg-light-blue/30 disabled:opacity-50"
        >
          <span className="block font-display font-bold text-navy">
            Bank transfer (ACH) — {usd(quote.achTotalCents)}
          </span>
          <span className="mt-1 block text-sm text-ink/70">
            {usd(quote.rentCents)} rent
            {quote.lateFeeCents > 0 ? ` + ${usd(quote.lateFeeCents)} late fee` : ''} +{' '}
            {usd(quote.achSurchargeCents)} processing fee. Takes 3–5 business days.
          </span>
        </button>

        <button
          type="button"
          onClick={() => choose('card')}
          disabled={loading !== null}
          className="w-full rounded-lg border-2 border-light-blue p-4 text-left transition hover:bg-light-blue/30 disabled:opacity-50"
        >
          <span className="block font-display font-bold text-navy">
            Card — {usd(quote.rentCents + quote.lateFeeCents)} to {usd(quote.creditTotalCents)}
          </span>
          <span className="mt-1 block text-sm text-ink/70">
            {quote.lateFeeCents > 0 && `Includes a ${usd(quote.lateFeeCents)} late fee. `}
            Debit cards add no processing fee. Credit cards add a{' '}
            {usd(quote.creditSurchargeCents)} processing fee. Posts immediately.
          </span>
        </button>
      </div>

      {loading && <p className="mt-3 text-sm text-ink/70">Preparing payment…</p>}
      {error && (
        <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}
    </div>
  );
}

function PaymentForm({ intent, onBack }: { intent: ActiveIntent; onBack: () => void }) {
  // Direct charges are scoped to the connected account, so Stripe.js must be
  // initialised with it or the client secret will not resolve.
  const [stripePromise] = useState<Promise<StripeJs | null>>(() =>
    loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? '', {
      stripeAccount: intent.connectedAccountId,
    })
  );

  return (
    <Elements stripe={stripePromise} options={{ clientSecret: intent.clientSecret }}>
      <InnerForm intent={intent} onBack={onBack} />
    </Elements>
  );
}

function InnerForm({ intent, onBack }: { intent: ActiveIntent; onBack: () => void }) {
  const stripe = useStripe();
  const elements = useElements();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!stripe || !elements) return;
    setError(null);
    setBusy(true);

    try {
      const submitResult = await elements.submit();
      if (submitResult.error) {
        setError(submitResult.error.message ?? 'Please check your payment details.');
        return;
      }

      if (intent.method === 'ach') {
        // Stripe collects the bank account and the ACH mandate. The amount was
        // already fixed when the intent was created.
        const { error: confirmErr } = await stripe.confirmPayment({
          elements,
          clientSecret: intent.clientSecret,
          confirmParams: {
            return_url: `${window.location.origin}/tenant/rent?paid=1`,
          },
        });
        if (confirmErr) {
          setError(confirmErr.message ?? 'Payment failed.');
          return;
        }
        setDone('submitted');
        return;
      }

      // Card: build the PaymentMethod WITHOUT confirming, so the server can read
      // card.funding and decide the surcharge before any money moves.
      const { error: pmErr, paymentMethod } = await stripe.createPaymentMethod({
        elements,
      });
      if (pmErr || !paymentMethod) {
        setError(pmErr?.message ?? 'Could not read your card details.');
        return;
      }

      const result = await confirmCardRent(intent.paymentIntentId, paymentMethod.id);
      if (!result.ok) {
        setError(result.error);
        return;
      }

      if (result.requiresAction && result.clientSecret) {
        // 3D Secure step-up.
        const { error: actionErr } = await stripe.handleNextAction({
          clientSecret: result.clientSecret,
        });
        if (actionErr) {
          setError(actionErr.message ?? 'Card authentication failed.');
          return;
        }
      }

      setDone('paid');
      window.location.assign('/tenant/rent?paid=1');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }

  if (done === 'submitted') {
    return (
      <p className="rounded-lg bg-green-50 px-4 py-3 text-green-800">
        Payment submitted. Bank transfers take 3–5 business days to clear.
      </p>
    );
  }

  return (
    <form onSubmit={onSubmit}>
      <div className="mb-4 rounded-lg bg-light-blue/30 px-4 py-3 text-sm text-ink">
        <div className="flex justify-between">
          <span>Rent</span>
          <span>{usd(intent.rentCents)}</span>
        </div>
        {intent.lateFeeCents > 0 && (
          <div className="mt-1 flex justify-between text-red-700">
            <span>Late fee (5% — rent was due by the 5th)</span>
            <span>{usd(intent.lateFeeCents)}</span>
          </div>
        )}
        {intent.method === 'ach' ? (
          <div className="mt-1 flex justify-between">
            <span>Processing fee</span>
            <span>{usd(intent.surchargeCents)}</span>
          </div>
        ) : (
          <p className="mt-1 text-ink/70">
            A processing fee is added for credit cards only; debit cards pay rent alone.
            The final total is shown by your bank.
          </p>
        )}
      </div>

      <PaymentElement />

      {error && (
        <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}

      <div className="mt-4 flex gap-3">
        <Button type="submit" variant="gold" disabled={!stripe || busy}>
          {busy ? 'Processing…' : 'Pay now'}
        </Button>
        <Button type="button" variant="ghost" onClick={onBack} disabled={busy}>
          Back
        </Button>
      </div>
    </form>
  );
}
