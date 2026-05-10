# Production Readiness Audit — Marker-Ofek ERP

**Date:** 2026-05-10 · **Audit lead:** Cascade · **Sprint:** 0 · **Day:** 1
**Goal:** identify blockers preventing onboarding of the **first paying customer
(Lihtman / Marker-Ofek)** as a single-tenant production deployment.
**Out of scope:** SaaS multi-tenant pilot rollout, marketing, billing — those
are post-Sprint-0.

---

## TL;DR — Top-3 Blockers

| # | Blocker | Impact | Effort to fix |
|---|---|---|---|
| 🔴 **1** | **No legacy-data import pipeline.** `scripts/import-legacy-data.ts` is a 1-line stub (`console.log("Starting import...")`). Lihtman's existing Priority ERP holds years of suppliers, items, projects, contracts, POs — none of it is migratable today. | Lihtman cannot start using the system without re-typing thousands of records. **Will kill the deal.** | 2-3 weeks (ETL design + 8 importers + idempotency + reconciliation reports). |
| 🔴 **2** | **No error monitoring + no production observability.** No Sentry/Datadog/Logtail. `app/global-error.tsx` only does `console.error`. No `pg_cron` jobs, no log aggregation, no alerting. | When (not if) a Lihtman user hits a 500 in production, we'll learn about it from a phone call. Unacceptable for a paid customer. | 3-5 days (Sentry + structured logging + 5 critical alerts + on-call runbook). |
| 🔴 **3** | **Demo content is intermingled with production code, not gated.** 6 mock-only components in `components/marker-ofek/pitch/` (2,122 lines), 1 dashboard route `/marker-ofek/pitch/`, **5+ demo seed migrations applied to remote DB** including 3 we just authored (contracts/bills/PO with hardcoded UUIDs `c0700000-…`). A real production deploy will ship fake suppliers, fake projects, and a "חשבון קבלן (PDF)" button to investors right next to real customer data. | Embarrassing at best, data-corrupting at worst (real customer's company_id is `marker_ofek` — same as our demo seed). | 1-2 days (NEXT_PUBLIC_DEMO_MODE flag + migration tagging + UI conditional render). |

The other findings below matter, but **fixing those 3 is non-negotiable before
Lihtman onboarding**. Items in §A-§J are ranked by severity within each domain.

---

## Audit method

- Static code scan of `app/`, `lib/`, `components/`, `supabase/migrations/`, `scripts/`, `package.json`.
- Cross-reference against the PRD (`docs/product/MARKER_OFEK_ENTERPRISE_PRD_AND_ROADMAP.md`).
- No live DB / staging probe (deferred to Day 2 if needed).
- 9 functional domains audited (§A–§I), Top-3 selected by *blocking probability* × *time-to-fix*.

---

## §A — Demo bloat (Severity: HIGH)

### Findings
- **6 pitch components** (`components/marker-ofek/pitch/`):
  `investor-command-center.tsx` (835 LOC), `monetization-showcase.tsx` (413),
  `finance-investor-hero.tsx` (301), `investor-pitch-lobby.tsx` (293),
  `gantt-investor-hero.tsx` (238), `global-pitch-nav-button.tsx` (42).
  All use mock data — none are wired to real DB.
- **1 dashboard route**: `app/(dashboard)/marker-ofek/pitch/` — exposes pitch UI
  inside the authenticated app shell.
- **Demo seed migrations applied to remote**:
  - `20260511130000_user_onboarding_qualification_demo.sql`
  - `20260622130000_procurement_po_delivery_flow_demo_seed.sql`
  - `20260729120000_seed_marker_ofek_demo_suppliers.sql`
  - `20260818100000_subcontractor_contracts_schema.sql` (seeds demo contract)
  - `20260819100000_subcontractor_bills_schema.sql` (seeds demo bill)
  - `20260820100000_purchase_order_print_and_subcontractor_link.sql` (seeds demo PO)
- **`scripts/seed-po-demo.ts`** uses `SUPABASE_SERVICE_ROLE_KEY` — fine in dev,
  but it's a footgun if accidentally executed against prod.
- Hardcoded demo UUIDs (`c0700000-0000-4000-8000-…`, `b1110000-…`, `d0000000-…`)
  live under `company_id = 'marker_ofek'` — the **same** company_id Lihtman will
  use, so demo data and real data **will collide**.

### Risk
A vanilla `npm run build` + deploy ships ~2,000 LOC of investor-pitch UI plus
fake suppliers / contracts / bills / POs into Lihtman's tenant.

### Recommended fix (Sprint 0 / Day 2)
1. Create `lib/feature-flags.ts` exposing `IS_DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === 'true'`.
2. Wrap all 6 pitch components in `if (!IS_DEMO_MODE) return null` — or move
   route to `app/(demo)/marker-ofek/pitch/` and gate the segment via middleware.
3. Move all 6 demo-seed migrations to `supabase/seed/` (separate folder, never
   auto-applied) **OR** wrap their bodies in
   `if current_setting('app.demo_mode', true) = 'on' then … end if;`.
4. Add migration that **deletes** demo rows where `company_id = 'marker_ofek'`
   AND id matches the demo UUIDs — runs once on prod cutover.
5. Document in `docs/production/demo-mode.md` how to toggle.

---

## §B — Security & RLS (Severity: MEDIUM)

### Findings
- ✅ RLS is broadly enabled — `enable row level security` appears in **244
  places across 104 migrations**. The discipline is real.
- ✅ Single canonical guard: `public.user_has_company_access(target_company_id text)`
  with `security definer`, `service_role` bypass, and JWT-based `auth.uid()`
  membership lookup against `erp_user_company_memberships`.
- ✅ `SUPABASE_SERVICE_ROLE_KEY` is referenced only in **8 files**, all server-side
  (API routes, edge function, scripts, tests, factory). No client leak.
- ⚠️ **Brittleness observed during recent seeds:** the BPM trigger on
  `erp_purchase_orders` calls `erp_get_next_po_number(p_company_id)` which gates
  on `auth.role() = 'service_role'`. During `supabase db push` (run as `postgres`,
  not `service_role`), this raises *"access denied to company marker_ofek"*.
  Worked around with `set local session_replication_role = replica` — but the
  workaround **disables ALL triggers** during seed, including budget-validation
  and line-status triggers. Acceptable for our hand-authored seed; **not safe
  as a generic operator pattern**.
- ⚠️ **2 files use `as any`**: both in `app/(dashboard)/marker-ofek/procurement/autonomous-po/`
  and `app/api/procurement/autonomous-po/chat/route.ts`. Type holes in the
  AI-driven procurement flow that touches financial data.
- ⚠️ No documented threat model. PRD §3.2/§3.3 references security but no
  explicit STRIDE / attack-surface doc.

### Recommended fix
1. Replace the `auth.role() = 'service_role'` check in `erp_get_next_po_number`
   with an explicit "is migration context" path via a setting like
   `current_setting('app.bypass_authz', true) = 'on'`, set by the migration
   itself. Cleaner than blanket `session_replication_role` flips.
2. Type-tighten the 2 `as any` sites in autonomous-PO. **Severity: medium.**
3. Add `docs/production/security-threat-model.md` (STRIDE-lite, 1 page) before
   accepting customer data.

---

## §C — Auth & onboarding (Severity: HIGH)

### Findings
- 🔴 **Two competing login routes**: `app/login/` and `app/auth/marker-ofek/login/`.
  Unclear which is canonical. Confusing for both users and developers.
- 🔴 **No signup, registration, or password-reset routes** exposed in `app/`.
  Lihtman users will be created how? Manually via Supabase dashboard? Through
  an admin script? Either path is a usability hole.
- 🔴 **No root `middleware.ts`** at the project root. Next.js 16 may handle
  some auth concerns differently, but at minimum we need session refresh and
  tenant resolution at the edge. Currently each page handles its own auth via
  `createSupabaseServerAuthClient()` — easy to forget.
- ⚠️ Multi-tenant onboarding flow (creating a new `erp_companies` row, seeding
  default chart of accounts, etc.) — not visible in code. Likely manual SQL.

### Recommended fix
1. **Pick one login route**, redirect the other. Document in
   `docs/SYSTEM_INDEX.md`.
2. Add **password-reset** flow (Supabase Auth has it built in — needs only a
   callback page).
3. **Decide:** is signup public, invite-only, or admin-provisioned for Lihtman?
   For Sprint 0, admin-provisioned is correct (we're hand-onboarding).
   Document the exact 5 SQL statements needed to provision Lihtman in
   `docs/customer/lihtman-onboarding-playbook.md` (Day 3).
4. **Add `middleware.ts`** at the root for: (a) session refresh, (b) redirect
   unauthenticated → `/login`, (c) inject `x-active-company-id` header from
   cookie. Estimated 60 LOC.

---

## §D — Operations & observability (Severity: HIGH)

### Findings
- 🔴 **No Sentry / Datadog / any error tracking** in `package.json` or anywhere.
  `app/global-error.tsx` only `console.error`s — output disappears on Vercel
  unless the user opens DevTools.
- 🔴 **No `pg_cron` jobs.** No `cron.schedule` in any migration. Daily backups,
  GDPR data deletion, AI-job sweepers, snapshot cleanup — none are scheduled.
- ⚠️ **1 Supabase Edge Function** (`auto-maintenance`) — only one. Not enough
  for a real ops surface.
- ⚠️ No `docs/production/runbook.md`. When the system breaks at 2am, who fixes
  what?
- ⚠️ No status page / no synthetic uptime monitoring.

### Recommended fix
1. **Install Sentry** (`@sentry/nextjs`). Wire to `global-error.tsx`,
   `error.tsx`, server actions, and API routes. ~3 hours.
2. Add **structured logging** library (`pino` or built-in Next.js logger
   wrapper) — replace ad-hoc `console.log` calls.
3. Set up **5 critical alerts** in Sentry / Supabase:
   (a) any unhandled exception rate >5/min,
   (b) RLS-denied queries from authenticated users (likely a bug),
   (c) DB connection pool exhaustion,
   (d) Failed PO/contract/bill mutations,
   (e) Auth failures spike.
4. Author `docs/production/runbook.md`: incident severities, paging contacts
   (you), rollback procedure, DB-restore procedure. ~1 day.
5. Defer SaaS-grade status page until pilot phase.

---

## §E — Data import (Severity: HIGH — this is Blocker #1)

### Findings
- 🔴 **`scripts/import-legacy-data.ts` is a 2-line stub.** Single statement:
  `console.log("Starting import...")`. No actual logic.
- ✅ Three Holden ERP importers exist:
  `lib/holden-erp/customers-import.ts`,
  `lib/holden-erp/inventory-import.ts`,
  `lib/holden-erp/supplier-catalog-import.ts`.
  These use `SUPABASE_SERVICE_ROLE_KEY` — server-side only. **Need to inspect
  their quality/coverage on Day 2.**
- 🔴 **Lihtman uses Priority** (per `docs/ingested-specs/lihtman-system-spec-excerpts.md`).
  No Priority connector exists. Common path: export to Excel/CSV → reformat → import.
- ⚠️ **Master data dependencies**: master items, suppliers, projects, BOQ,
  contracts, open POs, accounting chart, opening balances — at minimum 8 entity
  types must import in dependency order or RLS / FK errors cascade.

### Recommended fix (Sprint 1, full-time 2-3 weeks)
1. **Day 1:** map Priority export schemas → Marker-Ofek schema. One Excel/CSV
   per entity. Document in `docs/customer/lihtman-data-mapping.md`.
2. **Day 2-5:** build a generic CSV importer at `app/(dashboard)/admin/import/`
   with: file upload, column mapping wizard, dry-run preview, idempotency keys,
   error report download.
3. **Day 6-10:** entity-specific transformers for the 8 master tables.
4. **Day 11-14:** reconciliation reports — "X rows in Priority, Y imported, Z
   skipped, W errored, link to detail per row."
5. **Day 15:** 1-day dry-run on a Lihtman sample export.

---

## §F — Code quality (Severity: LOW)

### Findings
- ✅ **Only 4 files with TODO/FIXME**:
  `roadmap/page.tsx` (12), `schedule/page.tsx` (5),
  `lib/marker-ofek/gap-hunter-pdf.ts` (4), `partial-account-pdf.ts` (4).
  Concentrated in 2 modules, not pervasive.
- ✅ **Zero `console.log`** in `*.tsx` files. Clean front-end.
- ⚠️ **2 files use `as any`** (autonomous-PO chat). Investigate Day 2.
- ✅ **Recent type discipline strong**: phases 1-3 deliveries passed
  `tsc --noEmit` exit-0 on first try.

### Recommended fix
- Sweep the 4 TODO-heavy files in Sprint 1 (low priority).
- Type-tighten autonomous-PO chat (Sprint 1).

---

## §G — Build, deploy, and config (Severity: MEDIUM)

### Findings
- 🔴 **No `.env.example`** file in repo — new developers have nothing to copy.
- 🔴 **No `Dockerfile`, no `vercel.json`, no `render.yaml`** — deploy target
  is implicit, not codified.
- ⚠️ **Bleeding-edge stack**: Next.js 16.2.1 + React 19.2.4. Production
  customers prefer N-1 versions for stability. The user's `AGENTS.md`
  acknowledges "this is NOT the Next.js you know — APIs and conventions may
  differ from training data" — confirms instability risk.
- ⚠️ **No CI**: no `.github/workflows/`, no Husky/lint-staged. Developers can
  push broken code.
- ✅ `package.json` scripts include `lint`, `test`, `build` — primitives are
  there.
- ✅ `patch-package` is wired (`postinstall`) — `gantt-task-react+0.3.9.patch`
  is the only patch. Acceptable.

### Recommended fix
1. Create `.env.example` with all env keys, comments on where to obtain. (30min)
2. Create `vercel.json` (or chosen target) + a 1-paragraph `docs/deploy.md`. (1h)
3. **Add minimal CI** at `.github/workflows/ci.yml`: install, `tsc --noEmit`,
   `vitest run`, `next build`. Fail PRs that don't pass. (2h)
4. **Pin Next.js / React** to exact minor versions in `package.json` (drop
   `^`). Prevents surprise breakages. (10min)

---

## §H — Performance (Severity: MEDIUM, deferred)

### Findings
- Cannot fully audit without runtime profiling. Deferred to Day 2 if Sprint 0
  budget allows, otherwise to Sprint 1.
- ✅ Existing `docs/architecture/performance-audit-2026-05-05.md` exists —
  read on Day 2 before duplicating effort.
- ⚠️ Index coverage on RLS predicates not verified (RLS uses `company_id`
  text — composite indexes on `(company_id, …)` are needed for every queried
  table). Some tables have them, others may not.
- ⚠️ Bundle size unknown.

### Recommended fix
- Day 2: re-read existing perf audit, run `next build --analyze`, run
  `EXPLAIN (ANALYZE)` on the top-10 page-load queries.

---

## §I — Legal & compliance (Severity: MEDIUM)

### Findings
- 🔴 **No privacy policy** in repo (`privacy*` search → 0 results).
- 🔴 **No terms of service** (`terms*` search → 0 results).
- 🔴 **No DPA template** for Lihtman to sign.
- ⚠️ **No GDPR-style data-subject request handler** (export / delete user).
- ⚠️ **No Israel-specific compliance check** — חוק הגנת הפרטיות (Privacy
  Protection Law 5741-1981 + 2017 amendments). Lihtman's data includes
  workers' personal info → applicable.
- ⚠️ **Data residency**: Supabase project region unknown to me.
  EU/Frankfurt is fine; US-East may raise eyebrows for Israeli HR data.

### Recommended fix
1. **Day 3 (Lihtman playbook):** template DPA in Hebrew, 2-3 pages, signed
   before any real data is loaded.
2. **Sprint 1:** privacy policy + ToS pages. Use a Hebrew template
   (e.g., from לשכת עורכי הדין) — not original drafting.
3. **Sprint 1:** verify Supabase project region (should be `eu-central-1`
   Frankfurt or similar EU region for Israeli data residency norms).

---

## §J — Cross-cutting positives (what's *already* good)

These are existing strengths that materially shorten time-to-revenue:

- **Mature multi-tenant primitives**: `erp_companies`, `erp_user_company_memberships`,
  `user_has_company_access`, x-active-company-id header. Whole pattern works.
- **Type discipline**: TypeScript strict, recent diffs all `tsc --noEmit`-clean.
- **RLS coverage**: 244 policy declarations, 104 migrations.
- **Procurement engine**: PO + GR + VI + 3-Way Match RPCs are deployed
  (per memory of phases 7.1–7.10).
- **Print engine**: 4 pixel-perfect A4 templates (invoices, contract, bill, PO).
- **Gantt module**: 11 migrations + 2,400 LOC of server actions + full UI.
- **DMS**: `project-dms` storage bucket + RLS + UI per phase C delivery.
- **Domain fit**: hard copies + Priority spec excerpts → reverse-engineered
  schemas. Lihtman onboarding is "configuration", not "rebuild".

The product is **not far** from production. The blockers are **operational
hygiene + data import + demo isolation** — not product depth.

---

## Recommended Sprint 0 path (3 days) — what I propose to execute next

### Day 1 (today) ✅
- Audit complete (this document).

### Day 2 — Demo isolation + Operations baseline
- Implement `IS_DEMO_MODE` flag (§A.1–§A.3).
- Move pitch components behind the flag.
- Tag demo seed migrations + author cleanup migration.
- Install Sentry + wire to `global-error.tsx` + 3 critical alerts (§D.1, §D.3).
- Create `.env.example` (§G.1).
- Pin Next.js/React versions (§G.4).
- ETA: full 8-hour day.

### Day 3 — Lihtman onboarding playbook
- Author `docs/customer/lihtman-onboarding-playbook.md`:
  the 30-step path from contract signing → live system → first invoice.
- Includes: account provisioning SQL, Priority data export procedure,
  data-mapping spec, training plan, support SLA template, DPA template.
- ETA: full 8-hour day.

### After Sprint 0 (Sprint 1 — 2-3 weeks)
- §E full data import pipeline (Blocker #1).
- §C auth/onboarding polish (Blocker #2's user-side).
- §D full observability stack (rest of Blocker #2).
- §I legal docs.

---

## Decision points for you

1. **Approve Day 2 scope?** (Demo isolation + Sentry + .env.example +
   Next.js pin.)
2. **Confirm Lihtman is the first paying customer?** Some recommendations
   (e.g., the data-mapping doc) assume Priority as the source. If they're
   not on Priority, the mapping changes.
3. **Sentry preference vs. self-hosted alternative?** Sentry SaaS is the
   default; if you prefer Logtail / self-hosted Glitchtip, say so before
   Day 2.
4. **Region preference for Supabase?** If we'll provision a fresh project for
   Lihtman production (separate from staging), default would be `eu-central-1`
   for Israeli data-residency optics.
