'use client';

import { useState } from 'react';
import { Card, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { createQaReplay } from '@/app/(admin)/admin/replays/actions';

export function AddReplayPanel() {
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [recordingUrl, setRecordingUrl] = useState('');
  const [recordedAt, setRecordedAt] = useState(new Date().toISOString().slice(0, 10));

  if (!open) {
    return (
      <div className="mb-6">
        <Button type="button" variant="gold" onClick={() => setOpen(true)}>
          + Add Replay
        </Button>
      </div>
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const result = await createQaReplay({ title, description, recording_url: recordingUrl, recorded_at: recordedAt });
    setSubmitting(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setTitle('');
    setDescription('');
    setRecordingUrl('');
    setOpen(false);
  }

  return (
    <Card className="mb-6">
      <CardHeader title="Add a Q&A replay" />
      <form onSubmit={handleSubmit} className="space-y-3">
        <input
          className="w-full rounded-lg border border-light-blue/60 px-3 py-2"
          placeholder="Title (e.g. Live Q&A - Nov 2026)"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
        />
        <textarea
          className="w-full rounded-lg border border-light-blue/60 px-3 py-2"
          placeholder="Description (optional)"
          rows={2}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        <input
          className="w-full rounded-lg border border-light-blue/60 px-3 py-2"
          placeholder="Recording URL (YouTube/Vimeo link)"
          value={recordingUrl}
          onChange={(e) => setRecordingUrl(e.target.value)}
          required
        />
        <input
          type="date"
          className="w-full rounded-lg border border-light-blue/60 px-3 py-2"
          value={recordedAt}
          onChange={(e) => setRecordedAt(e.target.value)}
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex gap-2">
          <Button type="submit" variant="primary" disabled={submitting}>
            {submitting ? 'Saving…' : 'Save replay'}
          </Button>
          <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
        </div>
      </form>
    </Card>
  );
}
