'use client';

import { useState, useTransition } from 'react';
import { setAccessLevel } from '@/app/(admin)/admin/landlords/actions';
import type { AccessLevel } from '@/types/database';

export function AccessLevelToggle({
  userId,
  level,
}: {
  userId: string;
  level: AccessLevel;
}) {
  const [current, setCurrent] = useState<AccessLevel>(level);
  const [pending, startTransition] = useTransition();

  function toggle() {
    const next: AccessLevel = current === 'full' ? 'limited' : 'full';
    setCurrent(next);
    startTransition(async () => {
      try {
        await setAccessLevel(userId, next);
      } catch {
        setCurrent(current); // revert on failure
      }
    });
  }

  return (
    <button
      onClick={toggle}
      disabled={pending}
      className={`rounded-lg px-3 py-1.5 font-display font-bold ${
        current === 'full'
          ? 'bg-gold text-navy hover:opacity-90'
          : 'bg-navy text-white hover:opacity-90'
      } disabled:opacity-50`}
    >
      {pending
        ? 'Saving…'
        : current === 'full'
          ? 'Revoke to Limited'
          : 'Grant Full Access'}
    </button>
  );
}
