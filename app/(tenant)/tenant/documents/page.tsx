import { cookies } from 'next/headers';
import { createSupabaseServerClient } from '@/lib/supabase';
import { getCurrentUser } from '@/lib/auth';
import { PageHeader } from '@/components/ui/PortalShell';
import { fmtDate } from '@/lib/format';
import { TenantDocumentUpload } from '@/components/tenant/TenantDocumentUpload';
import { archiveTenantDocument } from './actions';

export const dynamic = 'force-dynamic';

const DOC_TYPE_LABELS: Record<string, string> = {
  renters_insurance:  'Renters Insurance',
  gov_id:             'Government ID',
  income_verification:'Income Verification',
  move_in_photos:     'Move-In Photos',
  move_out_photos:    'Move-Out Photos',
  notice:             'Notice / Letter Received',
  other:              'Other',
};

export default async function TenantDocumentsPage() {
  const supabase = createSupabaseServerClient(cookies());
  const user = await getCurrentUser();
  const tenantId = user!.authId;

  // Get active lease + landlordId through property owner
  const { data: lease } = await supabase
    .from('leases')
    .select('id, property_id, property:properties(id, owner_id)')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const landlordId = (lease?.property as any)?.owner_id as string | undefined;
  const propertyId = lease?.property_id ?? undefined;

  const { data: docs } = await supabase
    .from('tenant_documents')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('uploaded_at', { ascending: false });

  const allDocs    = docs ?? [];
  const activeDocs = allDocs.filter((d) => !d.archived);
  const archivedDocs = allDocs.filter((d) => d.archived);

  // Generate signed URLs for active docs
  const activeWithUrls = await Promise.all(
    activeDocs.map(async (doc) => {
      const { data } = await supabase.storage
        .from('tenant-documents')
        .createSignedUrl(doc.file_path, 3600);
      return { ...doc, signedUrl: data?.signedUrl ?? null };
    })
  );

  return (
    <>
      <PageHeader
        title="My Documents"
        subtitle="Upload renters insurance, ID, income verification, and any notices you receive."
      />

      {/* Upload form — only if they have an active lease with a landlord */}
      {landlordId && lease ? (
        <div className="mb-8">
          <TenantDocumentUpload
            tenantId={tenantId}
            landlordId={landlordId}
            leaseId={lease.id}
            propertyId={propertyId}
          />
        </div>
      ) : (
        <div className="mb-8 rounded-xl border border-gray-200 px-6 py-4 text-ink/60 text-sm">
          Document uploads are available once you have an active lease on file.
        </div>
      )}

      {/* Active documents */}
      {activeWithUrls.length > 0 ? (
        <div className="overflow-hidden rounded-xl border border-gray-200">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-ink/70">
              <tr>
                <th className="px-4 py-3 font-display font-bold">Document</th>
                <th className="px-4 py-3 font-display font-bold">Type</th>
                <th className="px-4 py-3 font-display font-bold">Uploaded</th>
                <th className="px-4 py-3 font-display font-bold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {activeWithUrls.map((doc) => (
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
                  <td className="px-4 py-3 text-ink/70">{fmtDate(doc.uploaded_at)}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      {doc.signedUrl && (
                        <a
                          href={doc.signedUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-display font-bold text-navy underline"
                        >
                          View
                        </a>
                      )}
                      <form
                        action={async () => {
                          'use server';
                          await archiveTenantDocument(doc.id, tenantId, lease?.id);
                        }}
                      >
                        <button
                          type="submit"
                          className="text-ink/40 underline text-xs hover:text-ink/70"
                        >
                          Archive
                        </button>
                      </form>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-ink/60 text-sm">No documents uploaded yet.</p>
      )}

      {/* Archived — collapsed */}
      {archivedDocs.length > 0 && (
        <details className="mt-8">
          <summary className="cursor-pointer text-xs text-ink/40 hover:text-ink/60">
            Archived documents ({archivedDocs.length})
          </summary>
          <div className="mt-3 overflow-hidden rounded-xl border border-gray-100">
            <table className="w-full text-sm text-ink/50">
              <thead className="bg-gray-50 text-left text-ink/40">
                <tr>
                  <th className="px-4 py-2 font-display font-bold">Document</th>
                  <th className="px-4 py-2 font-display font-bold">Type</th>
                  <th className="px-4 py-2 font-display font-bold">Uploaded</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {archivedDocs.map((doc) => (
                  <tr key={doc.id} className="opacity-60">
                    <td className="px-4 py-2 line-through">{doc.label ?? doc.file_name}</td>
                    <td className="px-4 py-2">{DOC_TYPE_LABELS[doc.type] ?? doc.type}</td>
                    <td className="px-4 py-2">{fmtDate(doc.uploaded_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </>
  );
}
