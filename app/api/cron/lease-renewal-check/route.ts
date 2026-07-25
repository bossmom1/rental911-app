import { NextResponse, type NextRequest } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase';
import { sendLeaseRenewalAlertEmail } from '@/lib/email';
import { fmtDate } from '@/lib/format';

/**
 * GET /api/cron/lease-renewal-check — daily Vercel Cron job (see vercel.json).
 *
 * Emails the landlord 60 days before an active lease's end_date, once per
 * lease (renewal_alert_sent guards against duplicates — set to true after
 * processing regardless of email send success, matching this app's
 * non-blocking email philosophy, see lib/email.ts).
 */

function authorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false; // fail closed if the secret itself isn't configured
  return request.headers.get('authorization') === `Bearer ${secret}`;
}

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  const admin = createSupabaseAdminClient();
  const now = new Date();
  const todayStr = toDateStr(now);
  const cutoffStr = toDateStr(new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000));

  const { data, error } = await admin
    .from('leases')
    .select(
      `id, end_date,
       tenant:users!leases_tenant_id_fkey(full_name),
       landlord:users!leases_landlord_id_fkey(email),
       unit:units(unit_number, property:properties(name, address))`
    )
    .eq('status', 'active')
    .eq('renewal_alert_sent', false)
    .lte('end_date', cutoffStr)
    .gt('end_date', todayStr);

  if (error) {
    console.error('[cron/lease-renewal-check] query failed:', error.message);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const rows = (data ?? []) as any[];
  let emailed = 0;
  for (const lease of rows) {
    const landlordEmail = lease.landlord?.email as string | undefined;
    const property = lease.unit?.property;
    const unitLabel =
      [property?.name || property?.address, lease.unit?.unit_number ? `Unit ${lease.unit.unit_number}` : null]
        .filter(Boolean)
        .join(', ') || 'your property';

    if (landlordEmail) {
      const ok = await sendLeaseRenewalAlertEmail({
        to: [landlordEmail],
        tenantName: lease.tenant?.full_name ?? 'Your tenant',
        unitLabel,
        endDate: fmtDate(lease.end_date),
      });
      if (ok) emailed++;
    }

    await admin.from('leases').update({ renewal_alert_sent: true }).eq('id', lease.id);
  }

  return NextResponse.json({ ok: true, matched: rows.length, emailed });
}
