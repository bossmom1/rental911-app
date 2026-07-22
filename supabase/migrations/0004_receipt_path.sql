-- =============================================================================
-- Phase 2 — PDF receipts
-- Stores the Supabase Storage object path for each payment's receipt PDF
-- (bucket "receipts", path `{lease_id}/{payment_id}.pdf`). The path itself is
-- stored rather than a signed URL, since signed URLs expire — a fresh one is
-- generated on demand whenever the receipt is viewed or re-emailed.
-- Idempotent: safe to re-run.
-- =============================================================================

alter table public.rent_payments
  add column if not exists receipt_path text;
