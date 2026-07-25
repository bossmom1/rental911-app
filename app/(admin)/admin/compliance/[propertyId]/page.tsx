import Link from 'next/link';
import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase';
import { PageHeader } from '@/components/ui/PortalShell';
import { Card } from '@/components/ui/Card';
import { ComplianceStatusBadge } from '@/components/ui/ComplianceStatusBadge';
import { Field, Select, Input } from '@/components/ui/Field';
import { Button } from '@/components/ui/Button';
import { complianceItemLabel } from '@/lib/compliance';
import { fmtDate } from '@/lib/format';
import type { ComplianceStatus } from '@/types/database';
import { updateComplianceItemAction } from './actions';

export const dynamic = 'force-dynamic';

const STATUS_OPTIONS: ComplianceStatus[] = ['current', 'expiring_soon', 'expired', 'not_on_file'];

export default async function AdminCompliancePropertyDetail({
  params,
}: {
  params: { propertyId: string };
}) {
  const supabase = createSupabaseServerClient(cookies());
  const { data: property } = await supabase
    .from('properties')
    .select('id, name, county, address')
    .eq('id', params.propertyId)
    .maybeSingle();

  if (!property) notFound();

  const { data: items } = await supabase
    .from('compliance_items')
    .select('*')
    .eq('property_id', params.propertyId)
    .order('type', { ascending: true });

  const rows = items ?? [];

  return (
    <>
      <PageHeader
        title={property.name ?? 'Property'}
        subtitle={`${property.county ?? '—'} County — ${property.address ?? ''}`}
        action={
          <Link href="/admin/compliance" className="text-navy underline">
            Back to Compliance
          </Link>
        }
      />

      <div className="space-y-4">
        {rows.map((item) => (
          <Card key={item.id}>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-display text-lg font-bold text-navy">
                {complianceItemLabel(item.type)}
              </h3>
              <ComplianceStatusBadge value={item.status} />
            </div>
            <form
              action={updateComplianceItemAction.bind(null, params.propertyId, item.id)}
              className="grid grid-cols-1 gap-4 sm:grid-cols-3 sm:items-end"
            >
              <Field label="Status" htmlFor={`status-${item.id}`}>
                <Select id={`status-${item.id}`} name="status" defaultValue={item.status ?? ''}>
                  {STATUS_OPTIONS.map((s) => (
                    <option key={s} value={s}>
                      {s.replace(/_/g, ' ')}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Expiry Date" htmlFor={`expiry-${item.id}`}>
                <Input
                  id={`expiry-${item.id}`}
                  name="expiry_date"
                  type="date"
                  defaultValue={item.expiry_date ?? ''}
                />
              </Field>
              <Field label="Notes" htmlFor={`notes-${item.id}`}>
                <Input id={`notes-${item.id}`} name="notes" defaultValue={item.notes ?? ''} />
              </Field>
              <div className="sm:col-span-3">
                <Button type="submit" variant="outline">
                  Save
                </Button>
                <span className="ml-3 text-ink/50">
                  Last updated {fmtDate(item.updated_at)}
                </span>
              </div>
            </form>
          </Card>
        ))}
      </div>
    </>
  );
}
