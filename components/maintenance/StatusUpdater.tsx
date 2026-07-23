'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase';
import type { MaintenanceStatus } from '@/types/database';
import { Label, Select } from '@/components/ui/Field';

const STATUSES: MaintenanceStatus[] = [
  'open',
  'in_progress',
  'vendor_assigned',
  'completed',
  'closed',
];

/**
 * Admin/landlord control to change a maintenance request's status.
 * Closing the request fires the Anthropic summary generation (non-blocking).
 */
export function StatusUpdater({
  requestId,
  current,
}: {
  requestId: string;
  current: MaintenanceStatus | null;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<MaintenanceStatus>(current ?? 'open');
  const [saving, setSaving] = useState(false);
  const supabase = createSupabaseBrowserClient();

  async function onChange(next: MaintenanceStatus) {
    setSaving(true);
    setStatus(next);
    const patch: Record<string, unknown> = { status: next };
    if (next === 'closed') patch.closed_at = new Date().toISOString();

    const { error } = await supabase
      .from('maintenance_requests')
      .update(patch)
      .eq('id', requestId);

    if (error) {
      alert(`Could not update status: ${error.message}`);
      setSaving(false);
      return;
    }

    // Job is done — mark any dispatches on this request as completed, so
    // vendor stats (completion rate) reflect it. Non-blocking: a failure here
    // shouldn't undo the status change the admin/landlord just made.
    if (next === 'completed' || next === 'closed') {
      await supabase.from('vendor_dispatches').update({ completion_confirmed: true }).eq('request_id', requestId);
    }

    // Generate the AI chat summary on close — non-blocking, never blocks the status change.
    if (next === 'closed') {
      fetch('/api/maintenance/summarize', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ requestId }),
      })
        .catch(() => {})
        .finally(() => {
          setSaving(false);
          router.refresh();
        });
    } else {
      setSaving(false);
      router.refresh();
    }
  }

  return (
    <div>
      <Label htmlFor="status">Status</Label>
      <Select
        id="status"
        value={status}
        disabled={saving}
        onChange={(e) => onChange(e.target.value as MaintenanceStatus)}
      >
        {STATUSES.map((s) => (
          <option key={s} value={s}>
            {s.replace(/_/g, ' ')}
          </option>
        ))}
      </Select>
      {saving && <p className="mt-1 text-ink/60">Saving…</p>}
    </div>
  );
}
