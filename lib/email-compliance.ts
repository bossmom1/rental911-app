/**
 * lib/email-compliance.ts
 * Compliance alert + lease renewal alert emails via Resend.
 * Non-throwing — logs on failure so the cron always returns 200.
 */

import { Resend } from 'resend';

let _resend: Resend | null = null;
function getResend(): Resend | null {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  if (!_resend) _resend = new Resend(key);
  return _resend;
}

const FROM = process.env.RECEIPT_FROM_EMAIL || 'noreply@rental911.net';

// ---------------------------------------------------------------------------

export interface ComplianceAlertInput {
  to: string;
  landlordName: string;
  propertyName: string;
  itemType: string;
  expiryDate: string; // YYYY-MM-DD
}

export async function sendComplianceAlertEmail(input: ComplianceAlertInput): Promise<void> {
  const resend = getResend();
  if (!resend) {
    console.warn('[email-compliance] RESEND_API_KEY not set — skipping compliance alert');
    return;
  }

  const expiry = new Date(input.expiryDate + 'T00:00:00').toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  try {
    await resend.emails.send({
      from: FROM,
      to: input.to,
      subject: `Action Required: ${input.itemType} for ${input.propertyName} expires ${expiry}`,
      html: `
        <p>Hi ${input.landlordName},</p>
        <p>Your <strong>${input.itemType}</strong> for <strong>${input.propertyName}</strong> is expiring on <strong>${expiry}</strong>.</p>
        <p>Log in to your Rental911 portal to upload your renewal and update the expiry date before it lapses.</p>
        <p><a href="${process.env.NEXT_PUBLIC_BASE_URL}/landlord/dashboard" style="color:#0C447C;font-weight:bold;">Go to my portal →</a></p>
        <p>— The Rental911 Team</p>
      `,
    });
  } catch (err) {
    console.error('[email-compliance] Failed to send compliance alert:', err);
  }
}

// ---------------------------------------------------------------------------

export interface LeaseRenewalAlertInput {
  to: string;
  landlordName: string;
  tenantName: string;
  unitNumber: string;
  propertyName: string;
  endDate: string; // YYYY-MM-DD
  renewalUrl: string;
}

export async function sendLeaseRenewalAlertEmail(input: LeaseRenewalAlertInput): Promise<void> {
  const resend = getResend();
  if (!resend) {
    console.warn('[email-compliance] RESEND_API_KEY not set — skipping renewal alert');
    return;
  }

  const end = new Date(input.endDate + 'T00:00:00').toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  const unit = input.unitNumber ? `Unit ${input.unitNumber} at ` : '';

  try {
    await resend.emails.send({
      from: FROM,
      to: input.to,
      subject: `Heads up: ${input.tenantName}'s lease at ${input.propertyName} ends ${end}`,
      html: `
        <p>Hi ${input.landlordName},</p>
        <p><strong>${input.tenantName}</strong>'s lease at <strong>${unit}${input.propertyName}</strong> ends on <strong>${end}</strong> — 60 days from now.</p>
        <p>Log in to your Rental911 portal to choose what happens next:</p>
        <ul>
          <li><strong>Renew</strong> — set new terms and generate a renewal lease</li>
          <li><strong>Month-to-month</strong> — continue on a rolling basis</li>
          <li><strong>Begin turnover</strong> — start the move-out checklist</li>
        </ul>
        <p><a href="${input.renewalUrl}" style="color:#0C447C;font-weight:bold;">Manage lease renewal →</a></p>
        <p>— The Rental911 Team</p>
      `,
    });
  } catch (err) {
    console.error('[email-compliance] Failed to send renewal alert:', err);
  }
}
