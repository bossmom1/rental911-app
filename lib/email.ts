import { Resend } from 'resend';

/**
 * Transactional email (Resend). Currently used only for rent receipts.
 * Non-blocking by design: a failed send is logged but never breaks the
 * webhook that triggered it — the payment record itself is the source of
 * truth, and a receipt can be re-sent later.
 */

let _resend: Resend | null = null;

function getResend(): Resend | null {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  if (!_resend) _resend = new Resend(key);
  return _resend;
}

export const RECEIPT_FROM_EMAIL =
  process.env.RECEIPT_FROM_EMAIL || 'receipts@rental911.net';

export interface ReceiptEmailInput {
  to: string[];
  tenantName: string;
  confirmationNumber: string;
  totalCharged: string; // pre-formatted currency string
  pdfBuffer: Buffer;
  pdfFileName: string;
}

/** Sends the receipt PDF to one or more recipients. Returns true on success. */
export async function sendReceiptEmail(input: ReceiptEmailInput): Promise<boolean> {
  const resend = getResend();
  if (!resend) {
    console.warn('[email] RESEND_API_KEY not set — skipping receipt email');
    return false;
  }

  try {
    const { error } = await resend.emails.send({
      from: RECEIPT_FROM_EMAIL,
      to: input.to,
      subject: `Rent payment receipt — ${input.totalCharged} (#${input.confirmationNumber})`,
      html: `
        <p>Hi,</p>
        <p>This confirms a rent payment of <strong>${input.totalCharged}</strong> from ${input.tenantName}.</p>
        <p>Confirmation number: <strong>${input.confirmationNumber}</strong></p>
        <p>The full receipt is attached as a PDF.</p>
        <p>— Rental911</p>
      `,
      attachments: [
        {
          filename: input.pdfFileName,
          content: input.pdfBuffer,
        },
      ],
    });
    if (error) throw new Error(error.message);
    return true;
  } catch (err) {
    console.error('[email] sendReceiptEmail failed (non-blocking):', err);
    return false;
  }
}

export const ALERTS_FROM_EMAIL =
  process.env.ALERTS_FROM_EMAIL || 'alerts@rental911.net';

export interface ComplianceAlertEmailInput {
  to: string[];
  propertyName: string;
  itemLabel: string; // human-readable compliance item type, e.g. "Rental License"
  expiryDate: string; // pre-formatted date string
}

/** Sent by the daily compliance cron when an item flips to expiring_soon. */
export async function sendComplianceAlertEmail(
  input: ComplianceAlertEmailInput
): Promise<boolean> {
  const resend = getResend();
  if (!resend) {
    console.warn('[email] RESEND_API_KEY not set — skipping compliance alert email');
    return false;
  }
  try {
    const { error } = await resend.emails.send({
      from: ALERTS_FROM_EMAIL,
      to: input.to,
      subject: `${input.propertyName} — ${input.itemLabel} expires soon`,
      html: `
        <p>${input.propertyName} — Your ${input.itemLabel} expires on ${input.expiryDate}.</p>
        <p>Upload your renewal now to stay compliant.</p>
        <p>— Rental911</p>
      `,
    });
    if (error) throw new Error(error.message);
    return true;
  } catch (err) {
    console.error('[email] sendComplianceAlertEmail failed (non-blocking):', err);
    return false;
  }
}

export interface LeaseRenewalAlertEmailInput {
  to: string[];
  tenantName: string;
  unitLabel: string; // e.g. "123 Main St, Unit 2"
  endDate: string; // pre-formatted date string
}

/** Sent by the daily lease-renewal cron 60 days before a lease's end_date. */
export async function sendLeaseRenewalAlertEmail(
  input: LeaseRenewalAlertEmailInput
): Promise<boolean> {
  const resend = getResend();
  if (!resend) {
    console.warn('[email] RESEND_API_KEY not set — skipping lease renewal alert email');
    return false;
  }
  try {
    const { error } = await resend.emails.send({
      from: ALERTS_FROM_EMAIL,
      to: input.to,
      subject: `Lease ending soon — ${input.unitLabel}`,
      html: `
        <p>Heads up — ${input.tenantName}'s lease at ${input.unitLabel} ends on ${input.endDate}.</p>
        <p>Time to decide: renew, go month-to-month, or begin turnover.</p>
        <p>— Rental911</p>
      `,
    });
    if (error) throw new Error(error.message);
    return true;
  } catch (err) {
    console.error('[email] sendLeaseRenewalAlertEmail failed (non-blocking):', err);
    return false;
  }
}
