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
  const formData  = await request.formData();
  const signedPdf = formData.get('signedPdf') as File | null;
  if (!signedPdf) {
    return NextResponse.json({ error: 'Missing signed PDF' }, { status: 400 });
  }

  // Upload signed PDF to Storage (per-token path so each signer's copy is distinct)
  const signedPath = `requests/${params.token}/signed.pdf`;
  const bytes      = await signedPdf.arrayBuffer();
  const { error: uploadErr } = await admin.storage
    .from('signing-documents')
    .upload(signedPath, bytes, { contentType: 'application/pdf', upsert: true });

  if (uploadErr) {
    console.error('[signing/complete] Upload error:', uploadErr);
    return NextResponse.json({ error: 'Failed to store signed document' }, { status: 500 });
  }

  // Mark this request as signed
  await admin
    .from('signing_requests')
    .update({
      status:          'signed',
      signed_pdf_path: signedPath,
      signed_at:       new Date().toISOString(),
    })
    .eq('token', params.token);

  // Generate 7-day signed URL for email links
  const { data: urlData } = await admin.storage
    .from('signing-documents')
    .createSignedUrl(signedPath, 60 * 60 * 24 * 7);
  const pdfUrl = urlData?.signedUrl ?? null;

  const signedAtStr = new Date().toLocaleString('en-US', {
    timeZone:  'America/New_York',
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  const downloadBtn = pdfUrl
    ? `<a href="${pdfUrl}" style="background:#1A5BA6;color:#fff;padding:12px 28px;border-radius:6px;
         text-decoration:none;display:inline-block;margin-top:16px;font-weight:700;">
         Download Signed Copy
       </a>`
    : '';

  // ── Send signed copy to this signer ──────────────────────────────────────
  if (pdfUrl) {
    await resend.emails.send({
      from: FROM_EMAIL,
      to:   record.signer_email,
      subject: `Your signed copy — ${record.document_title}`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:32px;">
          <h2 style="color:#1A5BA6;margin-top:0;">Signed &amp; Confirmed</h2>
          <p>Hi ${record.signer_name},</p>
          <p>Your signed copy of <strong>${record.document_title}</strong> is ready to download.</p>
          ${downloadBtn}
          <p style="margin-top:32px;color:#888;font-size:13px;">
            Christine Pollard | Rental911 | rental911.net
          </p>
        </div>
      `,
    }).catch((err: unknown) => console.error('[signing/complete] Signer email error:', err));
  }

  // ── Multi-recipient: check session progress ───────────────────────────────
  const sessionId = record.session_id as string | null;

  type SessionRow = { id: string; signer_name: string; signer_email: string; status: string; signed_pdf_path: string | null; token: string };

  if (sessionId) {
    // Count all requests in this session (now that this one is marked signed)
    const { data: sessionRequests } = await admin
      .from('signing_requests')
      .select('id, signer_name, signer_email, status, signed_pdf_path, token')
      .eq('session_id', sessionId);

    const total      = sessionRequests?.length ?? 1;
    const signedRows = (sessionRequests as SessionRow[] | null)?.filter((r: SessionRow) => r.status === 'signed') ?? [];
    const signedCount = signedRows.length;

    if (signedCount < total) {
      // Progress email — X of N signed
      await resend.emails.send({
        from: FROM_EMAIL,
        to:   'ppgdropbox@gmail.com',
        subject: `⏳ ${signedCount} of ${total} signed: "${record.document_title}"`,
        html: `
          <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:32px;">
            <h2 style="color:#1A5BA6;margin-top:0;">Signing Progress Update</h2>
            <p><strong>${signedCount} of ${total}</strong> recipients have signed
               <strong>${record.document_title}</strong>.</p>
            <p><strong>${record.signer_name}</strong> (${record.signer_email}) signed at ${signedAtStr} ET.</p>
            <p style="color:#666;font-size:14px;">
              ${total - signedCount} recipient${total - signedCount !== 1 ? 's' : ''} still pending.
              You'll get another email when everyone has signed.
            </p>
          </div>
        `,
      }).catch((err: unknown) => console.error('[signing/complete] Progress email error:', err));
    } else {
      // All signed — send summary to Christine with all download links
      const signedLinksHtml = await Promise.all(
        signedRows.map(async (r: SessionRow) => {
          if (!r.signed_pdf_path) return '';
          const { data: d } = await admin.storage
            .from('signing-documents')
            .createSignedUrl(r.signed_pdf_path, 60 * 60 * 24 * 7);
          const link = d?.signedUrl;
          return link
            ? `<p style="margin:4px 0;">
                 <strong>${r.signer_name}</strong> —
                 <a href="${link}" style="color:#1A5BA6;">Download signed copy</a>
               </p>`
            : `<p style="margin:4px 0;"><strong>${r.signer_name}</strong> — signed (link unavailable)</p>`;
        })
      ).then(parts => parts.join(''));

      await resend.emails.send({
        from: FROM_EMAIL,
        to:   'ppgdropbox@gmail.com',
        subject: `✅ All ${total} signed: "${record.document_title}"`,
        html: `
          <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:32px;">
            <h2 style="color:#1A5BA6;margin-top:0;">All Parties Have Signed ✅</h2>
            <p>All <strong>${total} recipients</strong> have signed
               <strong>${record.document_title}</strong>.</p>
            <p style="color:#666;font-size:14px;">Completed: ${signedAtStr} ET</p>
            <div style="margin-top:20px;padding:16px;background:#f8f8f8;border-radius:8px;">
              <p style="margin:0 0 12px;font-weight:700;">Signed copies:</p>
              ${signedLinksHtml}
            </div>
          </div>
        `,
      }).catch((err: unknown) => console.error('[signing/complete] All-signed email error:', err));
    }
  } else {
    // Legacy single-recipient — send the original simple notification
    await resend.emails.send({
      from: FROM_EMAIL,
      to:   'ppgdropbox@gmail.com',
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
    }).catch((err: unknown) => console.error('[signing/complete] Admin email error:', err));
  }

  return NextResponse.json({ success: true });
}
