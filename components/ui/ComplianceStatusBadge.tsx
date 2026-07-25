import type { ComplianceStatus } from '@/types/database';

/**
 * Exact spec hex colors for compliance statuses — kept separate from the
 * shared Badge.tsx palette (used by 10+ unrelated statuses) so this doesn't
 * risk regressing other badges that reuse the same status words loosely.
 */
const palette: Record<ComplianceStatus, string> = {
  current: 'bg-green-100 text-green-800 border-[#16A34A]',
  expiring_soon: 'bg-warning-yellow/20 text-yellow-800 border-warning-yellow', // #EAB308, already exact
  expired: 'bg-red-100 text-red-700 border-[#DC2626]',
  not_on_file: 'bg-gray-100 text-ink border-[#6B7280]',
  // Distinct light-blue neutral, deliberately different from not_on_file's
  // gray — this is "doesn't apply here" (admin decision), not "missing".
  not_applicable: 'bg-light-blue/30 text-navy border-light-blue',
};

const labels: Record<ComplianceStatus, string> = {
  current: 'Current',
  expiring_soon: 'Expiring Soon',
  expired: 'Expired',
  not_on_file: 'Not On File',
  not_applicable: 'N/A',
};

export function ComplianceStatusBadge({
  value,
}: {
  value: ComplianceStatus | string | null | undefined;
}) {
  if (!value) return <span className="text-ink/50">—</span>;
  const status = value as ComplianceStatus;
  const cls = palette[status] ?? 'bg-gray-100 text-ink border-[#6B7280]';
  const label = labels[status] ?? status.replace(/_/g, ' ');
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 font-display font-bold ${cls}`}
    >
      {label}
    </span>
  );
}
