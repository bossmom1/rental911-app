-- =============================================================================
-- Rental911 — Migration 0026: Preferred Vendor Fields on Onboarding Submissions
--
-- Adds two columns to capture the vendor preference questions added to Slide 1
-- of the Rental911 Landlord Onboarding Survey on 2026-08-13:
--   • preferred_vendors_yn   — radio: "Do you have preferred vendors?"  (Yes/No)
--   • preferred_vendors_list — multi-line: vendor name/trade/contact, one per line
--
-- GHL query keys: preferred_vendors_yn / preferred_vendors_list
--   (contact field key: contact.preferred_vendors_list)
-- =============================================================================

alter table public.onboarding_submissions
  add column if not exists preferred_vendors_yn   text,   -- Yes / No
  add column if not exists preferred_vendors_list text;   -- free-text, one vendor per line
