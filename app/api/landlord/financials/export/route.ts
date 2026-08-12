/**
 * GET /api/landlord/financials/export?landlordId=...&year=...
 * Streams a CSV of all rent payments for the landlord in the given year.
 * Admin version: omit landlordId or pass landlordId=all to get all landlords.
 */

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createSupabaseServerClient } from '@/lib/supabase';
import { getCurrentUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

function csvRow(values: (string | number | null | undefined)[]): string {
  return (
    values
      .map((v) => {
        const s = v == null ? '' : String(v);
        // Quote fields containing commas, quotes, or newlines
        if (s.includes(',') || s.includes('"') || s.includes('\n')) {
          return `"${s.replace(/"/g, '""')}"`;
        }
        return s;
      })
      .join(',') + '\r\n'
  );
}

export async function GET(request: Request) {
  const current = await getCurrentUser();
  if (!current) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(request.url);
  const requestedLandlordId = url.searchParams.get('landlordId');
  const year = Number(url.searchParams.get('year') || new Date().getFullYear());

  const supabase = createSupabaseServerClient(cookies());
  const isAdmin = current.profile?.role === 'admin';

  // Non-admins can only export their own data
  const landlordId =
    isAdmin && requestedLandlordId && requestedLandlordId !== 'all'
      ? requestedLandlordId
      : isAdmin && requestedLandlordId === 'all'
      ? null // all landlords
      : current.authId;

  const rangeStart = `${year}-01-01`;
  const rangeEnd = `${year}-12-31`;

  let query = supabase
    .from('rent_payments')
    .select(`
      id, amount, status, due_date, paid_date, payment_method,
      stripe_payment_intent_id, stripe_transfer_id,
      lease:leases!inner (
        landlord_id, monthly_rent,
        unit:units (unit_number, property:properties (name, address)),
        tenant:users!leases_tenant_id_fkey (full_name)
      )
    `)
    .gte('due_date', rangeStart)
    .lte('due_date', rangeEnd)
    .eq('status', 'paid')
    .order('paid_date', { ascending: true });

  if (landlordId) {
    // @ts-ignore – PostgREST nested filter
    query = query.eq('lease.landlord_id', landlordId);
  } else if (!isAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { data: payments, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Build CSV
  const header = csvRow([
    'Property Address',
    'Unit',
    'Tenant Name',
    'Payment Date',
    'Amount',
    'Payment Method',
    'Net Payout',
    'Stripe Payment Intent ID',
    'Stripe Transfer ID',
  ]);

  const rows = (payments ?? []).map((p) => {
    const lease = p.lease as any;
    const unit = lease?.unit as any;
    const prop = unit?.property as any;
    const tenant = lease?.tenant as any;
    const amount = Number(p.amount ?? 0);

    return csvRow([
      prop?.address ?? prop?.name ?? '',
      unit?.unit_number ?? '',
      tenant?.full_name ?? '',
      p.paid_date ?? p.due_date ?? '',
      amount.toFixed(2),
      p.payment_method ?? '',
      amount.toFixed(2), // Net = amount; no platform fee deducted
      p.stripe_payment_intent_id ?? '',
      p.stripe_transfer_id ?? '',
    ]);
  });

  const csv = header + rows.join('');

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="rental911-tax-export-${year}.csv"`,
    },
  });
}
