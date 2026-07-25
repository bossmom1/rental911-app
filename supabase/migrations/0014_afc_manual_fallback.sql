-- =============================================================================
-- Adds 'pending_manual' to afc_claim_invoices.status — an interim state
-- while AFC's own Request Service claim form (afchomeclub.com/service) is
-- broken on their end (loops to login, no ETA). Christine approved a manual
-- fallback: admin gets notified with the claim details + AFC's Service line
-- (770-973-2400 / service@afchomeclub.com) to file it themselves, then marks
-- it submitted from /admin/afc-claims. When AFC's form is fixed and its
-- fields get mapped, submitClaimInvoice() swaps back to real form
-- automation — no other rework needed. Idempotent: safe to re-run.
-- =============================================================================

do $$
declare
  con record;
begin
  for con in
    select pc.conname
    from pg_constraint pc
    join pg_class rel on rel.oid = pc.conrelid
    join pg_attribute att on att.attrelid = rel.oid and att.attnum = any(pc.conkey)
    where rel.relname = 'afc_claim_invoices'
      and att.attname = 'status'
      and pc.contype = 'c'
  loop
    execute format('alter table public.afc_claim_invoices drop constraint %I', con.conname);
  end loop;
end $$;

alter table public.afc_claim_invoices
  add constraint afc_claim_invoices_status_check
  check (status in ('pending', 'pending_manual', 'submitted', 'failed'));
