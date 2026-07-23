'use client';

import { useState } from 'react';
import { Field, Input } from '@/components/ui/Field';
import { Button } from '@/components/ui/Button';

export function VendorConfirmForm({ dispatchId }: { dispatchId: string }) {
  const [date, setDate] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!date) {
      setError('Pick a date.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/vendor-dispatch/${dispatchId}/confirm`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ scheduledDate: date }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error || 'Could not confirm. Please try again.');
        return;
      }
      setDone(true);
    } catch {
      setError('Could not reach the server. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <p className="rounded-lg bg-green-50 px-4 py-3 text-green-800">
        Confirmed for <strong>{date}</strong>. Thanks — the tenant and landlord have been notified.
      </p>
    );
  }

  return (
    <form onSubmit={onSubmit}>
      <Field label="Scheduled date" htmlFor="scheduled_date">
        <Input
          id="scheduled_date"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          required
        />
      </Field>
      {error && (
        <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-red-700">{error}</p>
      )}
      <Button type="submit" variant="gold" disabled={busy}>
        {busy ? 'Confirming…' : 'Confirm scheduled date'}
      </Button>
    </form>
  );
}
