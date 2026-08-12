import { notFound } from 'next/navigation';
import { cookies } from 'next/headers';
import { createSupabaseServerClient } from '@/lib/supabase';
import { PageHeader } from '@/components/ui/PortalShell';
import { DataTable } from '@/components/ui/EmptyState';
import { complianceTypeLabel, complianceStatusClass, complianceStatusLabel } from '@/lib/compliance';
import { UpdateComplianceItemForm } from './UpdateComplianceItemForm';

export const dynamic = 'force-dynamic';

export default async function PropertyCompliancePage({
  params,
}: {
  params: { propertyId: string };
}) {
  const supabase = createSupabaseServerClient(cookies());

  const [{ data: property }, { data: items }] = await Promise.all([
    supabase
      .from('properties')
      .select('id, name, address, county, lead_paint_required')
      .eq('id', params.propertyId)
      .single(),
    supabase
      .from('compliance_items')
      .select('*')
      .eq('property_id', params.propertyId)
      .order('type'),
  ]);

  if (!property) notFound();

  return (
    <>
      <PageHeader
        title={property.name || property.address || 'Property Compliance'}
        subtitle={`${property.address} · ${property.county} County`}
      />

      <DataTable
        columns={['Item', 'Status', 'Expires', 'Notes', 'Update']}
      >
        {(items ?? []).map((item) => (
          <tr key={item.id}>
            <td className="px-4 py-3 font-medium text-sm">
              {complianceTypeLabel(item.type ?? '')}
            </td>
            <td className="px-4 py-3">
              <span
                className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${complianceStatusClass(item.status ?? '')}`}
              >
                {complianceStatusLabel(item.status ?? '')}
              </span>
            </td>
            <td className="px-4 py-3 text-sm">
              {item.expiry_date
                ? new Date(item.expiry_date).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  })
                : '—'}
            </td>
            <td className="px-4 py-3 text-sm text-ink/70">{item.notes || '—'}</td>
            <td className="px-4 py-3">
              <UpdateComplianceItemForm item={item} />
            </td>
          </tr>
        ))}
      </DataTable>
    </>
  );
}
