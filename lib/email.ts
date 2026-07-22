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
