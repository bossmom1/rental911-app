'use client';

import { useState, useTransition } from 'react';
import { initiateRenewal, setMonthToMonth, beginTurnover } from './actions';

type Choice = 'renew' | 'mtm' | 'turnover' | null;

export function RenewalActionForm({ leaseId }: { leaseId: string }) {
  const [choice, setChoice] = useState<Choice>(null);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (!choice) {
    return (
      <div className="flex flex-col gap-1.5 sm:flex-row">
        <button
          onClick={() => setChoice('renew')}
          className="rounded bg-navy px-3 py-1.5 text-xs font-bold text-white"
        >
          Renew
        </button>
        <button
          onClick={() => setChoice('mtm')}
          className="rounded border border-navy px-3 py-1.5 text-xs font-bold text-navy"
        >
          Month-to-Month
        </button>
        <button
          onClick={() => setChoice('turnover')}
          className="rounded border border-gray-400 px-3 py-1.5 text-xs font-bold text-ink"
        >
          Begin Turnover
        </button>
      </div>
    );
  }

  if (choice === 'renew') {
    return (
      <form
        className="flex flex-col gap-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          setError(null);
          startTransition(async () => {
            const res = await initiateRenewal(leaseId, fd);
            if (!res.ok) setError(res.error ?? 'Error');
          });
        }}
      >
        <p className="text-xs font-bold text-navy mb-1">Start a Renewal</p>
        <label className="text-xs text-ink/70">New End Date</label>
        <input
          type="date"
          name="new_end_date"
          required
          className="rounded border border-gray-300 px-2 py-1 text-xs"
        />
        <label className="text-xs text-ink/70">New Monthly Rent</label>
        <input
          type="number"
          name="new_monthly_rent"
          required
          min={1}
          step="0.01"
          className="rounded border border-gray-300 px-2 py-1 text-xs"
          placeholder="e.g. 1850"
        />
        {error && <p className="text-red-600 text-xs">{error}</p>}
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={isPending}
            className="rounded bg-navy px-3 py-1 text-xs font-bold text-white disabled:opacity-50"
          >
            {isPending ? 'Creating…' : 'Create Renewal Draft'}
          </button>
          <button type="button" onClick={() => setChoice(null)} className="text-xs text-ink/60 underline">
            Cancel
          </button>
        </div>
      </form>
    );
  }

  if (choice === 'mtm') {
    return (
      <form
        className="flex flex-col gap-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          setError(null);
          startTransition(async () => {
            const res = await setMonthToMonth(leaseId, fd);
            if (!res.ok) setError(res.error ?? 'Error');
          });
        }}
      >
        <p className="text-xs font-bold text-navy mb-1">Continue Month-to-Month</p>
        <input
          type="text"
          name="note"
          className="rounded border border-gray-300 px-2 py-1 text-xs"
          placeholder="Optional note"
        />
        {error && <p className="text-red-600 text-xs">{error}</p>}
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={isPending}
            className="rounded bg-navy px-3 py-1 text-xs font-bold text-white disabled:opacity-50"
          >
            {isPending ? 'Saving…' : 'Confirm Month-to-Month'}
          </button>
          <button type="button" onClick={() => setChoice(null)} className="text-xs text-ink/60 underline">
            Cancel
          </button>
        </div>
      </form>
    );
  }

  // turnover
  return (
    <form
      className="flex flex-col gap-1.5"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        startTransition(async () => {
          const res = await beginTurnover(leaseId);
          if (!res.ok) setError(res.error ?? 'Error');
        });
      }}
    >
      <p className="text-xs text-ink mb-1">
        This will mark the unit for turnover after the lease ends and start a move-out checklist.
      </p>
      {error && <p className="text-red-600 text-xs">{error}</p>}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={isPending}
          className="rounded bg-red-600 px-3 py-1 text-xs font-bold text-white disabled:opacity-50"
        >
          {isPending ? 'Starting…' : 'Begin Turnover'}
        </button>
        <button type="button" onClick={() => setChoice(null)} className="text-xs text-ink/60 underline">
          Cancel
        </button>
      </div>
    </form>
  );
}
