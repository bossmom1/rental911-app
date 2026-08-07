-- =============================================================================
-- Rental911 — Migration 0021: Multi-Recipient Signing Support
-- Run in the Supabase SQL Editor (Dashboard → SQL Editor → New Query).
-- =============================================================================

-- Add session_id to group multiple signers on the same document send
alter table public.signing_requests
  add column if not exists session_id       uuid,
  add column if not exists recipient_index  integer;

-- Index for fast session lookups (checking if all in a session have signed)
create index if not exists signing_requests_session_id_idx
  on public.signing_requests (session_id)
  where session_id is not null;
