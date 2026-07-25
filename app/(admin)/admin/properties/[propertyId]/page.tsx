import Link from 'next/link';
import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase';
import { PageHeader } from '@/components/ui/PortalShell';
import { Card } from '@/components/ui/Card';
import { Field, Select } from '@/components/ui/Field';
import { Button } from '@/components/ui/Button';
import { fmtDateTime } from '@/lib/format';
import { setPropertyWarrantyAction } from './actions';

export const dynamic = 'force-dynamic';
// A real headless-browser run against AFC (triggered by this page's Save
// action) can take well beyond the default serverless timeout — see
// lib/afc.ts / lib/afc-browser.ts. Server Actions inherit the maxDuration of
// the route segment they're invoked from.
export const maxDuration = 60;

export default async function AdminPropertyDetail({
  params,
}: {
  params: { propertyId: string };
}) {
  const supabase = createSupabaseServerClient(cookies());
  const { data: property } = await supabase
    .from('properties')
    .select(
      'id, name, address, city, state, zip, warranty_path, afc_tier, afc_service_fee_cents, afc_warranty_invoice_sent_at'
    )
    .eq('id', params.propertyId)
    .maybeSingle();

  if (!property) notFound();

  return (
    <>
      <PageHeader
        title={property.name || property.address || 'Property'}
        subtitle="Home warranty path"
        action={
          <Link href="/admin/properties" className="text-navy underline">
            Back to Properties
          </Link>
        }
      />
      <Card>
        <form
          action={setPropertyWarrantyAction.bind(null, property.id)}
          className="grid grid-cols-1 gap-4 sm:grid-cols-3 sm:items-end"
        >
          <Field label="Warranty Path" htmlFor="warranty_path">
            <Select
              id="warranty_path"
              name="warranty_path"
              defaultValue={property.warranty_path ?? ''}
            >
              <option value="">Not set</option>
              <option value="own_warranty">Own Warranty (self-filed)</option>
              <option value="afc">AFC Home Club</option>
            </Select>
          </Field>
          <Field label="AFC Tier" htmlFor="afc_tier">
            <Select id="afc_tier" name="afc_tier" defaultValue={property.afc_tier ?? ''}>
              <option value="">—</option>
              <option value="diamond">Diamond</option>
              <option value="platinum">Platinum</option>
            </Select>
          </Field>
          <Field label="Tenant Service Fee" htmlFor="afc_service_fee_cents">
            <Select
              id="afc_service_fee_cents"
              name="afc_service_fee_cents"
              defaultValue={
                property.afc_service_fee_cents != null
                  ? String(property.afc_service_fee_cents)
                  : ''
              }
            >
              <option value="">—</option>
              <option value="7500">$75</option>
              <option value="10000">$100</option>
              <option value="12500">$125</option>
            </Select>
          </Field>
          <div className="sm:col-span-3">
            <Button type="submit" variant="outline">
              Save
            </Button>
            <span className="ml-3 text-ink/50">
              {property.afc_warranty_invoice_sent_at
                ? `Warranty invoice sent ${fmtDateTime(property.afc_warranty_invoice_sent_at)}`
                : property.warranty_path === 'afc'
                  ? 'Warranty invoice not yet sent — save again to retry'
                  : ''}
            </span>
          </div>
        </form>
      </Card>
    </>
  );
}
