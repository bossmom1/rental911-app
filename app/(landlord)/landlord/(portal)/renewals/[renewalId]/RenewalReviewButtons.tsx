'use client';

import { useTransition, useState } from 'react';
import { sendLeaseForSignature, markLeaseAsSigned } from '../actions';

export function RenewalReviewButtons({
  renewalId,
  status,
}: {
  renewalId: string;
  status: string;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  function handleSend() {
    setError(null);
    startTransition(async () => {
      const res = await sendLeaseForSignature(renewalId);
      if (res.ok) setSuccess('Marked as sent to tenant.');
      else setError(res.error ?? 'Error');
    });
  }

  function handleSigned() {
    setError(null);
    startTransition(async () => {
      const res = await markLeaseAsSigned(renewalId);
      if (res.ok) setSuccess('Lease finalized — new lease is now active.');
      else setError(res.error ?? 'Error');
    });
  }

  if (status === 'signed') {
    return (
      <p className="text-green-700 font-medium text-sm">✓ This renewal is complete. New lease is active.</p>
    );
  }

  if (status === 'cancelled') {
    return <p className="text-ink/60 text-sm">This renewal was cancelled.</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      {error && <p className="text-red-600 text-sm">{error}</p>}
      {success && <p className="text-green-700 text-sm font-medium">{success}</p>}

      <div className="flex flex-wrap gap-3">
        {status === 'draft_review' && (
          <button
            onClick={handleSend}
            disabled={isPending}
            className="rounded bg-navy px-5 py-2 font-bold text-white disabled:opacity-50"
          >
            {isPending ? 'Sending…' : 'Send to Tenant'}
          </button>
        )}

        {(status === 'sent_to_tenant' || status === 'draft_review') && (
          <button
            onClick={handleSigned}
            disabled={isPending}
            className="rounded bg-green-700 px-5 py-2 font-bold text-white disabled:opacity-50"
          >
            {isPending ? 'Finalizing…' : 'Mark as Signed'}
          </button>
        )}
      </div>
    </div>
  );
}
