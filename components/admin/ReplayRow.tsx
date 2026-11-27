'use client';

import { useState } from 'react';
import { deleteQaReplay } from '@/app/(admin)/admin/replays/actions';
import { fmtDate } from '@/lib/format';
import type { QaReplay } from '@/types/database';

export function ReplayRow({ replay }: { replay: QaReplay }) {
  const [removing, setRemoving] = useState(false);

  async function handleDelete() {
    if (!confirm(`Delete "${replay.title}"?`)) return;
    setRemoving(true);
    await deleteQaReplay(replay.id);
  }

  return (
    <tr className={removing ? 'opacity-50' : ''}>
      <td className="px-4 py-3">{replay.title}</td>
      <td className="px-4 py-3">{fmtDate(replay.recorded_at)}</td>
      <td className="px-4 py-3">
        <a href={replay.recording_url} target="_blank" rel="noopener noreferrer" className="text-navy underline">
          View
        </a>
      </td>
      <td className="px-4 py-3">
        <button type="button" onClick={handleDelete} disabled={removing} className="text-red-600 hover:underline">
          Delete
        </button>
      </td>
    </tr>
  );
}
