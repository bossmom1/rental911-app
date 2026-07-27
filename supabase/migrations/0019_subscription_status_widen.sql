-- =============================================================================
-- users.subscription_status was missing real Stripe subscription statuses
-- ('incomplete', 'incomplete_expired', 'paused') — found via an end-to-end
-- test-mode verification: a genuine customer.subscription.updated webhook
-- event with status='incomplete' (e.g. a customer mid-3D-Secure-challenge on
-- their first subscription payment) would violate this constraint and fail.
-- Idempotent: safe to re-run.
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
    where rel.relname = 'users'
      and att.attname = 'subscription_status'
      and pc.contype = 'c'
  loop
    execute format('alter table public.users drop constraint %I', con.conname);
  end loop;
end $$;

alter table public.users
  add constraint users_subscription_status_check
  check (subscription_status in (
    'incomplete', 'incomplete_expired', 'trialing', 'active', 'past_due', 'canceled', 'unpaid', 'paused'
  ));
