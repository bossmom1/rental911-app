import { cookies } from 'next/headers';
import { createSupabaseServerClient } from '@/lib/supabase';
import { PageHeader } from '@/components/ui/PortalShell';
import { fmtDate } from '@/lib/format';
import { notFound } from 'next/navigation';

export const dynamic = 'force-dynamic';

const DOC_TYPE_LABELS: Record<string, string> = {
  lease:               'Lease Agreement',
  hoa_governing:       'HOA Governing Docs / CC&Rs',
  hoa_violation:       'HOA Violation Notice',
  management_contract: 'Prior Management Contract',
  inspection_report:   'Inspection Report',
  other:               'Other',
};

const REQUIRED_TYPES = [
  { key: 'lease',         label: 'Lease Agreement' },
];

const ALL_TYPES = Object.entries(DOC_TYPE_LABELS).map(([key, label]) => ({ key, label }));

export default async function AdminLandlordDocumentsPage({
  params,
}: {
  params: { landlordId: string };
}) {
  const supabase = createSupabaseServerClient(cookies());

  const [{ data: landlord }, { data: docs }] = await Promise.all([
    supabase
      .from('users')
      .select('id, full_name, email')
      .eq('id', params.landlordId)
      .single(),
    supabase
      .from('landlord_documents')
      .select('*, property:properties(name)')
      .eq('landlord_id', params.landlordId)
      .order('uploaded_at', { ascending: false }),
  ]);

  if (!landlord) notFound();

  const documents = docs ?? [];
  const typesOnFile = new Set(documents.map((d) => d.type));
  const missingRequired = REQUIRED_TYPES.filter((t) => !typesOnFile.has(t.key));

  // Generate signed URLs for admin viewing
  const docsWithUrls = await Promise.all(
    documents.map(async (doc) => {
      const { data } = await supabase.storage
        .from('landlord-documents')
        .createSignedUrl(doc.file_path, 3600);
      return { ...doc, signedUrl: data?.signedUrl ?? null };
    })
  );

  return (
    <>
      <PageHeader
        title={`Documents — ${landlord.full_name ?? landlord.email}`}
        subtitle={landlord.email}
      />

      {/* Missing required alert */}
      {missingRequired.length > 0 && (
        <div className="mb-6 rounded-xl border-l-4 border-l-[#DC2626] bg-red-50 px-4 py-3">
          <p className="font-display font-bold text-navy">
            {missingRequired.length} required document{missingRequired.length === 1 ? '' : 's'} missing
          </p>
          <ul className="mt-1 text-ink">
            {missingRequired.map((t) => (
              <li key={t.key}>✗ {t.label} not on file</li>
            ))}
          </ul>
        </div>
      )}

      {/* At-a-glance type checklist */}
      <div className="mb-6 grid grid-cols-2 gap-2 sm:grid-cols-3">
        {ALL_TYPES.map((t) => {
          const has = typesOnFile.has(t.key);
          const required = REQUIRED_TYPES.some((r) => r.key === t.key);
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

      {/* Document table */}
      {docsWithUrls.length === 0 ? (
        <div className="rounded-xl border border-gray-200 px-6 py-10 text-center text-ink/60">
          No documents on file for this landlord.
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-gray-200">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-ink/70">
              <tr>
                <th className="px-4 py-3 font-display font-bold">Document</th>
                <th className="px-4 py-3 font-display font-bold">Type</th>
                <th className="px-4 py-3 font-display font-bold">Property</th>
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
                  <td className="px-4 py-3 text-ink/70">
                    {(doc.property as any)?.name ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-ink/50 text-xs">
                    {doc.file_size
                      ? `${(doc.file_size / 1024).toFixed(0)} KB`
                      : '—'}
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
