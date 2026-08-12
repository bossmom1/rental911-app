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

  const isFull = current === 'full';

  return (
    <button
      role="switch"
      aria-checked={isFull}
      onClick={toggle}
      disabled={pending}
      title={isFull ? 'Revoke to Limited' : 'Grant Full Access'}
      className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors focus:outline-none disabled:opacity-50 ${
        isFull ? 'bg-gold' : 'bg-navy/30'
      }`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
          isFull ? 'translate-x-6' : 'translate-x-1'
        }`}
      />
    </button>
  );
}
