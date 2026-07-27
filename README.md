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
| `NEXT_PUBLIC_GHL_ONBOARDING_CALENDAR_EMBED` | – | GHL booking iframe URL for onboarding Step 9 |
| `GHL_API_KEY`, `GHL_LOCATION_ID` | – | GHL CRM sync + Calendar API (Phase 5) |
| `GHL_ONBOARDING_WORKFLOW_ID` | – | Workflow to enroll a landlord's GHL contact in after their onboarding fee is paid (Step 8) — optional, silently no-ops if unset |
| `ANTHROPIC_API_KEY`, `ANTHROPIC_SUMMARY_MODEL` | – | Maintenance chat summaries on close (Phase 3) |
| `STRIPE_SECRET_KEY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`, `PLATFORM_FEE_PERCENT` | – | Rent collection (Phase 2) |
| `STRIPE_MEMBERSHIP_WEBHOOK_SECRET` | – | Separate, account-scoped (not Connect) webhook endpoint for vendor marketplace membership Checkout Sessions (see `app/api/stripe/webhook-vendor-membership`) |
| `STRIPE_ONBOARDING_WEBHOOK_SECRET` | – | Separate, account-scoped (not Connect) webhook endpoint for landlord onboarding-fee Checkout Sessions + subscription updates (see `app/api/stripe/webhook-landlord-onboarding`) |
| `LEASERUNNER_API_KEY`, `LEASERUNNER_API_BASE` | – | Tenant screening (Phase 5, mocked) |
| `RESEND_API_KEY`, `RECEIPT_FROM_EMAIL`, `ALERTS_FROM_EMAIL` | – | Transactional email — receipts (Phase 2), compliance + lease renewal alerts (Phase 4) |
| `CRON_SECRET` | – | Verifies Vercel Cron requests to `/api/cron/*` (Phase 4) |
| `AFC_REALTOR_EMAIL`, `AFC_REALTOR_PASSWORD` | – | Server-only AFC Home Club realtor login for warranty/claim invoice automation (see `lib/afc.ts`) |
| `NEXT_PUBLIC_AFC_HOME_CLUB_URL` | – | Admin sidebar AFC Home Club manual-login shortcut (defaults to `https://afchomeclub.com/realtor/invoice`) |

### Database
In the Supabase SQL Editor, run in order:
1. `supabase/schema.sql` — tables, indexes, the `handle_new_user` auth trigger, RLS helpers, and all RLS policies.
2. Everything in `supabase/migrations/`, in filename order (`0001_...` through the highest-numbered file) — each is idempotent (safe to re-run).
3. `supabase/seed.sql` — test accounts + sample vendor (see the header comment for creating the Auth users first).

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
                                  maintenance/[id], compliance/[propertyId], financials
  (landlord)/landlord/
    onboarding/                   8-step wizard (own full-screen layout)
    (portal)/...                  dashboard, properties, tenants/[leaseId],
                                  maintenance/[id], financials, financials/{reports,export}
  (tenant)/tenant/...             dashboard, rent, maintenance/new/[id], documents
  api/                            stripe/{webhook,connect}, maintenance/summarize,
                                  ghl/{sync-contact,calendar}, leaserunner/screen,
                                  cron/{compliance-check,lease-renewal-check},
                                  financials/{pnl-pdf,tax-export}, lease-renewals/[id]/pdf
components/ ui · admin · landlord · tenant · maintenance
lib/       supabase · stripe · anthropic · ghl · auth · routes · brand · format ·
           compliance · esignature · financials · pnl · pnl-pdf · lease-pdf · csv
types/database.ts · middleware.ts · vercel.json (crons) · supabase/{schema,seed}.sql
```

---

## 4. Phase 1 checklist

| Item | Status |
|---|---|
| All 3 roles can log in | ✅ auth + role-based redirects |
| Admin dashboard colored stat cards with real counts | ✅ navy/gold/red cards, live queries |
| GHL button in admin sidebar → `app.gohighlevel.com` | ✅ gold bg / navy text, new tab, always visible |
| Landlord adds property, unit, tenant via UI | ✅ onboarding + portal add-forms |
| Onboarding wizard: 9 steps in order | ✅ step-gated via `onboarding_step` |
| Step 8: onboarding-fee billing (Standard/Placement Only/Portfolio tiers, real Stripe Subscription) | ✅ `components/landlord/OnboardingFeeStep.tsx`, `lib/landlord-onboarding.ts`, migration `0016` |
| Step 9 GHL calendar embed | ✅ iframe from `NEXT_PUBLIC_GHL_ONBOARDING_CALENDAR_EMBED` |
| Skipping Step 9 → limited access + banner | ✅ `access_level='limited'` + banner |
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

## 5. Phase 3 checklist

| Item | Status |
|---|---|
| Vendor management (admin-only): vetting/compliance fields, license + membership status, `/admin/vendors` add/edit/deactivate | ✅ `app/(admin)/admin/vendors/*`, migration `0008` |
| Starter vendor network seeded (plumbing, electrical, HVAC) | ✅ idempotent seed in migration `0008` |
| Split dispatch: tenant self-dispatch (Path A) for non-emergency requests | ✅ `TenantDispatchPanel` → `selfDispatchVendor` |
| Split dispatch: admin-mediated (Path B) for emergency requests | ✅ `AdminDispatchPanel` → `adminDispatchVendor` |
| Both paths confirmation-based (no accept/decline) | ✅ `vendor_response`: pending/confirmed/no_response |
| Vendor notified via GHL SMS + email with public confirmation link | ✅ `lib/dispatch.ts`, `lib/ghl.ts` |
| Public, unauthenticated vendor confirmation page + API | ✅ `/vendor/confirm/[id]`, `/api/vendor-dispatch/[id]/confirm` |
| Tenant can log the confirmed date once agreed with vendor | ✅ `confirmScheduledDateAsTenant` |
| AI chat summary generated on close (non-blocking) | ✅ `StatusUpdater` → `/api/maintenance/summarize` (Anthropic) |
| Tenant post-completion rating (1–5 stars + feedback) | ✅ `RatingPanel` → `rateDispatch`, locks after submit |
| Vendor stats (jobs dispatched, completion rate, avg rating ≥3 ratings) | ✅ `/admin/vendors`, aggregated from `vendor_dispatches` |
| Status badges match spec hex exactly (open/in_progress/vendor_assigned/completed/closed) | ✅ verified against live computed styles in production |
| Live-computed vendor lapsed/overdue checks (no cron in this app) | ✅ `lib/vendors.ts`: `isVendorLapsed`, `isDispatchOverdue` |
| Vendor marketplace membership billing: admin-only one-time Stripe Checkout charge per quarter ($199/mo, $597/quarter), Copy Link workflow, renewal reminder | ✅ `app/(admin)/admin/vendors/[vendorId]/*`, `app/api/stripe/webhook-vendor-membership`, migration `0015` |

### Verifying Phase 3
Both dispatch paths, the public confirmation endpoint, the rating flow, AI
summary generation, and badge colors were exercised live under real
authenticated tenant/admin/landlord browser sessions (not service-role) on
2026-07-23. Two real bugs surfaced this way and are already fixed and
redeployed: `fmtDate()` shifted date-only fields (scheduled/due/expiry dates)
back a day for viewers west of UTC, and `vendor_dispatches.completion_confirmed`
was never being set, so the vendor completion-rate stat was stuck at 0%
(fixed in `StatusUpdater`, plus a new landlord update policy in migration
`0009`).

---

## 6. Phase 4 checklist

| Item | Status |
|---|---|
| Admin compliance dashboard: all properties, status badges, county/status filters, click-into full checklist | ✅ `/admin/compliance`, `/admin/compliance/[propertyId]` |
| Red stat card counts items expiring ≤30 days, links to the dashboard | ✅ `app/(admin)/admin/dashboard/page.tsx` |
| County-specific compliance items auto-created on property add | ✅ `lib/compliance.ts` `createComplianceItems`, wired into both `addProperty` and onboarding's `saveProperty` |
| Lead paint disclosure + cert only for pre-1978 (`lead_paint_required`) properties | ✅ |
| Prince George's DPIE license replaces the base state license; Tenant Bill of Rights item added | ✅ (confirmed reading of ambiguous spec wording) |
| Charles County gets its own county license, smoke/CO cert, and a distinct lead-paint inspection cert | ✅ |
| St. Mary's County gets a county registration item | ✅ |
| Daily cron flips expiring/expired status, emails landlords | ✅ `flip_compliance_statuses()` (migration `0010`) + `/api/cron/compliance-check` |
| Landlord dashboard shows live compliance + lease-renewal alert banners | ✅ `components/landlord/AlertBanners.tsx` |
| Lease renewal alert fires 60 days before `end_date`, once per lease | ✅ `/api/cron/lease-renewal-check`, guarded by `renewal_alert_sent` |
| Renew option: draft lease PDF from template + terms, landlord-only review before any tenant contact | ✅ `lease_renewals` table (`draft_review`), `lib/lease-pdf.tsx`, `/landlord/tenants/[leaseId]` |
| Landlord approval sends a placeholder tenant copy via a single swappable function | ✅ `lib/esignature.ts` `sendLeaseForSignature()` |
| "Mark as Signed" creates the new lease, expires the old one, stores the signed copy in `documents` | ✅ `markRenewalSigned` |
| No LeaseRunner lease-generation call anywhere — LeaseRunner remains screening-only | ✅ verified, `lib/lease-pdf.tsx` is fully independent of `app/api/leaserunner/*` |
| Month-to-month and turnover options, with a minimal move-out checklist on turnover | ✅ `leases.is_month_to_month`, `move_out_checklists` table |
| P&L report: Month/Quarter/Year toggle (Month default), per-property → per-unit breakdown, PDF download | ✅ `/landlord/financials/reports`, `lib/pnl.ts`, `lib/pnl-pdf.tsx` |
| P&L has no platform-fee line — Net to Landlord equals Rent Collected under this schema | ✅ commented in `lib/pnl.ts` |
| Year-end CSV export (landlord + admin, no platform-fee column) | ✅ `/landlord/financials/export`, admin section on `/admin/financials`, shared `/api/financials/tax-export` (RLS scopes the audience) |

### Deploying Phase 4
This project's Vercel deployment has **no connected Git repository** — a
`git push` alone does not ship anything, including the new `vercel.json` cron
schedule. After running migration `0010` and setting `CRON_SECRET` /
`RESEND_API_KEY` (etc.) in the Vercel project's env vars, deploy with
`npx vercel --prod` from this directory.

---

## 7. Notes for later phases
- **Phase 2** — Stripe Connect Express (onboarding Step 6), tenant ACH/card rent, 2.5% platform fee, webhooks, PDF receipts, admin financials.
- **Phase 5** — GHL contact sync + Calendar go-live, real LeaseRunner API and e-signature provider (swap into `lib/esignature.ts`), Christine's real lease template (swap into `lib/lease-pdf.tsx`), full QA, production deploy.

Stub endpoints already return clear "Phase N" responses so nothing silently
no-ops.
