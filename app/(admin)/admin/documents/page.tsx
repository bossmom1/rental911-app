import { createSupabaseAdminClient } from '@/lib/supabase';
import DocumentsClient from './DocumentsClient';

export const metadata = { title: 'Documents | Rental911' };

export default async function DocumentsPage() {
  const admin = createSupabaseAdminClient();
  const { data: requests } = await admin
    .from('signing_requests')
    .select('id,token,document_title,signer_name,signer_email,status,created_at,signed_at')
    .order('created_at', { ascending: false });

  return <DocumentsClient requests={requests ?? []} />;
}
