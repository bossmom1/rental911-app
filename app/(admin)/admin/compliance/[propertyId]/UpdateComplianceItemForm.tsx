'use client';

import { useTransition } from 'react';
import { updateComplianceItem } from './actions';
import { complianceStatusLabel } from '@/lib/compliance';

interface ComplianceItem {
  id: string;
  type: string | null;
  status: string | null;
  expiry_date: string | null;
  notes: string | null;
}

export function UpdateComplianceItemForm({ item }: { item: ComplianceItem }) {
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(() => updateComplianceItem(item.id, fd));
  }

  const statusOptions = ['current', 'expiring_soon', 'expired', 'not_on_file', 'not_applicable'];

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-1.5 min-w-[220px]">
      <select
        name="status"
        defaultValue={item.status ?? 'not_on_file'}
        className="rounded border border-gray-300 px-2 py-1 text-xs"
        required
      >
        {statusOptions.map((s) => (
          <option key={s} value={s}>{complianceStatusLabel(s)}</option>
        ))}
      </select>
      <input
        type="date"
        name="expiry_date"
        defaultValue={item.expiry_date ?? ''}
        className="rounded border border-gray-300 px-2 py-1 text-xs"
        placeholder="Expiry date"
      />
      <input
        type="text"
        name="notes"
        defaultValue={item.notes ?? ''}
        className="rounded border border-gray-300 px-2 py-1 text-xs"
        placeholder="Notes (optional)"
      />
      <button
        type="submit"
        disabled={isPending}
        className="rounded bg-navy px-3 py-1 text-xs font-bold text-white disabled:opacity-50"
      >
        {isPending ? 'Saving…' : 'Save'}
      </button>
    </form>
  );
}
