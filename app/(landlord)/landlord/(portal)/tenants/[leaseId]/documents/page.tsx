import Link from 'next/link';
import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase';
import { getCurrentUser } from '@/lib/auth';
import { PageHeader } from '@/components/ui/PortalShell';
import { fmtDate } from '@/lib/format';

export const dynamic = 'force-dynamic';

const DOC_TYPE_LABELS: Record<string, string> = {
  renters_insurance:   'Renters Insurance',
  gov_id:              'Government ID',
  income_verification: 'Income Verification',
  move_in_photos:      'Move-In Photos',
  move_out_photos:     'Move-Out Photos',
  notice:              'Notice / Letter Received',
  other:               'Other',
};

export default async function LandlordTenantDocumentsPage({
  params,
}: {
  params: { leaseId: string };
}) {
  const supabase = createSupabaseServerClient(cookies());
  const user = await getCurrentUser();
  const landlordId = user!.authId;

  // Verify this lease belongs to the landlord
  const { data: lease } = await supabase
    .from('leases')
    .select(
      `id, tenant_id,
       tenant:users!leases_tenant_id_fkey(full_name, email),
       unit:units(unit_number, property:properties(name, owner_id))`
    )
    .eq('id', params.leaseId)
    .maybeSingle();

  const property = (lease as any)?.unit?.property;
  if (!lease || property?.owner_id !== landlordId) notFound();

  const tenant = (lease as any).tenant;
  const unit   = (lease as any).unit;

  const { data: docs } = await supabase
    .from('tenant_documents')
    .select('*')
    .eq('tenant_id', lease.tenant_id)
    .eq('archived', false)
    .order('uploaded_at', { ascending: false });

  const documents = docs ?? [];

  // Generate signed URLs (landlord RLS allows this via their folder path)
  const docsWithUrls = await Promise.all(
    documents.map(async (doc) => {
      const { data } = await supabase.storage
        .from('tenant-documents')
        .createSignedUrl(doc.file_path, 3600);
      return { ...doc, signedUrl: data?.signedUrl ?? null };
    })
  );

  return (
    <>
      <PageHeader
        title={`${tenant?.full_name ?? 'Tenant'} — Documents`}
        subtitle={`${property?.name ?? ''}${unit?.unit_number ? ` · Unit ${unit.unit_number}` : ''} · ${tenant?.email ?? ''}`}
        action={
          <Link href={`/landlord/tenants/${params.leaseId}`} className="text-navy underline text-sm">
            ← Back to Tenant
          </Link>
        }
      />

      {docsWithUrls.length === 0 ? (
        <div className="rounded-xl border border-gray-200 px-6 py-10 text-center text-ink/60">
          No documents uploaded by this tenant yet.
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-gray-200">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-ink/70">
              <tr>
                <th className="px-4 py-3 font-display font-bold">Document</th>
                <th className="px-4 py-3 font-display font-bold">Type</th>
                <th className="px-4 py-3 font-display font-bold">Size</th>
                <th className="px-4 py-3 font-display font-bold">Uploaded</th>
                <th className="px-4 py-3 font-display font-bold">View</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {docsWithUrls.map((doc) => (
                <tr key={doc.id}>
                  <td className="px-4 py-3 font-display font-bold text-navy">
                    {doc.label ?? doc.file_name}
                    {doc.label && (
                      <p className="font-normal text-ink/50 text-xs">{doc.file_name}</p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-ink/70">
                    {DOC_TYPE_LABELS[doc.type] ?? doc.type}
                  </td>
                  <td className="px-4 py-3 text-ink/50 text-xs">
                    {doc.file_size ? `${(doc.file_size / 1024).toFixed(0)} KB` : '—'}
                  </td>
                  <td className="px-4 py-3 text-ink/70">{fmtDate(doc.uploaded_at)}</td>
                  <td className="px-4 py-3">
                    {doc.signedUrl ? (
                      <a
                        href={doc.signedUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-display font-bold text-navy underline whitespace-nowrap"
                      >
                        View →
                      </a>
                    ) : (
                      <span className="text-ink/40">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
