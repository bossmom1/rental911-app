-- Migration 0023: Allow landlords to read their own onboarding submission
-- Landlords can only SELECT their own row (matched by email). No INSERT/UPDATE/DELETE.

-- Enable RLS if not already enabled (idempotent)
ALTER TABLE public.onboarding_submissions ENABLE ROW LEVEL SECURITY;

-- Drop existing landlord policy if it exists (safe re-run)
DROP POLICY IF EXISTS "Landlords can view own submission" ON public.onboarding_submissions;

-- Allow a landlord to see only their own row
CREATE POLICY "Landlords can view own submission"
  ON public.onboarding_submissions
  FOR SELECT
  TO authenticated
  USING (
    landlord_email = (
      SELECT email
      FROM public.users
      WHERE id = auth.uid()
    )
  );
