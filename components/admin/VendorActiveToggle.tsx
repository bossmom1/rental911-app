'use client';

import { useState, useTransition } from 'react';
import { setVendorActive } from '@/app/(admin)/admin/vendors/actions';

export function VendorActiveToggle({ vendorId, active }: { vendorId: string; active: boolean }) {
  const [current, setCurrent] = useState(active);
  const [pending, startTransition] = useTransition();

  function toggle() {
    const next = !current;
    setCurrent(next);
    startTransition(async () => {
      const result = await setVendorActive(vendorId, next);
      if (!result.ok) setCurrent(current);
    });
  }

  return (
    <button
      onClick={toggle}
      disabled={pending}
      className={`rounded-lg px-3 py-1.5 font-display font-bold ${
        current ? 'bg-navy text-white hover:opacity-90' : 'bg-gray-200 text-ink hover:opacity-90'
      } disabled:opacity-50`}
    >
      {pending ? 'Saving…' : current ? 'Active' : 'Inactive'}
    </button>
  );
}
