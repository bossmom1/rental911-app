/** Shared display formatters. */

export function fmtMoney(value: number | null | undefined): string {
  const n = Number(value ?? 0);
  return n.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  });
}

export function fmtMoneyCents(value: number | null | undefined): string {
  return Number(value ?? 0).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
  });
}

export function fmtPct(fraction: number): string {
  return `${Math.round(fraction * 100)}%`;
}

export function fmtDate(value: string | null | undefined): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  // Plain `date` columns (e.g. "2026-07-28", no time/zone) parse as UTC midnight.
  // Displaying those in the viewer's local timezone can shift the calendar day
  // backward (any timezone behind UTC, i.e. all of the US) — pin to UTC so the
  // date shown always matches the literal stored value. Full timestamps (with
  // a time and offset) still convert to local time, which is correct for them.
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    ...(dateOnly ? { timeZone: 'UTC' } : {}),
  });
}

export function fmtDateTime(value: string | null | undefined): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}
