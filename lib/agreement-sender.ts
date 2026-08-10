// lib/agreement-sender.ts
//
// Orchestrates the post-payment agreement workflow:
//   1. Render the correct tier's agreement PDF via @react-pdf/renderer
//   2. Upload to Supabase Storage (signing-documents bucket)
//   3. Insert a signing_requests row (client as signer 0)
//   4. Send a Resend email with the signing link
//
// Callable from anywhere with Node.js access (webhooks, server actions, admin routes).
// Does NOT require admin auth — uses the service-role Supabase client directly.
//
// Page number strategy: rather than hardcoding which page the signature is on,
// we read the total page count from the rendered PDF buffer and use the LAST page.
// This works because every tier's Document ends with an explicit <Page> containing
// only the signature block — so the last page IS the signature page, regardless of
// how many overflow pages the content sections generate.

import { createSupabaseAdminClient } from '@/lib/supabase';
import { Resend } from 'resend';
import { renderAgreementPdf } from '@/lib/agreements/agreement-pdf';

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM_EMAIL = 'Rental911 <noreply@rental911.net>';

const BASE_URL = (() => {
  const url = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://rental911-app.vercel.app';
  return url.startsWith('http://localhost') ? 'https://rental911-app.vercel.app' : url;
})();

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SendAgreementOptions {
  tier: string;           // 'standard' | 'portfolio' | 'placement_only' | 'consulting'
  clientName: string;
  clientEmail: string;
  flatFee?: string;       // consulting tier only, e.g. "$135.00"
  // Optional: override env var CHRISTINE_SIGNATURE_BASE64 (useful for testing)
  christineSignatureBase64?: string;
}

export interface SendAgreementResult {
  ok: boolean;
  signingUrl?: string;
  sigPage?: number;
  error?: string;
}

// ─── Page count helper ────────────────────────────────────────────────────────
// Counts /Type /Page entries in the raw PDF buffer.
// Each physical page in the PDF has exactly one such entry.
// This is more reliable than trying to parse the XRef table.

function countPdfPages(buffer: Buffer): number {
  // Work in latin1 to safely scan binary-safe byte sequences
  const text = buffer.toString('latin1');
  const matches = text.match(/\/Type\s*\/Page(?!s)\b/g);
  return matches ? matches.length : 1;
}

// ─── Signing field definitions ────────────────────────────────────────────────
// Positions are fractions of page width/height (0–1, origin top-left).
// The signature block layout in agreement-pdf.tsx puts:
//   - Client signature line: ~28% down the signature page, left column
//   - Client date line: ~28% down the signature page, right column (~62% from left)
// These values target the center of each blank line.

function buildSigningFields(sigPage: number) {
  return [
    {
      signer: 0,
      type: 'signature',
      page: sigPage,
      xPct: 0.05,
      yPct: 0.28,
    },
    {
      signer: 0,
      type: 'date',
      page: sigPage,
      xPct: 0.62,
      yPct: 0.28,
    },
  ];
}

// ─── Document titles by tier ─────────────────────────────────────────────────

const DOCUMENT_TITLES: Record<string, string> = {
  standard:       'Rental911 Standard Investor Agreement',
  portfolio:      'Rental911 Portfolio Investor Agreement',
  placement_only: 'Rental911 Placement Only Agreement',
  consulting:     'Rental911 Landlord Consulting Agreement',
};

// ─── Email template ───────────────────────────────────────────────────────────

function buildAgreementEmail(
  name: string,
  tier: string,
  documentTitle: string,
  signingUrl: string,
): string {
  const tierLabel: Record<string, string> = {
    standard:       'Standard Landlord Rescue® (1–5 Properties)',
    portfolio:      'Portfolio Investor (6+ Properties)',
    placement_only: 'Tenant Placement Service',
    consulting:     'À La Carte Consulting',
  };
  const tierBadge = tierLabel[tier] ?? tier;

  return `<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;font-family:Arial,sans-serif;background:#f4f4f4;">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td>
<table width="600" align="center" cellpadding="0" cellspacing="0"
  style="background:#fff;margin:24px auto;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.1);">
  <tr>
    <td style="background:#1A3A6B;padding:24px 32px;">
      <h1 style="margin:0;color:#fff;font-size:22px;font-weight:700;">
        Rental<span style="color:#F5A623;">911</span>
      </h1>
      <p style="margin:4px 0 0;color:#c8d8f0;font-size:13px;">Your Agreement Is Ready to Sign</p>
    </td>
  </tr>
  <tr>
    <td style="padding:32px;">
      <p style="font-size:16px;color:#222;margin:0 0 12px;">Hi ${name},</p>
      <p style="font-size:15px;color:#444;line-height:1.6;margin:0 0 12px;">
        Welcome to Rental911! Your payment has been received and your service agreement is ready
        for your signature.
      </p>
      <div style="background:#EBF3FF;border-left:4px solid #1A5BA6;padding:14px 18px;border-radius:0 8px 8px 0;margin:0 0 22px;">
        <p style="margin:0;font-size:13px;color:#333;font-weight:bold;">📋 ${documentTitle}</p>
        <p style="margin:4px 0 0;font-size:12px;color:#666;">Service tier: ${tierBadge}</p>
      </div>
      <p style="font-size:15px;color:#444;line-height:1.6;margin:0 0 28px;">
        Please review and sign at your earliest convenience — no account or download required.
        Everything happens right in your browser.
      </p>
      <div style="text-align:center;margin-bottom:32px;">
        <a href="${signingUrl}"
           style="background:#1A5BA6;color:#fff;padding:16px 48px;border-radius:8px;
                  text-decoration:none;font-weight:700;font-size:16px;display:inline-block;">
          Review &amp; Sign Agreement →
        </a>
      </div>
      <p style="font-size:14px;color:#444;line-height:1.6;margin:0 0 8px;font-weight:bold;">What happens next:</p>
      <p style="font-size:14px;color:#555;line-height:1.6;margin:0 0 4px;">✓ Sign the agreement (takes ~2 minutes)</p>
      <p style="font-size:14px;color:#555;line-height:1.6;margin:0 0 4px;">✓ Christine will counter-sign and send you a completed copy</p>
      <p style="font-size:14px;color:#555;line-height:1.6;margin:0 0 22px;">✓ Onboarding next steps will be sent within 1 business day</p>
      <p style="font-size:13px;color:#888;border-top:1px solid #eee;padding-top:16px;margin:0;">
        This link expires in 30 days. Questions? Email
        <a href="mailto:ppgdropbox@gmail.com" style="color:#1A5BA6;">ppgdropbox@gmail.com</a>
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
</html>`;
}

// ─── Portfolio supplement form email ──────────────────────────────────────────
// Sent as a SECOND email to portfolio investors only.
// Portfolio investors must complete the supplement form before the onboarding call.

function buildPortfolioSupplementEmail(name: string, supplementUrl: string): string {
  return `<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;font-family:Arial,sans-serif;background:#f4f4f4;">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td>
<table width="600" align="center" cellpadding="0" cellspacing="0"
  style="background:#fff;margin:24px auto;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.1);">
  <tr>
    <td style="background:#1A3A6B;padding:24px 32px;">
      <h1 style="margin:0;color:#fff;font-size:22px;font-weight:700;">
        Rental<span style="color:#F5A623;">911</span>
      </h1>
      <p style="margin:4px 0 0;color:#c8d8f0;font-size:13px;">Portfolio Investor — Next Step</p>
    </td>
  </tr>
  <tr>
    <td style="padding:32px;">
      <p style="font-size:16px;color:#222;margin:0 0 12px;">Hi ${name},</p>
      <p style="font-size:15px;color:#444;line-height:1.6;margin:0 0 16px;">
        Because you're enrolling as a <strong>Portfolio Investor</strong>, there's one additional
        step before your onboarding call: a brief portfolio supplement form.
      </p>
      <p style="font-size:15px;color:#444;line-height:1.6;margin:0 0 16px;">
        This form helps Christine understand your full portfolio so she can tailor the onboarding
        call specifically to your properties and goals. It takes about 5 minutes.
      </p>
      <div style="text-align:center;margin:28px 0;">
        <a href="${supplementUrl}"
           style="background:#C9A84C;color:#fff;padding:16px 48px;border-radius:8px;
                  text-decoration:none;font-weight:700;font-size:16px;display:inline-block;">
          Complete Portfolio Supplement →
        </a>
      </div>
      <p style="font-size:13px;color:#888;border-top:1px solid #eee;padding-top:16px;margin:0;">
        Please complete this form before your onboarding call. Questions?
        <a href="mailto:ppgdropbox@gmail.com" style="color:#1A5BA6;">ppgdropbox@gmail.com</a>
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
</html>`;
}

// ─── Main export ──────────────────────────────────────────────────────────────

export async function sendAgreement(opts: SendAgreementOptions): Promise<SendAgreementResult> {
  const { tier, clientName, clientEmail, flatFee } = opts;

  // Read Christine's signature from env (override passed explicitly for testing)
  const rawSig = opts.christineSignatureBase64 ?? process.env.CHRISTINE_SIGNATURE_BASE64;
  const christineSignatureBase64 = rawSig?.replace(/^data:image\/\w+;base64,/, '');

  const documentTitle = DOCUMENT_TITLES[tier] ?? `Rental911 ${tier} Agreement`;
  const today = new Date();
  const dateStr = today.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'America/New_York',
  });

  // ── 1. Render the agreement PDF ─────────────────────────────────────────────
  let pdfBuffer: Buffer;
  try {
    pdfBuffer = await renderAgreementPdf({
      tier,
      clientName,
      date: dateStr,
      flatFee,
      christineSignatureBase64,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'PDF render failed';
    console.error('[agreement-sender] renderAgreementPdf failed:', msg);
    return { ok: false, error: `PDF render failed: ${msg}` };
  }

  // ── 2. Determine signature page (dynamic — always the last PDF page) ────────
  const totalPages = countPdfPages(pdfBuffer);
  const sigPage = totalPages; // signature block is always the last explicit <Page>
  console.log(`[agreement-sender] tier:${tier} pdf pages:${totalPages} sigPage:${sigPage}`);

  // ── 3. Upload to Supabase Storage ───────────────────────────────────────────
  const admin = createSupabaseAdminClient();
  const sessionId = crypto.randomUUID();
  const pdfPath = `requests/${sessionId}/document.pdf`;

  const { error: uploadError } = await admin.storage
    .from('signing-documents')
    .upload(pdfPath, pdfBuffer, { contentType: 'application/pdf', upsert: false });

  if (uploadError) {
    console.error('[agreement-sender] Supabase upload failed:', uploadError);
    return { ok: false, error: `Storage upload failed: ${uploadError.message}` };
  }

  // ── 4. Insert signing_requests row ──────────────────────────────────────────
  const token = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '');
  const fields = buildSigningFields(sigPage);

  const { error: dbError } = await admin
    .from('signing_requests')
    .insert({
      token,
      document_title: documentTitle,
      pdf_path: pdfPath,
      fields,
      signer_name: clientName,
      signer_email: clientEmail,
      session_id: sessionId,
      recipient_index: 0,
    });

  if (dbError) {
    console.error('[agreement-sender] signing_requests insert failed:', dbError);
    return { ok: false, error: `DB insert failed: ${dbError.message}` };
  }

  // ── 5. Send signing email via Resend ────────────────────────────────────────
  const signingUrl = `${BASE_URL}/sign/${token}`;

  try {
    await resend.emails.send({
      from: FROM_EMAIL,
      to: clientEmail,
      subject: `Action Required: Please sign your ${documentTitle}`,
      html: buildAgreementEmail(clientName, tier, documentTitle, signingUrl),
    });
  } catch (err) {
    // Non-blocking — signing row is already created; admin can resend from /admin/documents
    console.error('[agreement-sender] Resend signing email failed (non-blocking):', err);
  }

  // ── 6. Portfolio supplement form — send as a separate second email ──────────
  // The supplement form URL comes from env var PORTFOLIO_SUPPLEMENT_FORM_URL.
  // If the env var is not set, this step is silently skipped.
  if (tier === 'portfolio') {
    const supplementUrl = process.env.PORTFOLIO_SUPPLEMENT_FORM_URL;
    if (supplementUrl) {
      try {
        await resend.emails.send({
          from: FROM_EMAIL,
          to: clientEmail,
          subject: 'Rental911 — Please Complete Your Portfolio Supplement Form',
          html: buildPortfolioSupplementEmail(clientName, supplementUrl),
        });
        console.log(`[agreement-sender] Portfolio supplement email sent to ${clientEmail}`);
      } catch (err) {
        console.error('[agreement-sender] Portfolio supplement email failed (non-blocking):', err);
      }
    } else {
      console.warn('[agreement-sender] PORTFOLIO_SUPPLEMENT_FORM_URL not set — supplement email skipped');
    }
  }

  console.log(`[agreement-sender] Done — tier:${tier} email:${clientEmail} token:${token.substring(0, 8)}…`);
  return { ok: true, signingUrl, sigPage };
}
