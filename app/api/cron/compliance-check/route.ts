/**
 * GET /api/cron/compliance-check
 * Run daily via Vercel Cron (vercel.json crons entry).
 * - Flags compliance items expiring within 30 days → emails landlord
 * - Flags expired items
 * - Fires lease renewal alerts 60 days before end_date (once per lease)
 */

import { NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase';
import { complianceTypeLabel } from '@/lib/compliance';
import { sendComplianceAlertEmail, sendLeaseRenewalAlertEmail } from '@/lib/email-compliance';

export const dynamic = 'force-dynamic';

/** Vercel Cron auth — verify the secret header Vercel injects. */
function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true; // dev: allow without secret
  return request.headers.get('authorization') === `Bearer ${secret}`;
}

export async function GET(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createSupabaseAdminClient();
  const today = new Date().toISOString().slice(0, 10);
  const in30 = new Date();
  in30.setDate(in30.getDate() + 30);
  const in30str = in30.toISOString().slice(0, 10);

  const in60 = new Date();
  in60.setDate(in60.getDate() + 60);
  const in60str = in60.toISOString().slice(0, 10);

  let complianceAlerted = 0;
  let complianceExpired = 0;
  let renewalAlerts = 0;

  // ---- 1. Mark items expiring within 30 days + send alert ----------------
  const { data: expiringSoon } = await supabase
    .from('compliance_items')
    .select(`
      id, type, expiry_date,
      property:properties (
        id, name, address,
        landlord:users!properties_landlord_id_fkey (id, email, full_name)
      )
    `)
    .gte('expiry_date', today)
    .lte('expiry_date', in30str)
    .eq('status', 'current')
    .eq('alert_sent', false);

  for (const item of expiringSoon ?? []) {
    const prop = item.property as any;
    const landlord = prop?.landlord as any;

    if (landlord?.email) {
      await sendComplianceAlertEmail({
        to: landlord.email,
        landlordName: landlord.full_name ?? 'Landlord',
        propertyName: prop?.name || prop?.address || 'your property',
        itemType: complianceTypeLabel(item.type ?? ''),
        expiryDate: item.expiry_date!,
      });
    }

    await supabase
      .from('compliance_items')
      .update({ status: 'expiring_soon', alert_sent: true })
      .eq('id', item.id);

    complianceAlerted++;
  }

  // ---- 2. Mark expired items -------------------------------------------
  const { data: nowExpired } = await supabase
    .from('compliance_items')
    .select('id')
    .lt('expiry_date', today)
    .not('status', 'in', '("expired","not_applicable")');

  if (nowExpired?.length) {
    await supabase
      .from('compliance_items')
      .update({ status: 'expired' })
      .in('id', nowExpired.map((r) => r.id));
    complianceExpired = nowExpired.length;
  }

  // ---- 3. Lease renewal alerts (60 days before end_date) ---------------
  const { data: expiringLeases } = await supabase
    .from('leases')
    .select(`
      id, end_date, monthly_rent,
      landlord:users!leases_landlord_id_fkey (id, email, full_name),
      tenant:users!leases_tenant_id_fkey (full_name),
      unit:units (unit_number, property:properties (name, address))
    `)
    .eq('status', 'active')
    .eq('renewal_alert_sent', false)
    .eq('is_month_to_month', false)
    .gte('end_date', today)
    .lte('end_date', in60str);

  for (const lease of expiringLeases ?? []) {
    const landlord = lease.landlord as any;
    const tenant = lease.tenant as any;
    const unit = lease.unit as any;
    const prop = unit?.property as any;

    if (landlord?.email) {
      await sendLeaseRenewalAlertEmail({
        to: landlord.email,
        landlordName: landlord.full_name ?? 'Landlord',
        tenantName: tenant?.full_name ?? 'Your tenant',
        unitNumber: unit?.unit_number ?? '',
        propertyName: prop?.name || prop?.address || 'your property',
        endDate: lease.end_date!,
        renewalUrl: `${process.env.NEXT_PUBLIC_BASE_URL}/landlord/renewals`,
      });
    }

    await supabase
      .from('leases')
      .update({ renewal_alert_sent: true })
      .eq('id', lease.id);

    renewalAlerts++;
  }

  console.log(
    `[compliance-cron] alerted=${complianceAlerted} expired=${complianceExpired} renewals=${renewalAlerts}`
  );

  return NextResponse.json({
    ok: true,
    complianceAlerted,
    complianceExpired,
    renewalAlerts,
    runAt: new Date().toISOString(),
  });
}
