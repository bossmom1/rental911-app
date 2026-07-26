-- =============================================================================
-- Vendor marketplace membership billing — admin-triggered, one-time Stripe
-- Checkout charge per quarter (not a subscription). Widens vendors.membership_status
-- from ('active','expired','pending') to ('not_started','pending_payment','active',
-- 'expired') and adds a per-charge ledger table (vendor_membership_payments).
-- Idempotent: safe to re-run.
-- =============================================================================

-- ---- vendors: pricing-reference column ---------------------------------------
alter table public.vendors add column if not exists membership_price_cents integer default 19900;

-- ---- vendors.membership_status: widen vocabulary ------------------------------
-- Drop the OLD constraint (in ('active','expired','pending'), from migration
-- 0008) FIRST — it must not still be attached when the backfill UPDATE below
-- writes 'not_started', or that UPDATE itself violates it.
do $$
declare
  con record;
begin
  for con in
    select pc.conname
    from pg_constraint pc
    join pg_class rel on rel.oid = pc.conrelid
    join pg_attribute att on att.attrelid = rel.oid and att.attnum = any(pc.conkey)
    where rel.relname = 'vendors'
      and att.attname = 'membership_status'
      and pc.contype = 'c'
  loop
    execute format('alter table public.vendors drop constraint %I', con.conname);
  end loop;
end $$;

-- Now safe: no check constraint is attached to membership_status yet.
update public.vendors set membership_status = 'not_started'
  where membership_status = 'pending' or membership_status is null;

alter table public.vendors
  add constraint vendors_membership_status_check
  check (membership_status in ('not_started', 'pending_payment', 'active', 'expired'));
alter table public.vendors alter column membership_status set default 'not_started';

-- ---- vendor_membership_payments: one row per quarter billed -------------------
create table if not exists public.vendor_membership_payments (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid references public.vendors(id) not null,
  amount_cents integer not null default 59700,
  stripe_checkout_session_id text,
  stripe_payment_intent_id text,
  status text not null default 'pending'
    check (status in ('pending', 'paid', 'expired', 'canceled')),
  period_start date,
  period_end date,
  created_at timestamptz default now(),
  paid_at timestamptz
);
create index if not exists idx_vendor_membership_payments_vendor on public.vendor_membership_payments(vendor_id);

alter table public.vendor_membership_payments enable row level security;

drop policy if exists vendor_membership_payments_admin_all on public.vendor_membership_payments;
create policy vendor_membership_payments_admin_all on public.vendor_membership_payments
  for all using (public.is_admin()) with check (public.is_admin());
