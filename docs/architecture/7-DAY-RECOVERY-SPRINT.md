# 7-Day Recovery Sprint

## Sprint Charter
- **Goal:** Recover a unified, runnable ERP MVP by eliminating architectural fragmentation without hacks.
- **Principles:** Canonical contracts first, strict multi-tenant safety, no `any`/`@ts-ignore` debt masking.
- **Cadence:** Daily design checkpoint + nightly integration smoke run.

## Day 1
- **Owner:** CTO + Platform Architect
- **Task:** Establish architecture single source of truth and expose hidden compile blind spots.
- **Definition of Done:**
  - `ARCHITECTURE.md` approved.
  - `docs/architecture/canonical-data-contracts.md` approved.
  - `tsconfig.json` exclusion blind spots removed.
  - Baseline `npx tsc --noEmit` error inventory exported for triage.
- **Target Files:**
  - `ARCHITECTURE.md`
  - `docs/architecture/canonical-data-contracts.md`
  - `docs/architecture/7-DAY-RECOVERY-SPRINT.md`
  - `tsconfig.json`

## Day 2
- **Owner:** Domain Architect (Master Data) + API Lead
- **Task:** Canonicalize Items/Suppliers/Product Families contracts and mark legacy adapters.
- **Definition of Done:**
  - Single canonical route family for master-data write/read path.
  - Legacy table usage list mapped to adapter strategy.
  - Unit tests for contract mapping and validation pass.
- **Target Files:**
  - `app/api/master-data/items/route.ts`
  - `app/api/master-data/items/[id]/route.ts`
  - `app/api/master-data/suppliers/route.ts`
  - `app/api/master-data/suppliers/[id]/route.ts`
  - `app/api/master-data/product-families/route.ts`
  - `app/api/master-data/product-families/[id]/route.ts`
  - `lib/erp/master-data-api.ts`

## Day 3
- **Owner:** Workspace Architect + Frontend Lead
- **Task:** Stabilize shell/workspace orchestration and remove render-time navigation side effects.
- **Definition of Done:**
  - No React warning about updating Router during render.
  - Navigation and workspace persistence behavior deterministic under rapid tab actions.
  - Smoke navigation across 10 critical routes without console architecture errors.
- **Target Files:**
  - `components/marker-ofek/workspace/smart-workspace-context.tsx`
  - `components/dashboard-last-visit-tracker.tsx`
  - `components/marker-ofek/workspace/workspace-efficiency-host.tsx`
  - `components/dashboard-shell.tsx`

## Day 4
- **Owner:** Data Architect + Security Engineer
- **Task:** Enforce strict tenant boundaries in DB and API guardrails.
- **Definition of Done:**
  - RLS policy audit completed for canonical modules.
  - Permissive tenant policies replaced with `company_id` and user-scoped checks.
  - Cross-tenant negative test matrix documented and passing.
- **Target Files:**
  - `supabase/migrations/*` (new hardening migration)
  - `lib/erp/master-data-api.ts`
  - `lib/erp/procurement-api.ts`
  - `lib/supabase/middleware.ts`

## Day 5
- **Owner:** Procurement/Projects Domain Leads
- **Task:** Integrate Projects -> BOQ -> Procurement chain on canonical contracts.
- **Definition of Done:**
  - End-to-end flow creates project, planning version/BOQ, and PO on canonical path.
  - No mixed old/new table writes in same flow.
  - Integration test covers happy path and one failure path.
- **Target Files:**
  - `app/actions/projects.ts`
  - `app/api/projects/route.ts`
  - `app/api/projects/[id]/route.ts`
  - `app/api/erp/procurement/purchase-orders/route.ts`
  - `components/marker-ofek/projects-budget-control/*`

## Day 6
- **Owner:** QA Lead + DevOps Engineer
- **Task:** Build local MVP reliability lane (bootstrap, smoke checks, CI parity).
- **Definition of Done:**
  - One documented local bootstrap flow validated on clean machine.
  - Critical smoke scripts pass: auth, dashboard load, items save, PO create.
  - CI check profile aligned with local commands.
- **Target Files:**
  - `docs/MARKER_OFEK_HANDBOOK.md`
  - `.github/workflows/ci.yml`
  - `package.json`

## Day 7
- **Owner:** AI Architect + CTO
- **Task:** Define AI Operations Bus foundation as production architecture (not sidecar feature).
- **Definition of Done:**
  - Event schema + job lifecycle contract documented.
  - First two AI pipelines selected with human-approval gates.
  - Domain ownership and rollout sequence approved for Sprint 2.
- **Target Files:**
  - `ARCHITECTURE.md`
  - `docs/architecture/canonical-data-contracts.md`
  - `lib/marker-ofek/ai/*` (planning notes only in this sprint)
  - `app/api/ocr-invoice/route.ts` (contract reference only in this sprint)

## Daily Non-Negotiable Gates
- `npm run lint`
- `npx tsc --noEmit`
- `npm run test`
- Zero new `@ts-ignore` and zero architectural bypass patches.
