# Deployment Bible

## Purpose

This document defines the production release standard for Smart Building OS.
No release is approved unless all gates pass in order, with explicit ownership and evidence.

## Release Principles

- **Fail-closed tenancy first:** every data path must enforce `company_id` ownership and server-side scope checks.
- **Single source of truth:** canonical domains (master data, procurement, finance, execution) are served from canonical APIs/tables only.
- **Evidence-driven releases:** each gate requires objective artifacts (logs, screenshots, CI output, checklists).
- **No gate skipping:** issues in one gate block all downstream gates.

## Ownership Model

### RACI baseline

- **Engineering Owner (Responsible):** implements code, schema changes, tests, and release notes.
- **Domain Architect (Accountable):** validates canonical contract and tenancy posture.
- **QA Owner (Responsible):** executes functional smoke/UAT matrix and signs off.
- **Platform/DevOps Owner (Responsible):** deployment pipeline, runtime observability, rollback readiness.
- **Security/Data Reviewer (Consulted):** verifies RLS/policy posture and sensitive-path compliance.

### Double-Filtering Standard

Every tenant-scoped operation must satisfy both layers:

1. **Application filter:** explicit `.eq("company_id", activeCompanyId)` (or equivalent) in every query/mutation.
2. **Database policy filter:** RLS policy enforcing `user_has_company_access(company_id)` (or stronger).

Release is blocked if either layer is missing on any write path.

## Release Gates (Mandatory Sequence)

## Gate 1 - DB Schema & RLS Readiness

**Objective:** database is structurally ready and tenant-safe.

Checklist:

- [ ] All required migrations are merged, reviewed, and idempotent.
- [ ] Canonical tables/columns exist for release scope (no legacy fallback dependency).
- [ ] RLS enabled on all tenant-owned tables.
- [ ] RLS `USING` and `WITH CHECK` policies validated for authenticated and service paths.
- [ ] Backfill scripts/runbooks prepared and tested (if migration includes data movement).
- [ ] Rollback plan documented (schema-safe and data-safe).

Evidence:

- Migration diff + apply logs.
- RLS policy verification output.
- Backfill dry-run/output sample.

Exit criteria:

- Zero pending schema blockers.
- Zero unresolved RLS gaps.

## Gate 2 - Code Readiness (ERP Resilience)

**Objective:** code paths are canonical, stable, and resilient to runtime failures.

Checklist:

- [ ] All feature paths use canonical APIs/actions/tables only.
- [ ] No direct reads/writes to deprecated tables in release scope.
- [ ] All tenant writes enforce fail-closed `company_id` context.
- [ ] Loading states implemented for async UX-critical views.
- [ ] Error states implemented with actionable UX copy and graceful fallback.
- [ ] Empty states and permission-denied states covered for key screens.
- [ ] No `any`/`@ts-ignore` in release-diff unless explicitly approved and tracked.

Evidence:

- Code diff references.
- Screen captures of loading/error/empty states.
- Static search report proving deprecated table references removed in target UI/server paths.

Exit criteria:

- Code review sign-off from Engineering + Architect.
- No unresolved resilience gaps.

## Gate 3 - Build Validation

**Objective:** deterministic build and static quality are green.

Checklist:

- [ ] `npx tsc --noEmit` passes.
- [ ] Lint checks pass for changed scope.
- [ ] Build command passes in clean environment.
- [ ] Critical tests pass (unit/integration/e2e as defined per domain).
- [ ] Bundle/runtime warnings triaged; blocking warnings resolved.

Evidence:

- CI run URL/log export.
- Test report summary.
- Build artifact checksum/version.

Exit criteria:

- Green CI status for release branch/tag.

## Gate 4 - Cloud Deployment

**Objective:** controlled, traceable rollout with rollback readiness.

Checklist:

- [ ] Release version/tag and changelog finalized.
- [ ] Environment variables validated (presence, format, least privilege).
- [ ] Deployment target approved (staging -> production sequence).
- [ ] Rollback command/path tested and documented.
- [ ] Deployment approval recorded by accountable owner.

Evidence:

- Deployment logs.
- Release metadata (version, commit SHA, timestamp, approvers).

Exit criteria:

- Deployment completed with healthy startup status.

## Gate 5 - Post-Deploy Smoke Tests

**Objective:** confirm production behavior on critical user journeys.

Checklist:

- [ ] Tenant scoping validated across at least 2 company contexts.
- [ ] Create/read/update critical canonical entities succeeds.
- [ ] One end-to-end procurement path validated (master data -> transaction).
- [ ] Error handling paths return safe and readable outputs.
- [ ] Observability shows no abnormal error spike after deploy.

Evidence:

- Smoke checklist with timestamps and owner initials.
- Error-rate/latency snapshots.
- Issue log for any post-deploy defects.

Exit criteria:

- QA + Engineering + Platform sign-off.

## Production Health Baseline

## `/api/health` contract

The production health endpoint should expose:

- **Liveness:** process is running.
- **Readiness:** app can serve traffic safely.
- **Dependency checks:** database connectivity and required services.
- **Version metadata:** release SHA/version/build time.
- **Tenant-safe design:** no sensitive secrets or tenant data in health payload.

Recommended status model:

- `200` for healthy/ready.
- `503` for unhealthy/not ready with machine-readable reason list.

## Runtime optimization baseline

- Use Next.js `output: "standalone"` for lean containerized/runtime deployment.
- Keep image/runtime footprint minimal and deterministic.
- Ensure startup command and health probe paths align with standalone output.

## Release Artifacts (Required)

- Release notes (scope, risks, migration notes, rollback path).
- Gate checklist document with pass/fail and owner signatures.
- CI/build/test evidence bundle.
- Post-deploy smoke report.
- Incident follow-up template (if any smoke check fails).

## Blockers (Automatic No-Go)

- Missing `company_id` filter on any tenant write path.
- Missing/disabled RLS for newly introduced tenant tables.
- Failed TypeScript/build/test gates.
- Unreviewed schema migration in release scope.
- Missing rollback plan or missing deploy owner approval.

## Day 7 Go-Live Rule

Production release is permitted only after all five gates pass in sequence, with documented evidence and accountable sign-off.
