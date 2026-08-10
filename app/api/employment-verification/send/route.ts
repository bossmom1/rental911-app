import { NextResponse, type NextRequest } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { sendEmploymentVerification } from '@/lib/employment-verification';

/**
 * POST /api/employment-verification/send
 *
 * Creates an employment_verifications row and emails the employer form link.
 * Requires admin or landlord role.
 *
 * Body: {
 *   tenant_id: string,
 *   landlord_id: string,
 *   property_id: string,
 *   employer_email: string,
 *   employer_name?: string,
 *   employer_contact_name?: string,
 * }
 */
export async function POST(request: NextRequest) {
  const current = await getCurrentUser();
  const role = current?.profile?.role;
  if (!role || !['admin', 'landlord'].includes(role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  type Body = {
    tenant_id?: string;
    landlord_id?: string;
    property_id?: string;
    employer_email?: string;
    employer_name?: string;
    employer_contact_name?: string;
  };

  const body = (await request.json()) as Body;
  const { tenant_id, landlord_id, property_id, employer_email, employer_name, employer_contact_name } =
    body;

  if (!tenant_id || !landlord_id || !property_id || !employer_email) {
    return NextResponse.json(
      { error: 'tenant_id, landlord_id, property_id, and employer_email are required' },
      { status: 400 }
    );
  }

  const result = await sendEmploymentVerification({
    tenantId: tenant_id,
    landlordId: landlord_id,
    propertyId: property_id,
    employerEmail: employer_email,
    employerName: employer_name ?? null,
    employerContactName: employer_contact_name ?? null,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  return NextResponse.json({ verificationId: result.verificationId });
}
