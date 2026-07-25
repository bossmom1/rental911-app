-- =============================================================================
-- Adds properties.municipality — a plain, unvalidated text field (e.g. "La
-- Plata", "Hyattsville") used to key municipality-specific compliance rules
-- in lib/compliance.ts (Charles County town rental licenses, Prince George's
-- County self-licensing towns). Null/blank means "not in an incorporated
-- town" — most properties. Idempotent: safe to re-run.
-- =============================================================================

alter table public.properties add column if not exists municipality text;
