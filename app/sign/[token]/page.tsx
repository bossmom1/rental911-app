import { createSupabaseAdminClient } from '@/lib/supabase';
import SignClient from './SignClient';

export const metadata = { title: 'Sign Document | Rental911' };

type Field = {
  id: string;
  type: 'signature' | 'initials' | 'date' | 'text';
  page: number;
  xPct: number;
  yPct: number;
};

function StatusPage({ icon, title, message }: { icon: string; title: string; message: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', fontFamily: 'sans-serif', textAlign: 'center', padding: '24px' }}>
      <div style={{ fontSize: '64px', marginBottom: '16px' }}>{icon}</div>
      <h2 style={{ color: '#1A5BA6', margin: '0 0 12px', fontSize: '22px' }}>{title}</h2>
      <p style={{ color: '#666', maxWidth: '400px', lineHeight: 1.6 }}>{message}</p>
    </div>
  );
}

export default async function SignPage({ params }: { params: { token: string } }) {
  const admin = createSupabaseAdminClient();

  const { data: record } = await admin
    .from('signing_requests')
    .select('*')
    .eq('token', params.token)
    .maybeSingle();

  if (!record) {
    return (
      <StatusPage
        icon="❌"
        title="Link Not Found"
        message="This signing link is invalid. Please contact the sender for a new link."
      />
    );
  }

  if (record.status === 'signed') {
    return (
      <StatusPage
        icon="✅"
        title="Already Signed"
        message={`This document was already signed. Check your email for your signed copy, or contact ppgdropbox@gmail.com.`}
      />
    );
  }

  if (record.status === 'expired' || new Date(record.expires_at) < new Date()) {
    return (
      <StatusPage
        icon="⏰"
        title="Link Expired"
        message="This signing link has expired. Please contact Christine Pollard at ppgdropbox@gmail.com to request a new one."
      />
    );
  }

  // Generate a 1-hour signed URL for the PDF
  const { data: urlData } = await admin.storage
    .from('signing-documents')
    .createSignedUrl(record.pdf_path, 3600);

  if (!urlData?.signedUrl) {
    return (
      <StatusPage
        icon="⚠️"
        title="Document Unavailable"
        message="Could not load the document. Please contact ppgdropbox@gmail.com."
      />
    );
  }

  return (
    <SignClient
      token={params.token}
      pdfUrl={urlData.signedUrl}
      fields={record.fields as Field[]}
      signerName={record.signer_name}
      documentTitle={record.document_title}
    />
  );
}
