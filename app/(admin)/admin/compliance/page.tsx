import Link from 'next/link';
import { cookies } from 'next/headers';
import { createSupabaseServerClient } from '@/lib/supabase';
import { PageHeader } from '@/components/ui/PortalShell';
import { DataTable, EmptyState } from '@/components/ui/EmptyState';
import { ComplianceStatusBadge } from '@/components/ui/ComplianceStatusBadge';
import { SelfLicensedMunicipalityBadge } from '@/components/ui/SelfLicensedMunicipalityBadge';
import { StatCard } from '@/components/ui/StatCard';
import { Field, Select } from '@/components/ui/Field';
import { Button } from '@/components/ui/Button';
import { fmtDate } from '@/lib/format';
import { isPgSelfLicensedMunicipality, SUPPORTED_COUNTIES } from '@/lib/compliance';
import type { ComplianceStatus } from '@/types/database';

export const dynamic = 'force-dynamic';

interface ComplianceItemRow {
  type: string;
  status: ComplianceStatus | null;
  expiry_date: string | null;
  updated_at: string | null;
}

interface PropertyRow {
  id: string;
  name: string | null;
  county: string | null;
  municipality: string | null;
  compliance_items: ComplianceItemRow[];
}

const STATUS_OPTIONS: ComplianceStatus[] = [
  'current',
  'expiring_soon',
  'expired',
  'not_on_file',
  'not_applicable',
];

function findItem(items: ComplianceItemRow[], types: string[]): ComplianceItemRow | undefined {
  return items.find((i) => types.includes(i.type));
}

function lastUpdated(items: ComplianceItemRow[]): string | null {
  const dates = items.map((i) => i.updated_at).filter(Boolean) as string[];
  if (!dates.length) return null;
  return dates.reduce((latest, d) => (d > latest ? d : latest));
}

export default async function AdminCompliance({
  searchParams,
}: {
  searchParams: { county?: string; status?: string };
}) {
  const supabase = createSupabaseServerClient(cookies());
  const countyFilter = searchParams.county || '';
  const statusFilter = searchParams.status || '';

  const { data } = await supabase
    .from('properties')
    .select('id, name, county, municipality, compliance_items(type, status, expiry_date, updated_at)')
    .order('name', { ascending: true });

  const allProperties = (data ?? []) as unknown as PropertyRow[];
  const allItems = allProperties.flatMap((p) => p.compliance_items ?? []);

  const expiring = allItems.filter((i) => i.status === 'expiring_soon').length;
  const expired = allItems.filter((i) => i.status === 'expired').length;
  const notOnFile = allItems.filter((i) => i.status === 'not_on_file').length;

  const rows = allProperties.filter((p) => {
    if (countyFilter && p.county !== countyFilter) return false;
    if (statusFilter && !(p.compliance_items ?? []).some((i) => i.status === statusFilter)) {
      return false;
    }
    return true;
  });

  return (
    <>
      <PageHeader
        title="Compliance"
        subtitle="Maryland rental license, lead paint, and inspection tracking."
      />

      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard tone="red" label="Expiring Soon" value={expiring} sublabel="within 30 days" />
        <StatCard tone="red" label="Expired" value={expired} />
        <StatCard tone="gold" label="Not On File" value={notOnFile} />
      </div>

      <form method="GET" className="mb-6 flex flex-wrap items-end gap-4">
        <div className="w-48">
          <Field label="County" htmlFor="county">
            <Select id="county" name="county" defaultValue={countyFilter}>
              <option value="">All counties</option>
              {SUPPORTED_COUNTIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <div className="w-48">
          <Field label="Status" htmlFor="status">
            <Select id="status" name="status" defaultValue={statusFilter}>
              <option value="">All statuses</option>
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s.replace(/_/g, ' ')}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Button type="submit" variant="outline" className="mb-4">
          Filter
        </Button>
        {(countyFilter || statusFilter) && (
          <Link href="/admin/compliance" className="mb-4 text-navy underline">
            Clear filters
          </Link>
        )}
      </form>

      {rows.length === 0 ? (
        <EmptyState
          title="No properties match these filters"
          message="Compliance items are created automatically when a property is added."
        />
      ) : (
        <DataTable
          columns={[
            'Property',
            'County',
            'Rental License',
            'Lead Paint Cert',
            'Inspection Cert',
            'Last Updated',
          ]}
        >
          {rows.map((p) => {
            const items = p.compliance_items ?? [];
            const rentalLicense = findItem(items, [
              'rental_license',
              'dpie_rental_license',
              'municipal_rental_license',
              'town_rental_license',
            ]);
            const leadPaint = findItem(items, ['lead_paint_cert']);
            const inspection = findItem(items, ['inspection_cert']);
            return (
              <tr key={p.id}>
                <td className="px-4 py-3 font-display font-bold text-navy">
                  <Link href={`/admin/compliance/${p.id}`} className="hover:underline">
                    {p.name ?? '—'}
                  </Link>
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-col items-start gap-1">
                    <span>{p.county ?? '—'}</span>
                    {isPgSelfLicensedMunicipality(p.county, p.municipality) && (
                      <SelfLicensedMunicipalityBadge />
                    )}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-col gap-1">
                    <ComplianceStatusBadge value={rentalLicense?.status} />
                    {rentalLicense?.expiry_date && (
                      <span className="text-ink/60">{fmtDate(rentalLicense.expiry_date)}</span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <ComplianceStatusBadge value={leadPaint?.status} />
                </td>
                <td className="px-4 py-3">
                  <ComplianceStatusBadge value={inspection?.status} />
                </td>
                <td className="px-4 py-3 text-ink/70">{fmtDate(lastUpdated(items))}</td>
              </tr>
            );
          })}
        </DataTable>
      )}
    </>
  );
}
