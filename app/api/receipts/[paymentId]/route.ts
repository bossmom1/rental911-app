import { NextResponse, type NextRequest } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase';
import { getCurrentUser } from '@/lib/auth';
import { getReceiptSignedUrl } from '@/lib/receipts';

/**
 * GET /api/receipts/:paymentId — redirects to a freshly-signed URL for the
 * receipt PDF. Signed URLs expire, so dashboards link here rather than
 * embedding a signed URL directly; this generates a new one on every click.
 *
 * Access: the tenant who made the payment, the landlord who owns the lease,
 * or an admin. Uses the admin client because a tenant has no RLS path to the
 * landlord's side of the lease (mirrors app/(tenant)/tenant/rent/actions.ts).
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: { paymentId: string } }
) {
  const current = await getCurrentUser();
  if (!current || !current.profile) {
    return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  }

  const admin = createSupabaseAdminClient();
  const { data: payment } = await admin
    .from('rent_payments')
    .select('id, tenant_id, receipt_path, lease:leases(landlord_id)')
    .eq('id', params.paymentId)
    .maybeSingle();

  if (!payment || !payment.receipt_path) {
    return NextResponse.json({ error: 'Receipt not found.' }, { status: 404 });
  }

  const landlordId = (payment.lease as unknown as { landlord_id: string | null } | null)?.landlord_id;
  const role = current.profile.role;
  const authorized =
    role === 'admin' ||
    (role === 'tenant' && payment.tenant_id === current.authId) ||
    (role === 'landlord' && landlordId === current.authId);

  if (!authorized) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 403 });
  }

  const url = await getReceiptSignedUrl(payment.receipt_path);
  if (!url) {
    return NextResponse.json({ error: 'Could not generate receipt link.' }, { status: 502 });
  }

  return NextResponse.redirect(url);
}
