import Link from 'next/link';
import { DataTable, EmptyState } from '@/components/ui/EmptyState';
import { Badge } from '@/components/ui/Badge';
import { fmtDate } from '@/lib/format';
import type { MaintenanceRequest } from '@/types/database';

export function RequestList({
  requests,
  basePath,
}: {
  requests: Array<
    Pick<
      MaintenanceRequest,
      'id' | 'title' | 'category' | 'priority' | 'status' | 'created_at'
    >
  >;
  basePath: string; // e.g. /admin/maintenance
}) {
  if (requests.length === 0) {
    return (
      <EmptyState
        title="No maintenance requests"
        message="Requests will appear here as tenants submit them."
      />
    );
  }
  return (
    <DataTable columns={['Request', 'Category', 'Priority', 'Status', 'Opened', '']}>
      {requests.map((m) => (
        <tr key={m.id} className="hover:bg-light-blue/10">
          <td className="px-4 py-3 font-display font-bold text-navy">
            {m.title || 'Untitled'}
          </td>
          <td className="px-4 py-3 capitalize">{m.category || '—'}</td>
          <td className="px-4 py-3">
            <Badge value={m.priority} />
          </td>
          <td className="px-4 py-3">
            <Badge value={m.status} />
          </td>
          <td className="px-4 py-3">{fmtDate(m.created_at)}</td>
          <td className="px-4 py-3">
            <Link
              href={`${basePath}/${m.id}`}
              className="font-display font-bold text-navy underline"
            >
              Open
            </Link>
          </td>
        </tr>
      ))}
    </DataTable>
  );
}
