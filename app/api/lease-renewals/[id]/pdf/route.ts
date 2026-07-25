import { cookies } from 'next/headers';
import { NextResponse, type NextRequest } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase';
import { renderLeasePdf } from '@/lib/lease-pdf';
import { fmtDate } from '@/lib/format';

/**
 * GET /api/lease-renewals/:id/pdf — renders the draft renewal lease on
 * demand (terms can still change before landlord approval, so unlike
 * receipts this is never pre-generated/stored). RLS-scoped: the plain
 * server client already restricts lease_renewals to the owning landlord
 * or an admin (see supabase/migrations/0010_compliance_and_renewal.sql).
 */
export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient(cookies());

  const { data: renewal, error } = await supabase
    .from('lease_renewals')
    .select(
      `id, new_end_date, new_monthly_rent,
       lease:leases (
         id, start_date, security_deposit,
         tenant:users!leases_tenant_id_fkey(full_name),
         landlord:users!leases_landlord_id_fkey(full_name),
         unit:units(unit_number, property:properties(name, address))
       )`
    )
    .eq('id', params.id)
    .maybeSingle();

  if (error || !renewal) {
    return NextResponse.json({ error: 'Renewal not found.' }, { status: 404 });
  }

  const lease = (renewal as any).lease;
  const tenant = lease?.tenant;
  const landlordProfile = lease?.landlord;
  const unit = lease?.unit;
  const property = unit?.property;

  const pdfBuffer = await renderLeasePdf({
    tenantName: tenant?.full_name || 'Tenant',
    landlordName: landlordProfile?.full_name || 'Landlord',
    propertyAddress: property?.address || property?.name || 'Property',
    unitLabel: unit?.unit_number ? `Unit ${unit.unit_number}` : 'Unit',
    startDate: fmtDate(lease?.start_date),
    endDate: fmtDate(renewal.new_end_date),
    monthlyRent: Number(renewal.new_monthly_rent ?? 0),
    securityDeposit: Number(lease?.security_deposit ?? 0),
    generatedDate: fmtDate(new Date().toISOString().slice(0, 10)),
  });

  return new NextResponse(new Uint8Array(pdfBuffer), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="lease-renewal-draft.pdf"`,
    },
  });
}
