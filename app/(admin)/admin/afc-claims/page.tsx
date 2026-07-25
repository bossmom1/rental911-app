import { cookies } from 'next/headers';
import { createSupabaseServerClient } from '@/lib/supabase';
import { PageHeader } from '@/components/ui/PortalShell';
import { DataTable, EmptyState } from '@/components/ui/EmptyState';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { fmtMoney, fmtDateTime } from '@/lib/format';
import { markClaimSubmittedAction } from './actions';

export const dynamic = 'force-dynamic';

export default async function AdminAfcClaims() {
  const supabase = createSupabaseServerClient(cookies());
  const { data } = await supabase
    .from('afc_claim_invoices')
    .select(
      `id, service_fee_cents, status, generated_at, error,
       property:properties(name, address),
       maintenance_request:maintenance_requests(title, category)`
    )
    .order('generated_at', { ascending: false });

  const rows = data ?? [];

  return (
    <>
      <PageHeader
        title="AFC Claims"
        subtitle="Home warranty claims for AFC Home Club properties. AFC Service: 770-973-2400 or service@afchomeclub.com."
      />
      {rows.length === 0 ? (
        <EmptyState
          title="No claims yet"
          message="Claims appear here when a tenant submits a maintenance request on an AFC-path property."
        />
      ) : (
        <DataTable columns={['Property', 'Issue', 'Deductible', 'Status', 'Filed', 'Action']}>
          {rows.map((c) => {
            const property = (c as any).property;
            const request = (c as any).maintenance_request;
            return (
              <tr key={c.id}>
                <td className="px-4 py-3 font-display font-bold text-navy">
                  {property?.name || property?.address || '—'}
                </td>
                <td className="px-4 py-3">
                  {request?.title || '—'}
                  {request?.category && (
                    <span className="block text-ink/60 capitalize">{request.category}</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  {c.service_fee_cents != null ? fmtMoney(c.service_fee_cents / 100) : '—'}
                </td>
                <td className="px-4 py-3">
                  <Badge value={c.status} />
                  {c.status === 'failed' && c.error && (
                    <span className="block text-ink/60">{c.error}</span>
                  )}
                </td>
                <td className="px-4 py-3 text-ink/70">{fmtDateTime(c.generated_at)}</td>
                <td className="px-4 py-3">
                  {c.status === 'pending_manual' ? (
                    <form action={markClaimSubmittedAction.bind(null, c.id)}>
                      <Button type="submit" variant="outline">
                        Mark as Submitted
                      </Button>
                    </form>
                  ) : (
                    <span className="text-ink/50">—</span>
                  )}
                </td>
              </tr>
            );
          })}
        </DataTable>
      )}
    </>
  );
}
