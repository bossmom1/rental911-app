import { NextResponse, type NextRequest } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase';
import { sendComplianceAlertEmail } from '@/lib/email';
import { fmtDate } from '@/lib/format';
import { complianceItemLabel } from '@/lib/compliance';

/**
 * GET /api/cron/compliance-check — daily Vercel Cron job (see vercel.json).
 *
 * Flips compliance_items into expiring_soon/expired (via the
 * flip_compliance_statuses() DB function, migration 0010) and emails the
 * landlord for every item that just became expiring_soon. Idempotent: the
 * DB function's own alert_sent guard makes re-running safe if a scheduled
 * run is missed or retried.
 */

function authorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false; // fail closed if the secret itself isn't configured
  return request.headers.get('authorization') === `Bearer ${secret}`;
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  const admin = createSupabaseAdminClient();
  const { data: flipped, error } = await admin.rpc('flip_compliance_statuses');
  if (error) {
    console.error('[cron/compliance-check] flip_compliance_statuses failed:', error.message);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const rows = flipped ?? [];
  let emailed = 0;
  for (const item of rows) {
    if (!item.property_id) continue;
    const { data: property } = await admin
      .from('properties')
      .select('name, landlord:users(email)')
      .eq('id', item.property_id)
      .maybeSingle();
    const landlordEmail = (property as any)?.landlord?.email as string | undefined;
    if (!landlordEmail) continue;
    const ok = await sendComplianceAlertEmail({
      to: [landlordEmail],
      propertyName: property?.name ?? 'Your property',
      itemLabel: complianceItemLabel(item.type),
      expiryDate: fmtDate(item.expiry_date),
    });
    if (ok) emailed++;
  }

  return NextResponse.json({ ok: true, flipped: rows.length, emailed });
}
