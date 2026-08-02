import { NextResponse, type NextRequest } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase';
import { getCurrentUser } from '@/lib/auth';
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

// Update FROM_EMAIL to a domain you have verified in Resend.
// Until verified, use 'onboarding@resend.dev' for testing.
const FROM_EMAIL = 'Rental911 <onboarding@resend.dev>';

export async function POST(request: NextRequest) {
  const current = await getCurrentUser();
  if (!current?.profile || current.profile.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const formData = await request.formData();
  const file          = formData.get('file')          as File   | null;
  const fields        = formData.get('fields')        as string | null;
  const signerName    = (formData.get('signerName')   as string | null)?.trim();
  const signerEmail   = (formData.get('signerEmail')  as string | null)?.trim();
  const documentTitle = (formData.get('documentTitle') as string | null)?.trim();
  const emailNote     = (formData.get('emailNote')    as string | null)?.trim() || '';

  if (!file || !signerName || !signerEmail || !documentTitle) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  const token = crypto.randomUUID().replace(/-/g,'') + crypto.randomUUID().replace(/-/g,'');
  const pdfPath = `requests/${token}/document.pdf`;

  // Upload PDF to Supabase Storage
  const bytes = await file.arrayBuffer();
  const { error: uploadError } = await admin.storage
    .from('signing-documents')
    .upload(pdfPath, bytes, { contentType: 'application/pdf', upsert: false });

  if (uploadError) {
    console.error('[signing/create] Upload error:', uploadError);
    return NextResponse.json({ error: 'Failed to upload document' }, { status: 500 });
  }

  // Parse fields
  let parsedFields: unknown[] = [];
  try { parsedFields = JSON.parse(fields || '[]'); } catch { /* empty fields */ }

  // Insert signing request
  const { data: record, error: dbError } = await admin
    .from('signing_requests')
    .insert({
      token,
      document_title: documentTitle,
      pdf_path: pdfPath,
      fields: parsedFields,
      signer_name: signerName,
      signer_email: signerEmail,
    })
    .select()
    .single();

  if (dbError || !record) {
    console.error('[signing/create] DB error:', dbError);
    return NextResponse.json({ error: 'Failed to create signing request' }, { status: 500 });
  }

  // Build signing URL — use Vercel production URL when deployed
  const base = process.env.NEXT_PUBLIC_SITE_URL?.startsWith('http://localhost')
    ? 'https://rental911-app.vercel.app'
    : (process.env.NEXT_PUBLIC_SITE_URL ?? 'https://rental911-app.vercel.app');
  const signingUrl = `${base}/sign/${token}`;

  // Send email via Resend
  await resend.emails.send({
    from: FROM_EMAIL,
    to: signerEmail,
    subject: `Action Required: Please sign "${documentTitle}"`,
    html: buildSigningEmail(signerName, documentTitle, signingUrl, emailNote),
  }).catch(err => console.error('[signing/create] Email error:', err));

  return NextResponse.json({ token, signingUrl });
}

function buildSigningEmail(name: string, title: string, url: string, note: string): string {
  const noteBlock = note
    ? `<div style="background:#EBF3FF;border-left:4px solid #1A5BA6;padding:16px 20px;border-radius:0 8px 8px 0;margin:0 0 28px;">
         <p style="margin:0;font-size:14px;color:#333;line-height:1.7;white-space:pre-wrap;">${note.replace(/</g,'&lt;').replace(/>/g,'&gt;')}</p>
       </div>`
    : '';
  return buildSigningEmailHtml(name, title, url, noteBlock);
}

function buildSigningEmailHtml(name: string, title: string, url: string, noteBlock: string): string {
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
      <p style="font-size:15px;color:#444;line-height:1.6;margin:0 0 12px;">
        Christine Pollard has sent you a document for your signature:
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
