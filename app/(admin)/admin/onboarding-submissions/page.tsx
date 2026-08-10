import Link from 'next/link';
import { cookies } from 'next/headers';
import { createSupabaseServerClient } from '@/lib/supabase';
import { PageHeader } from '@/components/ui/PortalShell';
import { DataTable, EmptyState } from '@/components/ui/EmptyState';
import { Badge } from '@/components/ui/Badge';
import { fmtDateTime } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function AdminOnboardingSubmissions() {
  const supabase = createSupabaseServerClient(cookies());
  const { data } = await supabase
    .from('onboarding_submissions')
    .select(
      'id, landlord_name, landlord_email, landlord_phone, property_address, status, submitted_at'
    )
    .order('submitted_at', { ascending: false });

  const rows = data ?? [];
  const newCount = rows.filter((r) => r.status === 'new').length;

  return (
    <>
      <PageHeader
        title="Onboarding Submissions"
        subtitle={
          newCount > 0
            ? `${newCount} new submission${newCount > 1 ? 's' : ''} awaiting review`
            : 'Landlord onboarding survey submissions from survey.rental911.net'
        }
      />
      {rows.length === 0 ? (
        <EmptyState
          title="No submissions yet"
          message="Completed landlord onboarding surveys will appear here automatically."
        />
      ) : (
        <DataTable columns={['Landlord', 'Property', 'Status', 'Submitted', 'Action']}>
          {rows.map((s) => (
            <tr key={s.id} className={s.status === 'new' ? 'bg-gold/5' : ''}>
              <td className="px-4 py-3">
                <p className="font-display font-bold text-navy">
                  {s.landlord_name || '—'}
                </p>
                <p className="text-ink/60 text-sm">{s.landlord_email || '—'}</p>
                {s.landlord_phone && (
                  <p className="text-ink/60 text-sm">{s.landlord_phone}</p>
                )}
              </td>
              <td className="px-4 py-3 text-sm">
                {s.property_address || '—'}
              </td>
              <td className="px-4 py-3">
                <Badge value={s.status} />
              </td>
              <td className="px-4 py-3 text-ink/70 text-sm">
                {fmtDateTime(s.submitted_at)}
              </td>
              <td className="px-4 py-3">
                <Link
                  href={`/admin/onboarding-submissions/${s.id}`}
                  className="font-display font-bold text-navy underline text-sm"
                >
                  View →
                </Link>
              </td>
            </tr>
          ))}
        </DataTable>
      )}
    </>
  );
}
