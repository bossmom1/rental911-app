-- =============================================================================
-- Migration 0024: Maintenance authorization threshold
-- Adds per-landlord maintenance threshold, pending_approval status,
-- landlord approval tracking, and post-completion billing fields.
-- Idempotent: safe to re-run.
-- =============================================================================

-- 1. Per-landlord maintenance threshold (default $500 = 50000 cents)
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS maintenance_threshold_cents INTEGER NOT NULL DEFAULT 50000;

-- 2. Widen the maintenance_requests.status check constraint to include
--    'pending_approval'. Pattern matches migration 0019: drop old constraint(s),
--    re-add with the full value set.
DO $$
DECLARE
  con RECORD;
BEGIN
  FOR con IN
    SELECT pc.conname
    FROM pg_constraint pc
    JOIN pg_class rel ON rel.oid = pc.conrelid
    JOIN pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(pc.conkey)
    WHERE rel.relname = 'maintenance_requests'
      AND att.attname = 'status'
      AND pc.contype = 'c'
  LOOP
    EXECUTE format('ALTER TABLE public.maintenance_requests DROP CONSTRAINT %I', con.conname);
  END LOOP;
END $$;

ALTER TABLE public.maintenance_requests
  ADD CONSTRAINT maintenance_requests_status_check
  CHECK (status IN (
    'open', 'in_progress', 'vendor_assigned', 'completed', 'closed', 'pending_approval'
  ));

-- 3. Landlord approval tracking columns
ALTER TABLE public.maintenance_requests
  ADD COLUMN IF NOT EXISTS approved_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS approved_by   UUID REFERENCES public.users(id);

-- 4. Post-completion billing fields
ALTER TABLE public.maintenance_requests
  ADD COLUMN IF NOT EXISTS billing_amount_cents       INTEGER,
  ADD COLUMN IF NOT EXISTS stripe_payment_intent_id   TEXT,
  ADD COLUMN IF NOT EXISTS billed_at                  TIMESTAMPTZ;

-- Index for billing lookups (non-partial so planner can use it freely)
CREATE INDEX IF NOT EXISTS idx_maint_requests_payment_intent
  ON public.maintenance_requests (stripe_payment_intent_id)
  WHERE stripe_payment_intent_id IS NOT NULL;
