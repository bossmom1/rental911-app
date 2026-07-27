-- =============================================================================
-- Landlord onboarding-fee billing — rebuilt in-app after the old rental911.net
-- Netlify checkout/backend went offline. Three tiers (standard, placement_only,
-- portfolio), first real Stripe Subscription + Stripe Customer this app creates.
-- Idempotent: safe to re-run.
-- =============================================================================

alter table public.users add column if not exists stripe_subscription_id text;
alter table public.users add column if not exists subscription_status text
  check (subscription_status in ('active', 'trialing', 'past_due', 'canceled', 'unpaid'));
alter table public.users add column if not exists onboarding_fee_status text default 'not_started'
  check (onboarding_fee_status in ('not_started', 'pending_payment', 'paid'));

create table if not exists public.landlord_onboarding_payments (
  id uuid primary key default gen_random_uuid(),
  landlord_id uuid references public.users(id) not null,
  tier text not null check (tier in ('standard', 'placement_only', 'portfolio')),
  billing_option text check (billing_option in ('monthly', 'quarterly')),
  portfolio_service_model text check (portfolio_service_model in ('rental911_portal', 'external_system')),
  total_units integer not null default 1,
  onboarding_fee_cents integer not null,
  subscription_unit_price_cents integer,
  elite_addon_services text[] not null default '{}',
  elite_addon_total_cents integer not null default 0,
  activate_now boolean not null default false,
  amount_charged_today_cents integer not null,
  stripe_checkout_session_id text,
  stripe_customer_id text,
  stripe_subscription_id text,
  status text not null default 'pending' check (status in ('pending', 'paid', 'expired', 'canceled')),
  created_at timestamptz default now(),
  paid_at timestamptz
);
create index if not exists idx_landlord_onboarding_payments_landlord on public.landlord_onboarding_payments(landlord_id);

alter table public.landlord_onboarding_payments enable row level security;

drop policy if exists landlord_onboarding_payments_admin_all on public.landlord_onboarding_payments;
create policy landlord_onboarding_payments_admin_all on public.landlord_onboarding_payments
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists landlord_onboarding_payments_landlord_read on public.landlord_onboarding_payments;
create policy landlord_onboarding_payments_landlord_read on public.landlord_onboarding_payments
  for select using (landlord_id = auth.uid());
