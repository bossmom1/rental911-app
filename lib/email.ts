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

export interface AfcWarrantyInvoiceEmailInput {
  to: string[];
  landlordName: string;
  propertyName: string;
}

/** Sent once, when a property's AFC Home Club warranty-purchase invoice is generated. */
export async function sendAfcWarrantyInvoiceEmail(
  input: AfcWarrantyInvoiceEmailInput
): Promise<boolean> {
  const resend = getResend();
  if (!resend) {
    console.warn('[email] RESEND_API_KEY not set — skipping AFC warranty invoice email');
    return false;
  }
  try {
    const { error } = await resend.emails.send({
      from: ALERTS_FROM_EMAIL,
      to: input.to,
      subject: `AFC Home Club warranty invoice — ${input.propertyName}`,
      html: `
        <p>Hi ${input.landlordName},</p>
        <p>Your AFC Home Club home warranty invoice for ${input.propertyName} has been generated. Check your AFC Home Club account for payment details.</p>
        <p>— Rental911</p>
      `,
    });
    if (error) throw new Error(error.message);
    return true;
  } catch (err) {
    console.error('[email] sendAfcWarrantyInvoiceEmail failed (non-blocking):', err);
    return false;
  }
}

export interface AfcManualClaimEmailInput {
  to: string[];
  propertyAddress: string;
  tenantName: string;
  tenantContact: string;
  landlordName: string;
  afcTier: string;
  deductible: string; // pre-formatted currency string
  issueSummary: string;
}

/**
 * Sent to admins when a tenant reports an issue on an AFC-path property,
 * while AFC's own Request Service claim form is down and this is being
 * filed manually as an interim fallback (see lib/afc.ts submitClaimInvoice).
 */
export async function sendAfcManualClaimEmail(input: AfcManualClaimEmailInput): Promise<boolean> {
  const resend = getResend();
  if (!resend) {
    console.warn('[email] RESEND_API_KEY not set — skipping AFC manual claim email');
    return false;
  }
  try {
    const { error } = await resend.emails.send({
      from: ALERTS_FROM_EMAIL,
      to: input.to,
      subject: `AFC claim needs manual filing — ${input.propertyAddress}`,
      html: `
        <p>AFC's Request Service form is currently down — please file this claim manually.</p>
        <p><strong>Property:</strong> ${input.propertyAddress}</p>
        <p><strong>Tenant:</strong> ${input.tenantName} (${input.tenantContact})</p>
        <p><strong>Landlord:</strong> ${input.landlordName}</p>
        <p><strong>AFC Plan:</strong> ${input.afcTier}</p>
        <p><strong>Deductible:</strong> ${input.deductible}</p>
        <p><strong>Issue:</strong> ${input.issueSummary}</p>
        <p>File with AFC Home Club Service: <strong>770-973-2400</strong> or <strong>service@afchomeclub.com</strong>.</p>
        <p>— Rental911</p>
      `,
    });
    if (error) throw new Error(error.message);
    return true;
  } catch (err) {
    console.error('[email] sendAfcManualClaimEmail failed (non-blocking):', err);
    return false;
  }
}

export interface MaintenanceApprovalEmailInput {
  to: string[];
  landlordName: string;
  propertyAddress: string;
  requestTitle: string;
  /** Pre-formatted threshold, e.g. "$500" */
  thresholdFormatted: string;
  /** Full URL to the landlord's maintenance detail page */
  requestUrl: string;
}

/**
 * Sent to a landlord when a tenant maintenance request exceeds their
 * authorization threshold. The landlord must approve before dispatch begins.
 */
export async function sendMaintenanceApprovalEmail(
  input: MaintenanceApprovalEmailInput
): Promise<boolean> {
  const resend = getResend();
  if (!resend) {
    console.warn('[email] RESEND_API_KEY not set — skipping maintenance approval email');
    return false;
  }
  try {
    const { error } = await resend.emails.send({
      from: ALERTS_FROM_EMAIL,
      to: input.to,
      subject: `Maintenance approval needed — ${input.propertyAddress}`,
      html: `
        <p>Hi ${input.landlordName},</p>
        <p>
          A maintenance request at <strong>${input.propertyAddress}</strong>
          requires your approval before work can begin.
        </p>
        <p><strong>Request:</strong> ${input.requestTitle}</p>
        <p>
          The estimated repair cost exceeds your authorization threshold of
          <strong>${input.thresholdFormatted}</strong>.
        </p>
        <p>
          <a href="${input.requestUrl}" style="background:#0C447C;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;display:inline-block;font-family:sans-serif;">
            View &amp; Approve Request
          </a>
        </p>
        <p>— Rental911</p>
      `,
    });
    if (error) throw new Error(error.message);
    return true;
  } catch (err) {
    console.error('[email] sendMaintenanceApprovalEmail failed (non-blocking):', err);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Employment Verification emails
// ---------------------------------------------------------------------------

export interface EmployerVerificationRequestEmailInput {
  to: string[];
  tenantName: string;
  employerContactName?: string;
  formUrl: string;
}

/**
 * Sent to the employer when an employment verification is triggered.
 * The email links directly to the public form — no login required.
 */
export async function sendEmployerVerificationRequestEmail(
  input: EmployerVerificationRequestEmailInput
): Promise<boolean> {
  const resend = getResend();
  if (!resend) {
    console.warn('[email] RESEND_API_KEY not set — skipping employer verification email');
    return false;
  }

  const greeting = input.employerContactName
    ? `Hi ${input.employerContactName},`
    : 'Hello,';

  try {
    const { error } = await resend.emails.send({
      from: ALERTS_FROM_EMAIL,
      to: input.to,
      subject: `Employment Verification Request — ${input.tenantName}`,
      html: `<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;font-family:Arial,sans-serif;background:#f0f7ff;">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td>
<table width="600" align="center" cellpadding="0" cellspacing="0"
  style="background:#fff;margin:24px auto;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.10);">
  <tr>
    <td style="background:#0C447C;padding:24px 32px;">
      <h1 style="margin:0;color:#fff;font-size:22px;font-weight:700;">
        Rental<span style="color:#EF9F27;">911</span>
      </h1>
      <p style="margin:4px 0 0;color:#B5D4F4;font-size:13px;">Employment Verification Request</p>
    </td>
  </tr>
  <tr>
    <td style="padding:32px;">
      <p style="font-size:16px;color:#222;margin:0 0 16px;">${greeting}</p>
      <p style="font-size:15px;color:#444;line-height:1.7;margin:0 0 16px;">
        A rental application is in progress for <strong>${input.tenantName}</strong>.
        As their employer, you have been asked to complete a brief employment verification form.
      </p>
      <p style="font-size:15px;color:#444;line-height:1.7;margin:0 0 28px;">
        No account or download required — the form takes less than 2 minutes to complete.
        Your information is kept confidential and used solely for rental qualification.
      </p>
      <div style="text-align:center;margin-bottom:32px;">
        <a href="${input.formUrl}"
           style="background:#0C447C;color:#fff;padding:16px 48px;border-radius:8px;
                  text-decoration:none;font-weight:700;font-size:16px;display:inline-block;">
          Complete Employment Verification →
        </a>
      </div>
      <p style="font-size:13px;color:#888;border-top:1px solid #eee;padding-top:16px;margin:0;">
        This link expires in 14 days. If you have questions, contact
        <a href="mailto:info@rental911.net" style="color:#0C447C;">info@rental911.net</a>
      </p>
    </td>
  </tr>
  <tr>
    <td style="padding:16px 32px;background:#f8f8f8;text-align:center;font-size:12px;color:#aaa;">
      Rental911 &nbsp;|&nbsp; rental911.net &nbsp;|&nbsp; Licensed Maryland Realtor — Samson Properties
    </td>
  </tr>
</table>
</td></tr></table>
</body>
</html>`,
    });
    if (error) throw new Error(error.message);
    return true;
  } catch (err) {
    console.error('[email] sendEmployerVerificationRequestEmail failed (non-blocking):', err);
    return false;
  }
}

export interface EmployerVerificationSummaryEmailInput {
  to: string[];
  landlordName: string;
  tenantName: string;
  employerLabel: string; // company name or email fallback
  employerContactName?: string;
  jobTitle: string;
  employmentStatus: string;
  monthlyGrossIncome: number;
  viewUrl: string;
}

/**
 * Sent to the landlord once the employer submits the employment verification form.
 * Rental911 does NOT act on the information — it's the landlord's responsibility.
 */
export async function sendEmployerVerificationSummaryEmail(
  input: EmployerVerificationSummaryEmailInput
): Promise<boolean> {
  const resend = getResend();
  if (!resend) {
    console.warn('[email] RESEND_API_KEY not set — skipping verification summary email');
    return false;
  }

  const statusLabel = input.employmentStatus.replace(/_/g, ' ');
  const incomeFormatted = `$${Number(input.monthlyGrossIncome).toLocaleString('en-US')}`;

  try {
    const { error } = await resend.emails.send({
      from: ALERTS_FROM_EMAIL,
      to: input.to,
      subject: `Employment Verification Filed — ${input.tenantName}`,
      html: `<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;font-family:Arial,sans-serif;background:#f0f7ff;">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td>
<table width="600" align="center" cellpadding="0" cellspacing="0"
  style="background:#fff;margin:24px auto;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.10);">
  <tr>
    <td style="background:#0C447C;padding:24px 32px;">
      <h1 style="margin:0;color:#fff;font-size:22px;font-weight:700;">
        Rental<span style="color:#EF9F27;">911</span>
      </h1>
      <p style="margin:4px 0 0;color:#B5D4F4;font-size:13px;">Employment Verification Complete</p>
    </td>
  </tr>
  <tr>
    <td style="padding:32px;">
      <p style="font-size:16px;color:#222;margin:0 0 16px;">Hi ${input.landlordName},</p>
      <p style="font-size:15px;color:#444;line-height:1.7;margin:0 0 20px;">
        The employer for <strong>${input.tenantName}</strong> has completed and submitted
        their employment verification. A copy has been filed in both your portal and
        your tenant's portal.
      </p>

      <table width="100%" cellpadding="0" cellspacing="0"
        style="background:#EBF3FF;border-radius:8px;padding:20px;margin-bottom:24px;">
        <tr><td style="padding:6px 0;font-size:14px;color:#333;">
          <strong style="color:#0C447C;">Employer:</strong> ${input.employerLabel}${input.employerContactName ? ` (${input.employerContactName})` : ''}
        </td></tr>
        <tr><td style="padding:6px 0;font-size:14px;color:#333;">
          <strong style="color:#0C447C;">Job Title:</strong> ${input.jobTitle}
        </td></tr>
        <tr><td style="padding:6px 0;font-size:14px;color:#333;">
          <strong style="color:#0C447C;">Employment Status:</strong> <span style="text-transform:capitalize;">${statusLabel}</span>
        </td></tr>
        <tr><td style="padding:6px 0;font-size:14px;color:#333;">
          <strong style="color:#0C447C;">Monthly Gross Income:</strong> ${incomeFormatted}
        </td></tr>
      </table>

      <p style="font-size:14px;color:#888;margin:0 0 24px;line-height:1.6;">
        Rental911 collects and files this information only. Acting on the verification
        is your responsibility as the landlord.
      </p>

      <div style="text-align:center;margin-bottom:32px;">
        <a href="${input.viewUrl}"
           style="background:#0C447C;color:#fff;padding:14px 40px;border-radius:8px;
                  text-decoration:none;font-weight:700;font-size:15px;display:inline-block;">
          View Full Response →
        </a>
      </div>

      <p style="font-size:13px;color:#888;border-top:1px solid #eee;padding-top:16px;margin:0;">
        Questions? Contact us at
        <a href="mailto:info@rental911.net" style="color:#0C447C;">info@rental911.net</a>
      </p>
    </td>
  </tr>
  <tr>
    <td style="padding:16px 32px;background:#f8f8f8;text-align:center;font-size:12px;color:#aaa;">
      Rental911 &nbsp;|&nbsp; rental911.net &nbsp;|&nbsp; Licensed Maryland Realtor — Samson Properties
    </td>
  </tr>
</table>
</td></tr></table>
</body>
</html>`,
    });
    if (error) throw new Error(error.message);
    return true;
  } catch (err) {
    console.error('[email] sendEmployerVerificationSummaryEmail failed (non-blocking):', err);
    return false;
  }
}
