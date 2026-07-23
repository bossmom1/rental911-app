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
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
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
