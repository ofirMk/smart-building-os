---
description: Zero Regression Policy — protected UI routes and additive-only development rule
---

CRITICAL ARCHITECTURE RULES - ZERO REGRESSION POLICY:
1. NEVER delete, rename, or alter existing UI pages (page.tsx/layout.tsx) or their directories without explicit user permission.
2. The /pitch, /projects, and /contracts-engine routes are STRICTLY PROTECTED. Do not 'clean them up' during backend or unrelated frontend tasks.
3. Development must be strictly ADDITIVE.

## Tripwire Test (Gate Before Push)

Before declaring any task complete OR pushing code to the cloud, you MUST run:

```pwsh
npx playwright test tests/critical-routes-protection.spec.ts
```

If it fails, STOP and restore the offending routes from git history before doing anything else.

## Protected Routes (do not delete/rename without explicit permission)

- `app/(dashboard)/marker-ofek/pitch/` (Investor Command Center, monetization)
- `app/(dashboard)/marker-ofek/projects/` (project portfolio)
- `app/(dashboard)/marker-ofek/contracts-engine/` (contracts engine workspace)
- Dependent components under `components/marker-ofek/pitch/`, `components/marker-ofek/projects/`, `components/marker-ofek/contracts-engine/`

## Allowed Operations on Protected Routes

- ADD new sub-routes (e.g. `pitch/new-section/page.tsx`).
- ADD new components imported by the existing pages.
- EXTEND existing components with new props (non-breaking).
- FIX bugs without altering route structure.

## Forbidden Operations on Protected Routes

- Removing `page.tsx` / `layout.tsx` files.
- Renaming directory segments (changes the URL).
- Moving page files to a different route group.
- Removing imports that protected pages depend on.
- "Cleaning up" or "consolidating" these areas without an explicit user mandate.

## Recovery Procedure (If a Protected Route 404s)

1. `git log --oneline -20 -- "<path/to/route>"`
2. Identify the last commit where the file existed.
3. `git checkout <commit> -- <path/to/route>`
4. Verify with the tripwire test.
5. Commit with prefix `fix(infrastructure): restore <route> from <commit>`.
