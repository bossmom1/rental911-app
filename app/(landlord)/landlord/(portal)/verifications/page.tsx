import { cookies } from 'next/headers';
import { createSupabaseServerClient } from '@/lib/supabase';
import { getCurrentUser } from '@/lib/auth';
import { PageHeader } from '@/components/ui/PortalShell';
import { DataTable, EmptyState } from '@/components/ui/EmptyState';
import { Badge } from '@/components/ui/Badge';
import { fmtDate } from '@/lib/format';

export const dynamic = 'force-dynamic';

type VerificationRow = {
  id: string;
  token: string;
  employer_email: string;
  employer_name: string | null;
  employer_contact_name: string | null;
  status: string;
  sent_at: string;
  completed_at: string | null;
  tenant: { full_name: string | null }[] | null;
};

export default async function LandlordVerificationsPage() {
  const supabase = createSupabaseServerClient(cookies());
  const current = await getCurrentUser();
  const meId = current!.authId;

  const { data: verifications } = await supabase
    .from('employment_verifications')
    .select(
      'id, token, employer_email, employer_name, employer_contact_name, status, sent_at, completed_at, tenant:users!employment_verifications_tenant_id_fkey(full_name)'
    )
    .eq('landlord_id', meId)
    .order('created_at', { ascending: false });

  const rows = (verifications ?? []) as VerificationRow[];

  return (
    <>
      <PageHeader
        title="Employment Verifications"
        subtitle="Employer verification forms sent for your tenants. Rental911 files the completed responses — acting on the information is your responsibility."
      />

      {rows.length === 0 ? (
        <EmptyState
          title="No verifications yet"
          message="Employment verifications are sent automatically when employer contact information is provided for a new tenant."
        />
      ) : (
        <DataTable
          columns={['Tenant', 'Employer', 'Sent', 'Completed', 'Status', 'Response']}
        >
          {rows.map((v) => (
            <tr key={v.id}>
              <td className="px-4 py-3 font-display font-bold text-navy">
                {v.tenant?.[0]?.full_name ?? '—'}
              </td>
              <td className="px-4 py-3">
                <p>{v.employer_name ?? v.employer_email}</p>
                {v.employer_contact_name && (
                  <p className="text-ink/60">{v.employer_contact_name}</p>
                )}
                <p className="text-ink/50 text-sm">{v.employer_email}</p>
              </td>
              <td className="px-4 py-3">{fmtDate(v.sent_at)}</td>
              <td className="px-4 py-3">
                {v.completed_at ? fmtDate(v.completed_at) : '—'}
              </td>
              <td className="px-4 py-3">
                <Badge value={v.status} />
              </td>
              <td className="px-4 py-3">
                {v.status === 'completed' && (
                  <a
                    href={`/verify-employment/${v.token}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-display font-bold text-navy underline"
                  >
                    View →
                  </a>
                )}
              </td>
            </tr>
          ))}
        </DataTable>
      )}
    </>
  );
}
