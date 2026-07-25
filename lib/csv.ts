export interface CsvColumn {
  key: string;
  label: string;
}

function escapeCsvValue(value: string | number | null | undefined): string {
  const s = value === null || value === undefined ? '' : String(value);
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/** Hand-rolled CSV builder — no dependency, consistent with this repo's minimal-dependency style. */
export function toCsv(rows: Record<string, string | number | null | undefined>[], columns: CsvColumn[]): string {
  const header = columns.map((c) => escapeCsvValue(c.label)).join(',');
  const lines = rows.map((r) => columns.map((c) => escapeCsvValue(r[c.key])).join(','));
  return [header, ...lines].join('\r\n');
}
