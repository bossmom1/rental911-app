'use client';

import { useState, useRef } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { saveTenantDocumentMetadata } from '@/app/(tenant)/tenant/documents/actions';
import { useRouter } from 'next/navigation';

const DOC_TYPES = [
  { key: 'renters_insurance',  label: 'Renters Insurance' },
  { key: 'gov_id',             label: 'Government ID' },
  { key: 'income_verification',label: 'Income Verification' },
  { key: 'move_in_photos',     label: 'Move-In Photos' },
  { key: 'move_out_photos',    label: 'Move-Out Photos' },
  { key: 'notice',             label: 'Notice / Letter Received' },
  { key: 'other',              label: 'Other' },
];

export function TenantDocumentUpload({
  tenantId,
  landlordId,
  leaseId,
  propertyId,
}: {
  tenantId: string;
  landlordId: string;
  leaseId: string;
  propertyId?: string;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [type, setType]         = useState('renters_insurance');
  const [label, setLabel]       = useState('');
  const [uploading, setUploading] = useState(false);
  const [error, setError]       = useState<string | null>(null);

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file) { setError('Please select a file.'); return; }
    if (file.size > 52428800) { setError('File must be under 50 MB.'); return; }

    setUploading(true);
    setError(null);

    // Path: {landlordId}/{tenantId}/{type}/{timestamp}-{filename}
    const filePath = `${landlordId}/${tenantId}/${type}/${Date.now()}-${file.name}`;

    const { error: uploadError } = await supabase.storage
      .from('tenant-documents')
      .upload(filePath, file, { upsert: false });

    if (uploadError) {
      setError(uploadError.message);
      setUploading(false);
      return;
    }

    try {
      await saveTenantDocumentMetadata({
        tenantId,
        landlordId,
        leaseId,
        propertyId,
        type,
        label: label || undefined,
        filePath,
        fileName: file.name,
        fileSize: file.size,
      });
    } catch (err: any) {
      setError(err.message);
      setUploading(false);
      return;
    }

    if (fileRef.current) fileRef.current.value = '';
    setLabel('');
    setUploading(false);
    router.refresh();
  }

  return (
    <form
      onSubmit={handleUpload}
      className="rounded-xl border border-gray-200 bg-gray-50 p-4"
    >
      <p className="mb-3 font-display font-bold text-navy">Upload a Document</p>

      <div className="grid gap-3 sm:grid-cols-2">
        {/* Document type */}
        <div>
          <label className="mb-1 block text-xs font-semibold text-ink/70">
            Document Type *
          </label>
          <select
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
            required
          >
            {DOC_TYPES.map((t) => (
              <option key={t.key} value={t.key}>{t.label}</option>
            ))}
          </select>
        </div>

        {/* Label */}
        <div>
          <label className="mb-1 block text-xs font-semibold text-ink/70">
            Label (optional)
          </label>
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="e.g. Policy #12345 — State Farm"
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
          />
        </div>

        {/* File input */}
        <div className="sm:col-span-2">
          <label className="mb-1 block text-xs font-semibold text-ink/70">
            File * (PDF, JPG, PNG, DOCX — max 50 MB)
          </label>
          <input
            ref={fileRef}
            type="file"
            accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx"
            required
            className="w-full text-sm"
          />
        </div>
      </div>

      {error && (
        <p className="mt-2 text-sm text-red-600">{error}</p>
      )}

      <button
        type="submit"
        disabled={uploading}
        className="mt-4 rounded-lg bg-navy px-4 py-2 font-display font-bold text-white disabled:opacity-50"
      >
        {uploading ? 'Uploading…' : 'Upload Document'}
      </button>
    </form>
  );
}
