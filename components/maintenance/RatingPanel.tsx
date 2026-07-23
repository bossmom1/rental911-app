'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardHeader } from '@/components/ui/Card';
import { Textarea } from '@/components/ui/Field';
import { Button } from '@/components/ui/Button';
import { rateDispatch } from '@/app/(tenant)/tenant/maintenance/actions';
import type { VendorDispatch } from '@/types/database';

export function RatingPanel({ dispatch }: { dispatch: VendorDispatch }) {
  const [rating, setRating] = useState(0);
  const [feedback, setFeedback] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  if (dispatch.tenant_rating != null) {
    return (
      <Card className="mt-6">
        <CardHeader title="Your rating" />
        <p className="text-ink">Thanks — you rated this job {dispatch.tenant_rating}/5.</p>
        {dispatch.tenant_feedback && <p className="mt-1 text-ink/70">&ldquo;{dispatch.tenant_feedback}&rdquo;</p>}
      </Card>
    );
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (rating < 1) {
      setError('Pick a star rating.');
      return;
    }
    setBusy(true);
    setError(null);
    const result = await rateDispatch(dispatch.id, rating, feedback);
    setBusy(false);
    if (!result.ok) {
      setError(result.error || 'Could not save your rating.');
      return;
    }
    router.refresh();
  }

  return (
    <Card className="mt-6">
      <CardHeader title="How did it go?" subtitle="Rate this maintenance job." />
      <form onSubmit={onSubmit}>
        <div className="mb-4 flex gap-1">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setRating(n)}
              aria-label={`${n} star${n > 1 ? 's' : ''}`}
              className={`text-3xl leading-none ${n <= rating ? 'text-gold' : 'text-light-blue'}`}
            >
              ★
            </button>
          ))}
        </div>
        <Textarea
          rows={2}
          value={feedback}
          onChange={(e) => setFeedback(e.target.value)}
          placeholder="Optional feedback"
          className="mb-4"
        />
        {error && <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-red-700">{error}</p>}
        <Button type="submit" variant="gold" disabled={busy}>
          {busy ? 'Submitting…' : 'Submit rating'}
        </Button>
      </form>
    </Card>
  );
}
