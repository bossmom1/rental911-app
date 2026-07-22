import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';

/** Shared shape for a rent_payments row joined down to its property, plus the tenant name. */
export interface PaymentRow {
  id: string;
  amount: number | null;
  late_fee_amount: number | null;
  surcharge_amount: number | null;
  total_charged: number | null;
  status: string | null;
  paid_date: string | null;
  due_date: string | null;
  payment_method: string | null;
  receipt_path: string | null;
  tenant_id: string | null;
  tenant_name: string | null;
  lease_id: string | null;
  landlord_id: string | null;
  unit_number: string | null;
  property_id: string | null;
  property_name: string | null;
  property_address: string | null;
}

const SELECT = `
  id, amount, late_fee_amount, surcharge_amount, total_charged, status, paid_date, due_date, payment_method, receipt_path, tenant_id, lease_id,
  tenant:users!rent_payments_tenant_id_fkey ( full_name ),
  lease:leases (
    id, landlord_id, unit_id,
    unit:units (
      id, unit_number, property_id,
      property:properties ( id, name, address )
    )
  )
`;

/** Flattens the nested Supabase embed response into a flat row shape. */
function flatten(raw: any): PaymentRow {
  const lease = raw.lease ?? null;
  const unit = lease?.unit ?? null;
  const property = unit?.property ?? null;
  return {
    id: raw.id,
    amount: raw.amount,
    late_fee_amount: raw.late_fee_amount,
    surcharge_amount: raw.surcharge_amount,
    total_charged: raw.total_charged,
    status: raw.status,
    paid_date: raw.paid_date,
    due_date: raw.due_date,
    payment_method: raw.payment_method,
    receipt_path: raw.receipt_path,
    tenant_id: raw.tenant_id,
    tenant_name: raw.tenant?.full_name ?? null,
    lease_id: raw.lease_id,
    landlord_id: lease?.landlord_id ?? null,
    unit_number: unit?.unit_number ?? null,
    property_id: property?.id ?? null,
    property_name: property?.name ?? null,
    property_address: property?.address ?? null,
  };
}

/** All rent_payments visible to the caller (RLS-scoped — admin sees all, landlord sees their own). */
export async function fetchPaymentRows(
  supabase: SupabaseClient<Database>
): Promise<PaymentRow[]> {
  const { data, error } = await supabase.from('rent_payments').select(SELECT);
  if (error) {
    console.error('[financials] fetchPaymentRows failed:', error.message);
    return [];
  }
  return (data ?? []).map(flatten);
}

export function isThisMonth(dateStr: string | null): boolean {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  const now = new Date();
  return d.getUTCFullYear() === now.getUTCFullYear() && d.getUTCMonth() === now.getUTCMonth();
}

export const LATE_STATUSES = ['late', 'failed'];
export const OUTSTANDING_STATUSES = ['pending', 'late', 'failed'];

export function sumAmount(rows: PaymentRow[]): number {
  return rows.reduce((s, r) => s + Number(r.amount ?? 0), 0);
}

export function sumLateFees(rows: PaymentRow[]): number {
  return rows.reduce((s, r) => s + Number(r.late_fee_amount ?? 0), 0);
}
