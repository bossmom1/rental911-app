/**
 * Send-for-signature step of the lease renewal flow.
 * PLACEHOLDER — no e-signature provider is wired up yet (same category of
 * placeholder as app/api/leaserunner/screen/route.ts for tenant screening).
 * For now this just emails the tenant a copy of the draft lease PDF for them
 * to sign outside the app; a landlord "Mark as Signed" action finalizes the
 * renewal manually (see tenants/[leaseId]/actions.ts).
 *
 * Kept behind this single function so a real e-signature API (DocuSign,
 * Dropbox Sign, Adobe Sign, etc.) can be dropped in later without reworking
 * the renewal flow that calls it.
 */

import { Resend } from 'resend';
import { ALERTS_FROM_EMAIL } from '@/lib/email';

let _resend: Resend | null = null;

function getResend(): Resend | null {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  if (!_resend) _resend = new Resend(key);
  return _resend;
}

export interface SendLeaseForSignatureInput {
  to: string;
  tenantName: string;
  propertyName: string;
  pdfBuffer: Buffer;
  pdfFileName: string;
}

export interface SendLeaseForSignatureResult {
  ok: boolean;
  source: 'mock-email' | 'skipped';
}

/**
 * Emails the tenant a copy of the lease to sign outside the app.
 * Non-blocking: never throws, always returns a result the caller can log.
 */
export async function sendLeaseForSignature(
  input: SendLeaseForSignatureInput
): Promise<SendLeaseForSignatureResult> {
  // ---------------------------------------------------------------------------
  // TODO(later phase): Replace this mock email step with a real e-signature
  // API call, e.g.:
  //   const envelope = await docusign.envelopes.create({
  //     templateId: LEASE_TEMPLATE_ID,
  //     signer: { email: input.to, name: input.tenantName },
  //     documents: [{ documentBase64: input.pdfBuffer.toString('base64') }],
  //   });
  //   return { ok: true, source: 'docusign', envelopeId: envelope.id };
  // ---------------------------------------------------------------------------
  const resend = getResend();
  if (!resend) {
    console.warn('[esignature] RESEND_API_KEY not set — skipping lease send');
    return { ok: false, source: 'skipped' };
  }
  try {
    const { error } = await resend.emails.send({
      from: ALERTS_FROM_EMAIL,
      to: [input.to],
      subject: `Your renewed lease for ${input.propertyName}`,
      html: `
        <p>Hi ${input.tenantName},</p>
        <p>Attached is your renewed lease for ${input.propertyName}. Please review, sign, and
        return it outside this app for now — your landlord will confirm once it's signed.</p>
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
    return { ok: true, source: 'mock-email' };
  } catch (err) {
    console.error('[esignature] sendLeaseForSignature failed (non-blocking):', err);
    return { ok: false, source: 'skipped' };
  }
}
