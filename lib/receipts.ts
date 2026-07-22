import { createSupabaseAdminClient } from '@/lib/supabase';
import { renderReceiptPdf, type ReceiptData } from '@/lib/receipt-pdf';
import { sendReceiptEmail } from '@/lib/email';

const RECEIPTS_BUCKET = 'receipts';
const SIGNED_URL_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days — long enough for an emailed link to still work

function confirmationNumberFor(paymentId: string, paymentIntentId: string | null): string {
  return (paymentIntentId || paymentId).replace(/[^a-zA-Z0-9]/g, '').slice(-8).toUpperCase();
}

function formatUnitAddress(property: { address: string | null; city: string | null; state: string | null; zip: string | null } | null, unitNumber: string | null): string {
  if (!property) return 'Address unavailable';
  const line = [property.address, unitNumber ? `Unit ${unitNumber}` : null].filter(Boolean).join(', ');
  const cityLine = [property.city, [property.state, property.zip].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  return [line, cityLine].filter(Boolean).join(', ');
}

/**
 * Builds and stores the receipt PDF for a payment, then emails it to the
 * tenant and landlord. Called from the webhook after a payment_intent.succeeded
 * event is recorded as 'paid'. Best-effort: errors are logged, never thrown —
 * a receipt failure must not cause Stripe to retry the whole webhook delivery,
 * since the payment record itself already succeeded.
 */
export async function generateAndSendReceipt(paymentId: string): Promise<void> {
  const admin = createSupabaseAdminClient();

  try {
    const { data: payment, error: paymentErr } = await admin
      .from('rent_payments')
      .select('id, lease_id, tenant_id, amount, late_fee_amount, surcharge_amount, total_charged, payment_method, paid_date, stripe_payment_intent_id, receipt_path')
      .eq('id', paymentId)
      .single();
    if (paymentErr || !payment) throw new Error(paymentErr?.message || 'payment not found');
    if (payment.receipt_path) {
      // Already generated — Stripe redelivered this event. Don't re-email.
      return;
    }
    if (!payment.lease_id || !payment.payment_method) {
      console.warn('[receipts] payment missing lease_id/payment_method, skipping:', paymentId);
      return;
    }

    const { data: lease, error: leaseErr } = await admin
      .from('leases')
      .select('id, landlord_id, unit_id')
      .eq('id', payment.lease_id)
      .single();
    if (leaseErr || !lease) throw new Error(leaseErr?.message || 'lease not found');

    let unitNumber: string | null = null;
    let property: { address: string | null; city: string | null; state: string | null; zip: string | null } | null = null;
    if (lease.unit_id) {
      const { data: unit } = await admin
        .from('units')
        .select('unit_number, property_id')
        .eq('id', lease.unit_id)
        .maybeSingle();
      unitNumber = unit?.unit_number ?? null;
      if (unit?.property_id) {
        const { data: prop } = await admin
          .from('properties')
          .select('address, city, state, zip')
          .eq('id', unit.property_id)
          .maybeSingle();
        property = prop ?? null;
      }
    }

    const { data: tenant } = await admin
      .from('users')
      .select('full_name, email')
      .eq('id', payment.tenant_id)
      .maybeSingle();

    const { data: landlord } = lease.landlord_id
      ? await admin.from('users').select('full_name, email').eq('id', lease.landlord_id).maybeSingle()
      : { data: null };

    const confirmationNumber = confirmationNumberFor(payment.id, payment.stripe_payment_intent_id);
    const paidDate = payment.paid_date
      ? new Date(payment.paid_date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
      : new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

    const receiptData: ReceiptData = {
      confirmationNumber,
      tenantName: tenant?.full_name || 'Tenant',
      unitAddress: formatUnitAddress(property, unitNumber),
      paidDate,
      paymentMethod: payment.payment_method as ReceiptData['paymentMethod'],
      rentAmount: Number(payment.amount ?? 0),
      lateFeeAmount: Number(payment.late_fee_amount ?? 0),
      surchargeAmount: Number(payment.surcharge_amount ?? 0),
      totalCharged: Number(payment.total_charged ?? payment.amount ?? 0),
      landlordName: landlord?.full_name || 'your landlord',
    };

    const pdfBuffer = await renderReceiptPdf(receiptData);
    const path = `${payment.lease_id}/${payment.id}.pdf`;

    const { error: uploadErr } = await admin.storage
      .from(RECEIPTS_BUCKET)
      .upload(path, pdfBuffer, { contentType: 'application/pdf', upsert: true });
    if (uploadErr) throw new Error(`storage upload failed: ${uploadErr.message}`);

    const { error: updateErr } = await admin
      .from('rent_payments')
      .update({ receipt_path: path })
      .eq('id', paymentId);
    if (updateErr) throw new Error(`receipt_path update failed: ${updateErr.message}`);

    const recipients = [tenant?.email, landlord?.email].filter((e): e is string => Boolean(e));
    if (recipients.length > 0) {
      await sendReceiptEmail({
        to: recipients,
        tenantName: receiptData.tenantName,
        confirmationNumber,
        totalCharged: receiptData.totalCharged.toLocaleString('en-US', { style: 'currency', currency: 'USD' }),
        pdfBuffer,
        pdfFileName: `receipt-${confirmationNumber}.pdf`,
      });
    }
  } catch (err) {
    console.error('[receipts] generateAndSendReceipt failed (non-blocking):', err);
  }
}

/** Fresh signed URL for viewing/downloading a stored receipt (path from rent_payments.receipt_path). */
export async function getReceiptSignedUrl(path: string): Promise<string | null> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.storage
    .from(RECEIPTS_BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
  if (error) {
    console.error('[receipts] createSignedUrl failed:', error.message);
    return null;
  }
  return data.signedUrl;
}
