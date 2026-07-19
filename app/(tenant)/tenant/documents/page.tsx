import { cookies } from 'next/headers';
import { createSupabaseServerClient } from '@/lib/supabase';
import { getCurrentUser } from '@/lib/auth';
import { PageHeader } from '@/components/ui/PortalShell';
import { Card, CardHeader } from '@/components/ui/Card';
import { DataTable, EmptyState } from '@/components/ui/EmptyState';
import { DocumentUpload } from '@/components/tenant/DocumentUpload';
import { fmtDate } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function TenantDocuments() {
  const supabase = createSupabaseServerClient(cookies());
  const current = await getCurrentUser();

  const { data: lease } = await supabase
    .from('leases')
    .select('id, unit_id')
    .eq('tenant_id', current!.authId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: documents } = await supabase
    .from('documents')
    .select('*')
    .order('created_at', { ascending: false });

  const rows = documents ?? [];

  return (
    <>
      <PageHeader
        title="Documents"
        subtitle="Documents on your lease. Anything you upload is scoped to your unit only."
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          {rows.length === 0 ? (
            <EmptyState
              title="No documents yet"
              message="Upload renters insurance or ID, or view documents shared by your landlord."
            />
          ) : (
            <DataTable columns={['Name', 'Type', 'Uploaded by', 'Date']}>
              {rows.map((d) => (
                <tr key={d.id}>
                  <td className="px-4 py-3">
                    {d.file_url ? (
                      <a
                        href={d.file_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-display font-bold text-navy underline"
                      >
                        {d.file_name || 'Document'}
                      </a>
                    ) : (
                      <span className="font-display font-bold text-navy">
                        {d.file_name || 'Document'}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 capitalize">
                    {(d.type ?? '').replace(/_/g, ' ') || '—'}
                  </td>
                  <td className="px-4 py-3 capitalize">{d.uploaded_by_role || '—'}</td>
                  <td className="px-4 py-3">{fmtDate(d.created_at)}</td>
                </tr>
              ))}
            </DataTable>
          )}
        </div>

        <div>
          <Card>
            <CardHeader title="Upload a document" />
            {lease ? (
              <DocumentUpload
                tenantId={current!.authId}
                leaseId={lease.id}
                unitId={lease.unit_id}
              />
            ) : (
              <p className="text-ink/70">
                You&apos;ll be able to upload documents once you have an active lease.
              </p>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
