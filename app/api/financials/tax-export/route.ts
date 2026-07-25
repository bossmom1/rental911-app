import { cookies } from 'next/headers';
import { NextResponse, type NextRequest } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase';
import { getCurrentUser } from '@/lib/auth';
import { fetchPaymentRows } from '@/lib/financials';
import { debitCardFeeCents } from '@/lib/stripe';
import { toCsv } from '@/lib/csv';

/**
 * GET /api/financials/tax-export?start=YYYY-MM-DD&end=YYYY-MM-DD
 *
 * Year-end tax CSV export. One route serves both audiences: RLS already
 * scopes rent_payments to "own properties only" for a landlord and "all
 * properties" for an admin (see fetchPaymentRows), so a landlord hitting
 * this from /landlord/financials/export and an admin hitting it from
 * /admin/financials get correctly-scoped data from the same query — no
 * platform-fee column/totals for either audience (Rental911 takes no cut).
 *
 * Debit Card Processing Fee is its own column (same math as lib/pnl.ts) —
 * it's a real landlord-side cost (Stripe's fee, unrecovered since debit
 * carries no tenant surcharge), distinct from and not to be confused with a
 * platform fee. Net Payout = Amount − Debit Card Processing Fee.
 */
const methodLabels: Record<string, string> = {
  ach: 'Bank transfer (ACH)',
  card_credit: 'Credit card',
  card_debit: 'Debit card',
};

export async function GET(request: NextRequest) {
  const current = await getCurrentUser();
  if (!current?.profile || (current.profile.role !== 'landlord' && current.profile.role !== 'admin')) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 403 });
  }

  const now = new Date();
  const defaultStart = `${now.getUTCFullYear()}-01-01`;
  const defaultEnd = `${now.getUTCFullYear()}-12-31`;
  const start = request.nextUrl.searchParams.get('start') || defaultStart;
  const end = request.nextUrl.searchParams.get('end') || defaultEnd;

  const supabase = createSupabaseServerClient(cookies());
  const rows = await fetchPaymentRows(supabase);

  const inRange = rows.filter(
    (r) => r.status === 'paid' && r.paid_date && r.paid_date >= start && r.paid_date <= end
  );

  const csv = toCsv(
    inRange.map((r) => {
      const amount = Number(r.amount ?? 0);
      const debitFee =
        r.payment_method === 'card_debit' ? debitCardFeeCents(Math.round(amount * 100)) / 100 : 0;
      return {
        property_address: r.property_address ?? r.property_name ?? '',
        unit: r.unit_number ?? '',
        tenant_name: r.tenant_name ?? '',
        payment_date: r.paid_date ?? '',
        amount: amount.toFixed(2),
        payment_method: methodLabels[r.payment_method ?? ''] ?? r.payment_method ?? '',
        debit_card_processing_fee: debitFee.toFixed(2),
        net_payout: (amount - debitFee).toFixed(2),
        stripe_reference_id: r.stripe_payment_intent_id ?? '',
      };
    }),
    [
      { key: 'property_address', label: 'Property Address' },
      { key: 'unit', label: 'Unit' },
      { key: 'tenant_name', label: 'Tenant Name' },
      { key: 'payment_date', label: 'Payment Date' },
      { key: 'amount', label: 'Amount' },
      { key: 'payment_method', label: 'Payment Method' },
      { key: 'debit_card_processing_fee', label: 'Debit Card Processing Fee' },
      { key: 'net_payout', label: 'Net Payout' },
      { key: 'stripe_reference_id', label: 'Stripe Reference ID' },
    ]
  );

  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="rental911-tax-export-${start}-to-${end}.csv"`,
    },
  });
}
