import { NextResponse, type NextRequest } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase';
import { getCurrentUser } from '@/lib/auth';
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM_EMAIL = 'Rental911 <noreply@rental911.net>';

type Recipient = { name: string; email: string };

export async function POST(request: NextRequest) {
  const current = await getCurrentUser();
  if (!current?.profile || current.profile.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const formData = await request.formData();
  const file          = formData.get('file')          as File   | null;
  const recipientsRaw = formData.get('recipients')    as string | null;
  const fieldsRaw     = formData.get('fields')        as string | null;
  const documentTitle = (formData.get('documentTitle') as string | null)?.trim();
  const emailNote     = (formData.get('emailNote')    as string | null)?.trim() || '';

  if (!file || !documentTitle) {
    return NextResponse.json({ error: 'Missing file or documentTitle' }, { status: 400 });
  }

  // Parse recipients
  let recipients: Recipient[] = [];
  try { recipients = JSON.parse(recipientsRaw || '[]'); } catch { /* empty */ }
  if (recipients.length === 0) {
    return NextResponse.json({ error: 'At least one recipient required' }, { status: 400 });
  }
  const valid = recipients.every(r => r.name?.trim() && r.email?.trim());
  if (!valid) {
    return NextResponse.json({ error: 'All recipients must have name and email' }, { status: 400 });
  }

  // Parse fields (each has a `signer` property: number = recipient index)
  let allFields: unknown[] = [];
  try { allFields = JSON.parse(fieldsRaw || '[]'); } catch { /* empty */ }

  const admin = createSupabaseAdminClient();

  // Generate a session_id to group all recipients for this send
  const sessionId = crypto.randomUUID();
  const isMulti   = recipients.length > 1;

  // Upload PDF once — shared across all recipients
  const bytes   = await file.arrayBuffer();
  const pdfPath = `sessions/${sessionId}/document.pdf`;
  const { error: uploadError } = await admin.storage
    .from('signing-documents')
    .upload(pdfPath, bytes, { contentType: 'application/pdf', upsert: false });

  if (uploadError) {
    console.error('[signing/create] Upload error:', uploadError);
    return NextResponse.json({ error: 'Failed to upload document' }, { status: 500 });
  }

  // Build signing URL base
  const base = process.env.NEXT_PUBLIC_SITE_URL?.startsWith('http://localhost')
    ? 'https://rental911-app.vercel.app'
    : (process.env.NEXT_PUBLIC_SITE_URL ?? 'https://rental911-app.vercel.app');

  const signingUrls: string[] = [];

  // Insert one row per recipient, send one email per recipient
  for (let i = 0; i < recipients.length; i++) {
    const recipient = recipients[i];
    const token     = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '');

    // Filter fields assigned to this recipient
    const recipientFields = (allFields as Array<{ signer?: number | string }>)
      .filter(f => f.signer === i);

    const { error: dbError } = await admin
      .from('signing_requests')
      .insert({
        token,
        document_title:  documentTitle,
        pdf_path:        pdfPath,
        fields:          recipientFields,
        signer_name:     recipient.name.trim(),
        signer_email:    recipient.email.trim(),
        session_id:      isMulti ? sessionId : null,
        recipient_index: isMulti ? i : null,
      });

    if (dbError) {
      console.error(`[signing/create] DB error for recipient ${i}:`, dbError);
      // Continue — don't fail the whole batch for one DB error, but log it
      continue;
    }

    const signingUrl = `${base}/sign/${token}`;
    signingUrls.push(signingUrl);

    // Send invitation email
    await resend.emails.send({
      from: FROM_EMAIL,
      to:   recipient.email.trim(),
      subject: `Action Required: Please sign "${documentTitle}"`,
      html: buildSigningEmail(recipient.name.trim(), documentTitle, signingUrl, emailNote, isMulti, i + 1, recipients.length),
    }).catch(err => console.error(`[signing/create] Email error for recipient ${i}:`, err));
  }

  return NextResponse.json({ sessionId, signingUrls });
}

function buildSigningEmail(
  name:         string,
  title:        string,
  url:          string,
  note:         string,
  isMulti:      boolean,
  recipientNum: number,
  totalCount:   number,
): string {
  const noteBlock = note
    ? `<div style="background:#EBF3FF;border-left:4px solid #1A5BA6;padding:16px 20px;border-radius:0 8px 8px 0;margin:0 0 28px;">
         <p style="margin:0;font-size:14px;color:#333;line-height:1.7;white-space:pre-wrap;">${note.replace(/</g,'&lt;').replace(/>/g,'&gt;')}</p>
       </div>`
    : '';

  const multiNote = isMulti
    ? `<p style="font-size:13px;color:#888;margin:0 0 20px;">
         Signer ${recipientNum} of ${totalCount} — your signature is required to complete this document.
       </p>`
    : '';

  return `<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;font-family:Arial,sans-serif;background:#f4f4f4;">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td>
<table width="600" align="center" cellpadding="0" cellspacing="0"
  style="background:#fff;margin:24px auto;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.1);">
  <tr>
    <td style="background:#1A5BA6;padding:24px 32px;">
      <h1 style="margin:0;color:#fff;font-size:22px;font-weight:700;">
        Rental<span style="color:#F5A623;">911</span>
      </h1>
      <p style="margin:4px 0 0;color:#c8d8f0;font-size:13px;">Document Signing Request</p>
    </td>
  </tr>
  <tr>
    <td style="padding:32px;">
      <p style="font-size:16px;color:#222;margin:0 0 12px;">Hi ${name},</p>
      ${multiNote}
      <p style="font-size:15px;color:#444;line-height:1.6;margin:0 0 12px;">
        Christine Pollard of Rental911 has sent you a document for your review and signature:
        <strong style="color:#222;">${title}</strong>
      </p>
      ${noteBlock}
      <p style="font-size:15px;color:#444;line-height:1.6;margin:0 0 28px;">
        Click the button below to review and sign. No account or download required —
        everything happens right in your browser.
      </p>
      <div style="text-align:center;margin-bottom:32px;">
        <a href="${url}"
           style="background:#1A5BA6;color:#fff;padding:16px 48px;border-radius:8px;
                  text-decoration:none;font-weight:700;font-size:16px;display:inline-block;">
          Review &amp; Sign Document →
        </a>
      </div>
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
