-- =============================================================================
-- Rental911 — Migration 0020: Document Signing Requests
-- Run in the Supabase SQL Editor (Dashboard → SQL Editor → New Query).
-- =============================================================================

create extension if not exists "pgcrypto";

-- Signing requests table
create table if not exists public.signing_requests (
  id              uuid        primary key default gen_random_uuid(),
  token           text        unique not null default encode(gen_random_bytes(32), 'hex'),
  document_title  text        not null,
  pdf_path        text        not null,
  fields          jsonb       not null default '[]'::jsonb,
  signer_name     text        not null,
  signer_email    text        not null,
  status          text        not null check (status in ('pending','signed','expired')) default 'pending',
  signed_pdf_path text,
  created_at      timestamptz not null default now(),
  signed_at       timestamptz,
  expires_at      timestamptz not null default (now() + interval '30 days')
);

-- RLS
alter table public.signing_requests enable row level security;

create policy "Admin manages signing_requests"
  on public.signing_requests
  for all
  to authenticated
  using  (exists (select 1 from public.users where id = auth.uid() and role = 'admin'))
  with check (exists (select 1 from public.users where id = auth.uid() and role = 'admin'));

-- Storage bucket for signing documents (private — API uses signed URLs)
insert into storage.buckets (id, name, public)
values ('signing-documents', 'signing-documents', false)
on conflict (id) do nothing;

-- Storage: service role has full access (all API routes use the admin client)
create policy "Service role manages signing-documents"
  on storage.objects for all
  to service_role
  using (bucket_id = 'signing-documents');
