'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase';
import { Field, Select } from '@/components/ui/Field';
import { Button } from '@/components/ui/Button';

/**
 * Tenant document upload. Scoped to the tenant's own lease/unit — the insert
 * sets owner_id = self AND lease_id = their lease, which the RLS policy
 * docs_tenant_insert enforces (uploads to any other lease are rejected).
 */
export function DocumentUpload({
  tenantId,
  leaseId,
  unitId,
}: {
  tenantId: string;
  leaseId: string;
  unitId: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = e.currentTarget;
    const type = (form.querySelector('#doc_type') as HTMLSelectElement).value;
    const file = (form.querySelector('#doc_file') as HTMLInputElement).files?.[0];
    if (!file) {
      setError('Choose a file to upload.');
      return;
    }
    setBusy(true);
    const supabase = createSupabaseBrowserClient();
    const path = `${tenantId}/${leaseId}/${Date.now()}-${file.name}`;

    const { error: upErr } = await supabase.storage
      .from('documents')
      .upload(path, file, { upsert: false });

    let fileUrl = '';
    if (upErr) {
      setBusy(false);
      setError(
        `Upload failed: ${upErr.message}. Ensure a Storage bucket named "documents" exists.`
      );
      return;
    }
    fileUrl = supabase.storage.from('documents').getPublicUrl(path).data.publicUrl;

    const { error: insErr } = await supabase.from('documents').insert({
      owner_id: tenantId,
      lease_id: leaseId,
      unit_id: unitId,
      type,
      file_name: file.name,
      file_url: fileUrl,
      uploaded_by_role: 'tenant',
    });

    setBusy(false);
    if (insErr) {
      setError(insErr.message);
      return;
    }
    form.reset();
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="rounded-xl border border-light-blue bg-white p-6">
      {error && (
        <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-red-700">{error}</p>
      )}
      <Field label="Document type" htmlFor="doc_type">
        <Select id="doc_type" defaultValue="renters_insurance">
          <option value="renters_insurance">Renters insurance</option>
          <option value="gov_id">Government ID</option>
          <option value="income_verification">Income verification</option>
          <option value="other">Other</option>
        </Select>
      </Field>
      <Field label="File" htmlFor="doc_file">
        <input
          id="doc_file"
          type="file"
          accept=".pdf,.jpg,.jpeg,.png"
          className="block w-full text-ink"
        />
      </Field>
      <Button type="submit" disabled={busy}>
        {busy ? 'Uploading…' : 'Upload document'}
      </Button>
    </form>
  );
}
