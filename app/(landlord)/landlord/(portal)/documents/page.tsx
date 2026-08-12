import { cookies } from 'next/headers';
import { createSupabaseServerClient } from '@/lib/supabase';
import { getCurrentUser } from '@/lib/auth';
import { PageHeader } from '@/components/ui/PortalShell';
import { fmtDate } from '@/lib/format';
import { DocumentUpload } from '@/components/landlord/DocumentUpload';
import { archiveDocument } from './actions';

export const dynamic = 'force-dynamic';

const DOC_TYPE_LABELS: Record<string, string> = {
  lease:               'Lease Agreement',
  hoa_governing:       'HOA Governing Docs / CC&Rs',
  hoa_violation:       'HOA Violation Notice',
  management_contract: 'Prior Management Contract',
  inspection_report:   'Inspection Report',
  other:               'Other',
};

const REQUIRED_TYPES = ['lease'];

const ALL_TYPES = Object.entries(DOC_TYPE_LABELS).map(([key, label]) => ({ key, label }));

export default async function LandlordDocumentsPage() {
  const supabase = createSupabaseServerClient(cookies());
  const user = await getCurrentUser();
  const landlordId = user!.authId;

  const [{ data: docs }, { data: properties }] = await Promise.all([
    supabase
      .from('landlord_documents')
      .select('*, property:properties(name)')
      .eq('landlord_id', landlordId)
      .order('uploaded_at', { ascending: false }),
    supabase
      .from('properties')
      .select('id, name')
      .eq('owner_id', landlordId),
  ]);

  const allDocs = docs ?? [];
  const activeDocs = allDocs.filter((d) => !d.archived);
  const archivedDocs = allDocs.filter((d) => d.archived);

  // Checklist only counts active docs
  const typesOnFile = new Set(activeDocs.map((d) => d.type));
  const missingRequired = REQUIRED_TYPES.filter((t) => !typesOnFile.has(t));

  // Generate signed URLs for active docs only
  const activeWithUrls = await Promise.all(
    activeDocs.map(async (doc) => {
      const { data } = await supabase.storage
        .from('landlord-documents')
        .createSignedUrl(doc.file_path, 3600);
      return { ...doc, signedUrl: data?.signedUrl ?? null };
    })
  );

  return (
    <>
      <PageHeader
        title="My Documents"
        subtitle="Upload and manage your lease agreements, HOA documents, and property records."
      />

      {/* Missing docs alert */}
      {missingRequired.length > 0 && (
        <div className="mb-6 rounded-xl border-l-4 border-l-[#DC2626] bg-red-50 px-4 py-3">
          <p className="font-display font-bold text-navy">Action required</p>
          <p className="text-ink">
            Please upload a copy of your current lease agreement(s). Rental911 requires
            a lease on file for every active tenancy.
          </p>
        </div>
      )}

      {/* At-a-glance checklist */}
      <div className="mb-6 grid grid-cols-2 gap-2 sm:grid-cols-3">
        {ALL_TYPES.map((t) => {
          const has = typesOnFile.has(t.key);
          const required = REQUIRED_TYPES.includes(t.key);
          return (
            <div
              key={t.key}
              className={`rounded-lg border px-3 py-2 text-sm ${
                has
                  ? 'border-green-200 bg-green-50 text-green-800'
                  : required
                  ? 'border-red-200 bg-red-50 text-red-700'
                  : 'border-gray-200 bg-gray-50 text-ink/50'
              }`}
            >
              <span className="mr-1">{has ? '✓' : required ? '✗' : '—'}</span>
              {t.label}
            </div>
          );
        })}
      </div>

      {/* Upload form */}
      <div className="mb-8">
        <DocumentUpload
          landlordId={landlordId}
          properties={(properties ?? []) as { id: string; name: string }[]}
        />
      </div>

      {/* Active documents */}
      {activeWithUrls.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-gray-200">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-ink/70">
              <tr>
                <th className="px-4 py-3 font-display font-bold">Document</th>
                <th className="px-4 py-3 font-display font-bold">Type</th>
                <th className="px-4 py-3 font-display font-bold">Property</th>
                <th className="px-4 py-3 font-display font-bold">Uploaded</th>
                <th className="px-4 py-3 font-display font-bold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {activeWithUrls.map((doc) => (
                <tr key={doc.id}>
                  <td className="px-4 py-3 font-display font-bold text-navy">
                    {doc.label ?? doc.file_name}
                  </td>
                  <td className="px-4 py-3 text-ink/70">
                    {DOC_TYPE_LABELS[doc.type] ?? doc.type}
                  </td>
                  <td className="px-4 py-3 text-ink/70">
                    {(doc.property as any)?.name ?? '—'}
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
                          await archiveDocument(doc.id, landlordId);
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
      )}

      {activeWithUrls.length === 0 && (
        <p className="text-ink/60 text-sm">No documents uploaded yet.</p>
      )}

      {/* Archived documents — collapsed section */}
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
