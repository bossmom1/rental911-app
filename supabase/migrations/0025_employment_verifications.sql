-- =============================================================================
-- Rental911 — Migration 0024: Employment Verifications
-- Run in the Supabase SQL Editor (Dashboard → SQL Editor → New Query).
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS public.employment_verifications (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             UUID        REFERENCES public.users(id),
  landlord_id           UUID        REFERENCES public.users(id),
  property_id           UUID        REFERENCES public.properties(id),
  -- employer contact info (provided by tenant/landlord when triggering)
  employer_name         TEXT,
  employer_email        TEXT        NOT NULL,
  employer_contact_name TEXT,
  -- public token for the employer form link
  token                 TEXT        UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex'),
  token_expires_at      TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '14 days',
  -- status
  status                TEXT        NOT NULL DEFAULT 'sent'
                                    CHECK (status IN ('sent', 'completed', 'expired')),
  sent_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at          TIMESTAMPTZ,
  -- completed form data (JSONB) stored on submission
  response              JSONB,
  -- document record IDs created after completion (references documents.id)
  tenant_document_id    UUID,
  landlord_document_id  UUID,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS
ALTER TABLE public.employment_verifications ENABLE ROW LEVEL SECURITY;

-- Admin: full access
CREATE POLICY "Admin manages employment_verifications"
  ON public.employment_verifications
  FOR ALL
  TO authenticated
  USING  (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin'));

-- Landlord: read own records
CREATE POLICY "Landlord reads own employment_verifications"
  ON public.employment_verifications
  FOR SELECT
  TO authenticated
  USING (landlord_id = auth.uid());

-- Tenant: read own records
CREATE POLICY "Tenant reads own employment_verifications"
  ON public.employment_verifications
  FOR SELECT
  TO authenticated
  USING (tenant_id = auth.uid());
