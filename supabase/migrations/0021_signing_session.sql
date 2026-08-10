-- =============================================================================
-- Rental911 — Migration 0021: Multi-recipient signing (session_id + recipient_index)
-- Run in the Supabase SQL Editor (Dashboard → SQL Editor → New Query).
-- =============================================================================

-- Add session grouping columns (safe to run even if already added manually)
alter table public.signing_requests
  add column if not exists session_id       uuid,
  add column if not exists recipient_index  integer;

-- Index for fetching all requests in a session at completion time
create index if not exists idx_signing_requests_session_id
  on public.signing_requests (session_id)
  where session_id is not null;
