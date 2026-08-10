import { NextResponse, type NextRequest } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase';
import { sendEmployerVerificationSummaryEmail } from '@/lib/email';
import type { EmploymentVerificationResponse } from '@/types/database';

/**
 * POST /api/employment-verification/complete
 *
 * Public (unauthenticated) — the token is the auth mechanism.
 * Called by the employer form client on submit.
 *
 * Body: { token: string, response: EmploymentVerificationResponse }
 *
 * On success:
 *  1. Marks the record completed + saves the JSONB response.
 *  2. Creates a document record for both tenant portal and landlord portal.
 *  3. Emails the landlord a summary.
 */

const BASE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.startsWith('http://localhost')
    ? 'https://portal.rental911.net'
    : (process.env.NEXT_PUBLIC_SITE_URL ?? 'https://portal.rental911.net');

type JoinedUser = { full_name: string | null; email: string } | null;

export async function POST(request: NextRequest) {
  type Body = {
    token?: string;
    response?: EmploymentVerificationResponse;
  };

  const body = (await request.json()) as Body;
  const { token, response: formResponse } = body;

  if (!token || !formResponse) {
    return NextResponse.json({ error: 'token and response are required' }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();

  // Load the record (admin client bypasses RLS — token is the auth)
  const { data: record } = await admin
    .from('employment_verifications')
    .select(
      '*, tenant:users!employment_verifications_tenant_id_fkey(full_name, email), landlord:users!employment_verifications_landlord_id_fkey(full_name, email)'
    )
    .eq('token', token)
    .maybeSingle();

  if (!record) {
    return NextResponse.json({ error: 'Verification not found' }, { status: 404 });
  }
  if (record.status === 'completed') {
    return NextResponse.json({ error: 'Already completed' }, { status: 409 });
  }
  if (record.status === 'expired' || new Date(record.token_expires_at) < new Date()) {
    return NextResponse.json({ error: 'This link has expired' }, { status: 410 });
  }

  const formUrl = `${BASE_URL}/verify-employment/${token}`;
  const employerLabel = record.employer_name ?? record.employer_email;
  const fileName = `Employment Verification — ${employerLabel}`;

  // File document in tenant portal
  let tenantDocId: string | null = null;
  if (record.tenant_id) {
    const { data: tenantDoc } = await admin
      .from('documents')
      .insert({
        owner_id: record.tenant_id,
        type: 'income_verification',
        file_url: formUrl,
        file_name: fileName,
        uploaded_by_role: 'admin',
      })
      .select('id')
      .single();
    tenantDocId = tenantDoc?.id ?? null;
  }

  // File document in landlord portal
  let landlordDocId: string | null = null;
  if (record.landlord_id) {
    const { data: landlordDoc } = await admin
      .from('documents')
      .insert({
        owner_id: record.landlord_id,
        type: 'income_verification',
        file_url: formUrl,
        file_name: fileName,
        uploaded_by_role: 'admin',
      })
      .select('id')
      .single();
    landlordDocId = landlordDoc?.id ?? null;
  }

  // Mark completed
  await admin
    .from('employment_verifications')
    .update({
      status: 'completed',
      completed_at: new Date().toISOString(),
      response: formResponse,
      tenant_document_id: tenantDocId,
      landlord_document_id: landlordDocId,
    })
    .eq('token', token);

  // Email landlord a summary (non-blocking)
  const landlord = (record as unknown as { landlord: JoinedUser }).landlord;
  const tenant = (record as unknown as { tenant: JoinedUser }).tenant;

  if (landlord?.email) {
    await sendEmployerVerificationSummaryEmail({
      to: [landlord.email],
      landlordName: landlord.full_name ?? landlord.email,
      tenantName: tenant?.full_name ?? tenant?.email ?? 'Your tenant',
      employerLabel,
      employerContactName: record.employer_contact_name ?? undefined,
      jobTitle: formResponse.job_title,
      employmentStatus: formResponse.employment_status,
      monthlyGrossIncome: formResponse.monthly_gross_income,
      viewUrl: formUrl,
    }).catch((err: unknown) =>
      console.error('[ev/complete] Summary email failed (non-blocking):', err)
    );
  }

  return NextResponse.json({ ok: true });
}
