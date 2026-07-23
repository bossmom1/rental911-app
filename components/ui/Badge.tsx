const palette: Record<string, string> = {
  // maintenance / general status
  open: 'bg-warning-yellow/20 text-yellow-800 border-warning-yellow',
  in_progress: 'bg-navy/10 text-navy border-navy',
  vendor_assigned: 'bg-light-blue/40 text-navy border-light-blue',
  completed: 'bg-green-100 text-green-800 border-[#16A34A]',
  closed: 'bg-gray-100 text-ink border-[#6B7280]',
  // vendor dispatch response
  confirmed: 'bg-green-100 text-green-800 border-[#16A34A]',
  no_response: 'bg-red-100 text-red-700 border-red-500',
  // priority
  low: 'bg-gray-100 text-ink border-gray-400',
  medium: 'bg-light-blue/40 text-navy border-navy',
  high: 'bg-orange-100 text-orange-800 border-orange-500',
  emergency: 'bg-red-100 text-red-700 border-red-500',
  // unit / lease
  vacant: 'bg-warning-yellow/20 text-yellow-800 border-warning-yellow',
  occupied: 'bg-green-100 text-green-800 border-green-500',
  maintenance: 'bg-orange-100 text-orange-800 border-orange-500',
  active: 'bg-green-100 text-green-800 border-green-500',
  expired: 'bg-red-100 text-red-700 border-red-500',
  terminated: 'bg-gray-100 text-ink border-gray-400',
  // rent
  paid: 'bg-green-100 text-green-800 border-green-500',
  pending: 'bg-warning-yellow/20 text-yellow-800 border-warning-yellow',
  late: 'bg-red-100 text-red-700 border-red-500',
  failed: 'bg-red-100 text-red-700 border-red-500',
  // compliance
  current: 'bg-green-100 text-green-800 border-green-500',
  expiring_soon: 'bg-warning-yellow/20 text-yellow-800 border-warning-yellow',
  not_on_file: 'bg-gray-100 text-ink border-gray-400',
  // access level
  full: 'bg-green-100 text-green-800 border-green-500',
  limited: 'bg-warning-yellow/20 text-yellow-800 border-warning-yellow',
};

export function Badge({ value }: { value: string | null | undefined }) {
  if (!value) return <span className="text-ink/50">—</span>;
  const cls = palette[value] ?? 'bg-gray-100 text-ink border-gray-400';
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 font-display font-bold capitalize ${cls}`}
    >
      {value.replace(/_/g, ' ')}
    </span>
  );
}
