-- Migration 0025: landlord documents storage

CREATE TABLE IF NOT EXISTS landlord_documents (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  landlord_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  property_id UUID REFERENCES properties(id) ON DELETE SET NULL,
  type        TEXT NOT NULL CHECK (type IN (
                'lease',
                'hoa_governing',
                'hoa_violation',
                'management_contract',
                'inspection_report',
                'other'
              )),
  label       TEXT,
  file_path   TEXT NOT NULL,
  file_name   TEXT NOT NULL,
  file_size   INTEGER,
  notes       TEXT,
  uploaded_at TIMESTAMPTZ DEFAULT now(),
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS landlord_documents_landlord_id_idx ON landlord_documents(landlord_id);
CREATE INDEX IF NOT EXISTS landlord_documents_type_idx        ON landlord_documents(type);

ALTER TABLE landlord_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "landlords_docs_select" ON landlord_documents
  FOR SELECT USING (landlord_id = auth.uid());

CREATE POLICY "landlords_docs_insert" ON landlord_documents
  FOR INSERT WITH CHECK (landlord_id = auth.uid());

CREATE POLICY "landlords_docs_delete" ON landlord_documents
  FOR DELETE USING (landlord_id = auth.uid());

CREATE POLICY "admins_docs_all" ON landlord_documents
  FOR ALL USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  );

-- Storage bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'landlord-documents',
  'landlord-documents',
  false,
  52428800,
  ARRAY[
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]
)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS: landlords access their own folder only
CREATE POLICY "storage_landlords_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'landlord-documents' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "storage_landlords_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'landlord-documents' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "storage_landlords_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'landlord-documents' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

-- Admins can access all files in the bucket
CREATE POLICY "storage_admins_all" ON storage.objects
  FOR ALL TO authenticated
  USING (
    bucket_id = 'landlord-documents' AND
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  );
