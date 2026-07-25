-- =============================================================================
-- Add a 'not_applicable' compliance status so admins can mark an individual
-- item as not required for a given property (e.g. "owner-occupied, license
-- not required") — with a Notes field explaining why (compliance_items.notes
-- already exists, reused as-is). Idempotent: safe to re-run.
-- =============================================================================

-- Drop whatever the existing check constraint on compliance_items.status is
-- actually named (found by column rather than guessed by name, since it was
-- defined inline in the original create table and Postgres's auto-generated
-- name could vary) and recreate it with the new value added.
do $$
declare
  con record;
begin
  for con in
    select pc.conname
    from pg_constraint pc
    join pg_class rel on rel.oid = pc.conrelid
    join pg_attribute att on att.attrelid = rel.oid and att.attnum = any(pc.conkey)
    where rel.relname = 'compliance_items'
      and att.attname = 'status'
      and pc.contype = 'c'
  loop
    execute format('alter table public.compliance_items drop constraint %I', con.conname);
  end loop;
end $$;

alter table public.compliance_items
  add constraint compliance_items_status_check
  check (status in ('current', 'expiring_soon', 'expired', 'not_on_file', 'not_applicable'));

-- Re-guard the daily flip so a not_applicable item with a leftover/stale
-- expiry_date doesn't get silently flipped to 'expired' by the cron —
-- 'not_applicable' is an explicit admin decision, not an oversight to
-- "correct". The expiring_soon branch is already safe (status = 'current'
-- only); this only changes the expired branch's guard.
create or replace function public.flip_compliance_statuses()
returns setof public.compliance_items
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
    update public.compliance_items
    set status = 'expiring_soon', alert_sent = true, updated_at = now()
    where expiry_date <= current_date + interval '30 days'
      and expiry_date > current_date
      and status = 'current'
      and alert_sent = false
    returning *;

  update public.compliance_items
  set status = 'expired', updated_at = now()
  where expiry_date < current_date
    and status not in ('expired', 'not_applicable');
end;
$$;
