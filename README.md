# Rental911

Multi-tenant property management for Maryland landlords and tenants — rent,
maintenance, documents, and compliance in one portal.

**Phase 1 (this build): core portal.** Payment flows / Stripe Connect are
intentionally deferred to Phase 2 (see roadmap at the bottom).

- **Framework:** Next.js 14 (App Router) · TypeScript
- **Styling:** Tailwind CSS · Montserrat (display) + Open Sans (body) · 16px minimum font size platform-wide
- **DB + Auth:** Supabase (PostgreSQL + Supabase Auth, RLS enforced)
- **Integrations (clients wired, activated in later phases):** Stripe, Anthropic (maintenance summaries), GoHighLevel (CRM + Calendar), LeaseRunner (screening)
- **Hosting target:** Vercel

---

## 1. Setup

### Prerequisites
- Node 18+ and npm
- A Supabase project

### Install
```bash
npm install
```

> **Supabase package versions are pinned** (`@supabase/supabase-js@2.45.4`,
> `@supabase/ssr@0.5.2`). Newer `postgrest-js` (2.110+) changed its type
> machinery in a way that resolves hand-written `Database` types to `never`.
> Regenerate `types/database.ts` with the Supabase CLI before unpinning.

### Environment
Copy `.env.example` to `.env.local` and fill in real values:
```bash
cp .env.example .env.local
```

| Variable | Required (Phase 1) | Purpose |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ | Public anon key (browser) |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | Service role — **server only** (tenant creation, summaries) |
| `NEXT_PUBLIC_SITE_URL` | ✅ | Base URL for auth redirects |
| `NEXT_PUBLIC_GHL_CRM_URL` | – | Admin sidebar CRM link (defaults to `https://app.gohighlevel.com`) |
| `NEXT_PUBLIC_GHL_ONBOARDING_CALENDAR_EMBED` | – | GHL booking iframe URL for onboarding Step 8 |
| `GHL_API_KEY`, `GHL_LOCATION_ID` | – | GHL CRM sync + Calendar API (Phase 5) |
| `ANTHROPIC_API_KEY`, `ANTHROPIC_SUMMARY_MODEL` | – | Maintenance chat summaries on close (Phase 3) |
| `STRIPE_SECRET_KEY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`, `PLATFORM_FEE_PERCENT` | – | Rent collection (Phase 2) |
| `LEASERUNNER_API_KEY`, `LEASERUNNER_API_BASE` | – | Tenant screening (Phase 5, mocked) |

### Database
In the Supabase SQL Editor, run in order:
1. `supabase/schema.sql` — tables, indexes, the `handle_new_user` auth trigger, RLS helpers, and all RLS policies.
2. `supabase/seed.sql` — test accounts + sample vendor (see the header comment for creating the Auth users first).

### Storage
Create a Storage bucket named **`documents`** (used by landlord + tenant uploads).
Uploads degrade gracefully if it's missing (metadata is still recorded), but a
real bucket is needed for actual files.

### Run
```bash
npm run dev        # http://localhost:3000
npm run typecheck  # tsc --noEmit
npm run build      # production build (needs a few GB of free RAM)
```

---

## 2. Test accounts

Create these in **Supabase → Authentication → Users** (Auto Confirm), then run
`supabase/seed.sql` to set their roles:

| Role | Email |
|---|---|
| Admin (Christine) | `clientcare.vp@gmail.com` |
| Landlord | `testlandlord@example.com` |
| Tenant | `testtenant@example.com` |

New landlords/tenants can also self-register at `/signup`.

---

## 3. Routing & structure

Route groups don't add URL segments, so the brief's literal
`(admin)/dashboard` + `(landlord)/dashboard` would both resolve to `/dashboard`
and collide. Each role portal therefore lives under its own **URL prefix**,
which also lets `middleware.ts` guard by role:

- `/admin/*` — admin only
- `/landlord/*` — landlord only (`/landlord/onboarding` = 8-step wizard)
- `/tenant/*` — tenant only

```
app/
  (auth)/login, signup            auth pages + /auth/callback
  (admin)/admin/...               dashboard, properties, landlords, tenants,
                                  maintenance/[id], compliance, financials
  (landlord)/landlord/
    onboarding/                   8-step wizard (own full-screen layout)
    (portal)/...                  dashboard, properties, tenants,
                                  maintenance/[id], financials (sidebar + banner)
  (tenant)/tenant/...             dashboard, rent, maintenance/new/[id], documents
  api/                            stripe/{webhook,connect}, maintenance/summarize,
                                  ghl/{sync-contact,calendar}, leaserunner/screen
components/ ui · admin · landlord · tenant · maintenance
lib/       supabase · stripe · anthropic · ghl · auth · routes · brand · format
types/database.ts · middleware.ts · supabase/{schema,seed}.sql
```

---

## 4. Phase 1 checklist

| Item | Status |
|---|---|
| All 3 roles can log in | ✅ auth + role-based redirects |
| Admin dashboard colored stat cards with real counts | ✅ navy/gold/red cards, live queries |
| GHL button in admin sidebar → `app.gohighlevel.com` | ✅ gold bg / navy text, new tab, always visible |
| Landlord adds property, unit, tenant via UI | ✅ onboarding + portal add-forms |
| Onboarding wizard: 8 steps in order | ✅ step-gated via `onboarding_step` |
| Step 8 GHL calendar embed | ✅ iframe from `NEXT_PUBLIC_GHL_ONBOARDING_CALENDAR_EMBED` |
| Skipping Step 8 → limited access + banner | ✅ `access_level='limited'` + banner |
| Full access only after Christine toggles | ✅ admin Landlords page toggle → `access_level='full'` |
| Tenant sees unit + lease summary | ✅ tenant dashboard |
| Tenant submits maintenance request | ✅ `/tenant/maintenance/new` |
| Chat thread opens automatically on creation | ✅ system + first message inserted |
| Admin views all requests + updates status | ✅ list + detail + status updater |
| Documents enforce tenant upload scoping (lease_id) | ✅ RLS `docs_tenant_insert` (owner_id = self AND lease = theirs) |
| RLS: landlord can't query another landlord's data | ✅ per-table policies keyed on `auth.uid()` |
| `.env.local` keys documented | ✅ `.env.example` + table above |
| Vercel deploy preview | ⏳ push to GitHub + import to Vercel (env vars above) |

### Verifying RLS
Log in as `testlandlord`, open the browser console, and try to read another
landlord's rows via the anon client — RLS returns an empty set. Policies live in
`supabase/schema.sql` (helpers `is_admin()` / `current_user_role()` are
`SECURITY DEFINER` to avoid recursion on the `users` table).

---

## 5. Notes for later phases
- **Phase 2** — Stripe Connect Express (onboarding Step 6), tenant ACH/card rent, 2.5% platform fee, webhooks, PDF receipts, admin financials.
- **Phase 3** — vendor dispatch, Anthropic summary on close (`claude-sonnet-4-6`), tenant rating flow.
- **Phase 4** — Maryland compliance automation (rental license / lead paint / inspection), P&L + year-end CSV, lease-renewal alerts.
- **Phase 5** — GHL contact sync + Calendar go-live, real LeaseRunner API, full QA, production deploy.

Stub endpoints already return clear "Phase N" responses so nothing silently
no-ops.
