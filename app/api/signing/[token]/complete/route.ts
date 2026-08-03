import { NextResponse, type NextRequest } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase';
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM_EMAIL = 'Rental911 <noreply@rental911.net>';

export async function POST(
  request: NextRequest,
  { params }: { params: { token: string } }
) {
  const admin = createSupabaseAdminClient();

  // Verify the signing request exists and is pending
  const { data: record } = await admin
    .from('signing_requests')
    .select('*')
    .eq('token', params.token)
    .eq('status', 'pending')
    .maybeSingle();

  if (!record) {
    return NextResponse.json({ error: 'Not found or already completed' }, { status: 404 });
  }

  // Get the signed PDF from the request
  const formData = await request.formData();
  const signedPdf = formData.get('signedPdf') as File | null;
  if (!signedPdf) {
    return NextResponse.json({ error: 'Missing signed PDF' }, { status: 400 });
  }

  // Upload signed PDF to Storage
  const signedPath = `requests/${params.token}/signed.pdf`;
  const bytes = await signedPdf.arrayBuffer();
  const { error: uploadErr } = await admin.storage
    .from('signing-documents')
    .upload(signedPath, bytes, { contentType: 'application/pdf', upsert: true });

  if (uploadErr) {
    console.error('[signing/complete] Upload error:', uploadErr);
    return NextResponse.json({ error: 'Failed to store signed document' }, { status: 500 });
  }

  // Mark request as signed
  await admin
    .from('signing_requests')
    .update({
      status: 'signed',
      signed_pdf_path: signedPath,
      signed_at: new Date().toISOString(),
    })
    .eq('token', params.token);

  // Generate 7-day signed URL for both email links
  const { data: urlData } = await admin.storage
    .from('signing-documents')
    .createSignedUrl(signedPath, 60 * 60 * 24 * 7);
  const pdfUrl = urlData?.signedUrl ?? null;

  const signedAtStr = new Date().toLocaleString('en-US', {
    timeZone: 'America/New_York',
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  const downloadBtn = pdfUrl
    ? `<a href="${pdfUrl}" style="background:#1A5BA6;color:#fff;padding:12px 28px;border-radius:6px;
         text-decoration:none;display:inline-block;margin-top:16px;font-weight:700;">
         Download Signed Copy
       </a>`
    : '';

  // Email Christine
  await resend.emails.send({
    from: FROM_EMAIL,
    to: 'ppgdropbox@gmail.com',
    subject: `✅ Signed: "${record.document_title}" — ${record.signer_name}`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:32px;">
        <h2 style="color:#1A5BA6;margin-top:0;">Document Signed ✅</h2>
        <p><strong>${record.signer_name}</strong> (${record.signer_email}) has signed
           <strong>${record.document_title}</strong>.</p>
        <p style="color:#666;font-size:14px;">Signed: ${signedAtStr} ET</p>
        ${downloadBtn}
      </div>
    `,
  }).catch(err => console.error('[signing/complete] Admin email error:', err));

  // Email the signer their copy
  if (pdfUrl) {
    await resend.emails.send({
      from: FROM_EMAIL,
      to: record.signer_email,
      subject: `Your signed copy — ${record.document_title}`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:32px;">
          <h2 style="color:#1A5BA6;margin-top:0;">Signed &amp; Confirmed</h2>
          <p>Hi ${record.signer_name},</p>
          <p>Your signed copy of <strong>${record.document_title}</strong> is ready to download.</p>
          <a href="${pdfUrl}"
             style="background:#1A5BA6;color:#fff;padding:12px 28px;border-radius:6px;
                    text-decoration:none;display:inline-block;margin-top:16px;font-weight:700;">
            Download Your Copy
          </a>
          <p style="margin-top:32px;color:#888;font-size:13px;">
            Christine Pollard | Rental911 | rental911.net
          </p>
        </div>
      `,
    }).catch(err => console.error('[signing/complete] Signer email error:', err));
  }

  return NextResponse.json({ success: true });
}
