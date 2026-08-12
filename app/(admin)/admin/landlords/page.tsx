import Link from 'next/link';
import { cookies } from 'next/headers';
import { createSupabaseServerClient } from '@/lib/supabase';
import { PageHeader } from '@/components/ui/PortalShell';
import { DataTable, EmptyState } from '@/components/ui/EmptyState';
import { Badge } from '@/components/ui/Badge';
import { AccessLevelToggle } from '@/components/admin/AccessLevelToggle';
import type { AccessLevel } from '@/types/database';

export const dynamic = 'force-dynamic';

export default async function AdminLandlords() {
  const supabase = createSupabaseServerClient(cookies());

  const [{ data: landlords }, { data: submissions }] = await Promise.all([
    supabase
      .from('users')
      .select('*, properties(count), landlord_documents(type)')
      .eq('role', 'landlord')
      .order('created_at', { ascending: false }),
    supabase
      .from('onboarding_submissions')
      .select('landlord_email, status, submitted_at'),
  ]);

  const rows = landlords ?? [];

  // Map email (lowercase) → submission record
  const submissionByEmail = new Map(
    (submissions ?? []).map((s) => [
      (s.landlord_email ?? '').toLowerCase(),
      s,
    ])
  );

  return (
    <>
      <PageHeader
        title="Landlords"
        subtitle="Manage landlord accounts and unlock full access after the onboarding call."
      />
      {rows.length === 0 ? (
        <EmptyState
          title="No landlords yet"
          message="Landlords who sign up will appear here."
        />
      ) : (
        <DataTable
          columns={[
            'Landlord',
            'Properties',
            'Survey',
            'Subscription',
            'Full Access',
            'Docs',
            'P&L',
          ]}
        >
          {rows.map((u) => {
            const propCount =
              Array.isArray(u.properties) && u.properties.length > 0
                ? (u.properties[0] as { count: number }).count
                : 0;

            const docTypes = Array.isArray(u.landlord_documents)
              ? (u.landlord_documents as { type: string }[]).map((d) => d.type)
              : [];
            const docCount = docTypes.length;
            const hasLease = docTypes.includes('lease');

            const submission = submissionByEmail.get(
              (u.email ?? '').toLowerCase()
            );

            return (
              <tr key={u.id}>
                <td className="px-4 py-3">
                  <p className="font-display font-bold text-navy">
                    {u.full_name || '—'}
                  </p>
                  <p className="text-ink/60">{u.email}</p>
                  {u.onboarding_fee_status === 'paid' && (
                    <span className="mt-0.5 inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-700">
                      ✓ Fee paid
                    </span>
                  )}
                </td>
                <td className="px-4 py-3">{propCount}</td>
                <td className="px-4 py-3">
                  {submission ? (
                    <Link href="/admin/onboarding-submissions" className="inline-block">
                      <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-700">
                        ✓ Submitted
                      </span>
                    </Link>
                  ) : (
                    <span className="rounded-full bg-orange-100 px-2 py-0.5 text-xs font-semibold text-orange-700">
                      ⏳ Pending
                    </span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <Badge value={u.subscription_status} />
                </td>
                <td className="px-4 py-3">
                  <AccessLevelToggle
                    userId={u.id}
                    level={(u.access_level ?? 'limited') as AccessLevel}
                  />
                </td>
                <td className="px-4 py-3">
                  <Link
                    href={`/admin/landlords/${u.id}/documents`}
                    className="inline-flex items-center gap-1"
                  >
                    {docCount === 0 ? (
                      <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">
                        ✗ None
                      </span>
                    ) : !hasLease ? (
                      <span className="rounded-full bg-orange-100 px-2 py-0.5 text-xs font-semibold text-orange-700">
                        ⚠ No lease
                      </span>
                    ) : (
                      <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-700">
                        ✓ {docCount}
                      </span>
                    )}
                  </Link>
                </td>
                <td className="px-4 py-3">
                  <Link
                    href={`/admin/landlords/${u.id}/financials/reports`}
                    className="font-display font-bold text-navy underline whitespace-nowrap"
                  >
                    P&amp;L Reports
                  </Link>
                </td>
              </tr>
            );
          })}
        </DataTable>
      )}
    </>
  );
}
