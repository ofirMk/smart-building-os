# Project Status - Deep Engineering Version

Last Updated: 2026-04-03 (local)

## 1) Database Specs (Tables, Types, FKs, RLS)

Important runtime note:
- Codebase defines the schema below via migrations.
- Active environment still reports `public.resources` missing in schema cache, so real runtime is currently behind migration `20260402194000`.

### `public.tasks` (from `20260402150000_work_management_gantt.sql`)
- Columns:
  - `id uuid primary key default gen_random_uuid()`
  - `project_id uuid not null references public.projects(id) on delete cascade`
  - `parent_id uuid null references public.tasks(id) on delete set null`
  - `name text not null`
  - `description text null`
  - `start_date date null`
  - `end_date date null`
  - `actual_start_date date null`
  - `actual_end_date date null`
  - `progress numeric(5,2) not null default 0`
  - `dependency_ids uuid[] not null default '{}'::uuid[]`
  - `estimated_cost numeric(14,2) not null default 0`
  - `actual_cost numeric(14,2) not null default 0`
  - `created_at timestamptz not null default now()`
  - `updated_at timestamptz not null default now()`
- Constraints:
  - `tasks_progress_range_chk` (`0 <= progress <= 100`)
  - `tasks_cost_nonneg_chk` (`estimated_cost >= 0 and actual_cost >= 0`)
  - planned/actual date order checks
- Indexes:
  - `tasks_project_id_idx`, `tasks_parent_id_idx`, `tasks_start_date_idx`, `tasks_end_date_idx`
  - `tasks_dependency_ids_gin_idx` (GIN on `dependency_ids`)
- Trigger:
  - `tasks_updated_at` -> `public.set_updated_at()`
- RLS:
  - enabled
  - policy: `tasks_admin_all` (`for all to authenticated`) with `profiles.role = 'admin'::public.user_role`

### `public.task_resources` (from `20260402150000_work_management_gantt.sql`)
- Columns:
  - `task_id uuid not null references public.tasks(id) on delete cascade`
  - `item_id uuid not null references public.items_catalog(id) on delete restrict`
  - `quantity_estimated numeric(14,3) not null default 0`
  - `quantity_actual numeric(14,3) not null default 0`
  - `created_at timestamptz not null default now()`
  - `updated_at timestamptz not null default now()`
- PK: `(task_id, item_id)`
- Constraint: non-negative quantities
- Index: `task_resources_item_id_idx`
- Trigger: `task_resources_updated_at`
- RLS:
  - enabled
  - policy: `task_resources_admin_all` (admin-only via `profiles`)

### `public.project_resources` (from `20260402183000_gantt_resource_engine.sql`)
- Columns:
  - `id uuid primary key default gen_random_uuid()`
  - `project_id uuid not null references public.projects(id) on delete cascade`
  - `full_name text not null`
  - `profession text not null default ''`
  - `hourly_cost numeric(12,2) not null default 0`
  - `work_days int2[] not null default '{0,1,2,3,4}'::int2[]`
  - `is_active boolean not null default true`
  - `created_at timestamptz not null default now()`
  - `updated_at timestamptz not null default now()`
- Constraint: non-negative `hourly_cost`
- Index: `project_resources_project_id_idx`
- Trigger: `project_resources_updated_at`
- RLS policy: `project_resources_admin_all` (admin-only)

### `public.project_resource_vacations`
- Columns:
  - `id uuid primary key default gen_random_uuid()`
  - `resource_id uuid not null` (initial FK to `project_resources.id`, later rewired to `resources.id`)
  - `start_date date not null`
  - `end_date date not null`
  - `notes text null`
  - `created_at timestamptz not null default now()`
  - `updated_at timestamptz not null default now()`
- Constraint: `start_date <= end_date`
- Index: `project_resource_vacations_resource_id_idx`
- Trigger: `project_resource_vacations_updated_at`
- RLS policy: `project_resource_vacations_admin_all`

### `public.task_resource_assignments`
- Columns:
  - `id uuid primary key default gen_random_uuid()`
  - `task_id uuid not null references public.tasks(id) on delete cascade`
  - `resource_id uuid not null` (initial FK to `project_resources.id`, rewired to `resources.id`)
  - `project_id uuid not null references public.projects(id) on delete cascade`
  - `created_at timestamptz not null default now()`
- Unique: `(task_id, resource_id)`
- Indexes: `task_resource_assignments_resource_id_idx`, `task_resource_assignments_project_id_idx`
- RLS policy: `task_resource_assignments_admin_all`

### `public.resources` (from `20260402194000_resource_calendar_engine.sql`)
- Columns:
  - `id uuid primary key default gen_random_uuid()`
  - `name text not null`
  - `profession text not null default ''`
  - `cost_per_day numeric(12,2) not null default 0`
  - `availability_status text not null default 'available'`
  - `created_at timestamptz not null default now()`
  - `updated_at timestamptz not null default now()`
- Constraints:
  - non-negative `cost_per_day`
  - `availability_status in ('available','unavailable','vacation')`
- Indexes: `resources_name_idx`, `resources_availability_status_idx`
- Trigger: `resources_updated_at`
- Migration data op:
  - bootstrap copy from `project_resources` preserving IDs
  - rewires FKs in vacations + assignments to `resources(id)`
- RLS:
  - enabled
  - policy: `resources_admin_all` (admin-only)

## 2) Algorithm Logic - `addWorkingDaysSync` + Hebcal

Source: `lib/utils/calendar-utils.ts`

### `addWorkingDaysSync(startIsoDate, durationDays, jewishHolidayDates)`
- Step 1: normalize/validate `startIsoDate` (`YYYY-MM-DD`) via `normalizeIsoDate`.
- Step 2: normalize duration (`Math.floor`, clamp to `>= 0`).
- Step 3: if duration is `0`, return start date immediately.
- Step 4: set `cursor = start`, `remaining = duration`.
- Step 5: loop while `remaining > 0`:
  - shift cursor by +1 day (`shiftIsoDate` UTC-safe)
  - evaluate `isWorkDay(cursor, jewishHolidayDates)`
  - if workday => decrement `remaining`
- Step 6: return final cursor.

### Weekend + holiday handling
- `isWorkDay` rejects:
  - Friday (`UTCDay === 5`)
  - Saturday (`UTCDay === 6`)
  - any date in `jewishHolidayDates` set

### Hebcal integration
- `fetchHebcalHolidayDates(year)` calls:
  - `https://www.hebcal.com/hebcal?...&year=<year>&...`
  - with `fetch(..., { cache: "force-cache" })`
- Extracts `items[].date` into `Set<string>` of ISO dates.

### Caching layer
- In-memory cache exists:
  - `const hebcalYearCache = new Map<number, Set<string>>()`
- If year already cached, returns cached set without network call.
- Async helper `addWorkingDays(...)` merges holiday sets for `year` and `year + 1`, then calls sync function.

## 3) Performance & State - Inline Editing in `gantt-client.tsx`

### Editing model
- Per-cell active editor key: `activeEditCell` (`<taskId>:<field>`).
- Draft states kept per task:
  - `nameDrafts`, `dateDrafts`, `durationDrafts`, `progressDrafts`.
- Behavior:
  - click cell => activate inline editor
  - blur => `commitTaskRow(task.id)` (server write if changed)
  - Enter => commit + exit
  - Escape => rollback to `editCellInitialValueRef` + exit
  - outside-row click => exit edit mode

### Optimistic update strategy
- Mixed strategy (semi-optimistic):
  - immediate local drafts while typing
  - `commitTaskRow` writes row and patches local `tasks` on success
  - background debounced sync (`syncDraftsInBackground`) also batches dirty rows every `1200ms`
  - on batch success, refetches `tasks` for canonical state

### Re-render and scalability strategy
- Key mechanisms:
  - tree flatten memoization: `buildTreeMaps` + `flattenVisible` with `useMemo`
  - row virtualization/windowing:
    - constants: `ROW_HEIGHT`, `VIEWPORT_HEIGHT`, `OVERSCAN`
    - render only `renderedRows = visibleTasks.slice(startIndex, endIndex)`
    - top/bottom spacers preserve scroll geometry
  - synchronized dual scroll with lock (`syncLockRef`)
  - computed aggregates in `useMemo` (health, conflicts, timeline segments, today line)
- Expected behavior for 100+ tasks:
  - much better than full-list paint due to virtualization
  - still has some O(n^2) hotspots in conflict checks and per-render filters (see debt section)

## 4) UI Architecture - Industrial Style Guide

### Density / typography
- Dense spreadsheet-like settings in WBS:
  - row min-height ~`43px`
  - cell text mostly `text-[13px]`
  - header text `text-[11px]`, meta `text-[10px]`
  - mono numerics in critical KPI/date areas (`font-mono`)

### Primary class language
- Container:
  - `bg-zinc-50`, `text-zinc-900`, compact `p-2`, `gap-3`
- Cards/grids:
  - `bg-white`
  - `border border-zinc-300` (engineering table edges)
  - headers `bg-zinc-100`
- Timeline grid:
  - explicit line texture via `backgroundImage` + `backgroundSize: "22px 22px"`

### Color mapping (approx Tailwind -> hex)
- `zinc-50` `#fafafa`
- `zinc-100` `#f4f4f5`
- `zinc-300` `#d4d4d8`
- `zinc-500` `#71717a`
- `zinc-900` `#18181b`
- `violet-600` `#7c3aed`
- `fuchsia-700` `#a21caf`
- `indigo-700` `#4338ca`
- `emerald-500` `#10b981`
- `red-500` `#ef4444`
- `cyan-500` `#06b6d4`

### Current design reality
- The grid itself is industrial/light-first.
- Header badges/buttons still keep vivid accent palette for operational status/actions.

## 5) Critical Debt Before $500M Demo

### A. Schema/runtime mismatch (highest risk)
- Runtime still reports missing `public.resources`; code expects it everywhere in resource engine.
- Must resolve migration application + schema cache before demo.

### B. Dual write paths for same state
- Inline `commitTaskRow` and background `syncDraftsInBackground` can both write same row close together.
- Risk: race conditions, redundant writes, stale overwrite patterns.

### C. `diffWorkingDays` duplication / drift risk
- Workday diff implemented in `gantt-client.tsx` instead of shared utility.
- High chance of divergence from server-side business logic.

### D. Non-working-day inconsistency in dependency shift
- `updateTaskDatesWithDependencies` on server shifts dependents by calendar days (`shiftIsoDate`), not workdays.
- This can conflict with client expectation of holiday/weekend-aware scheduling.

### E. Conflict detection scope is partial
- UI conflict detection currently uses assignments fetched for current project scope in `fetchResourceEngine(projectId)`.
- Requirement stated "across any project"; present implementation is not global.

### F. Heavy computations still naive for large data
- Conflict detection in client performs nested loops over assignments.
- Resource availability checks are recomputed per row without indexed memo structures.

### G. Hardcoded/embedded presentation and copy
- Mixed Hebrew/English labels and many hardcoded strings in component.
- Color and density values are embedded directly in JSX instead of tokenized design system.

### H. Missing transaction boundaries for grouped operations
- Grouping, dependency shifts, and some multi-step operations are not wrapped in server-side transactional unit.
- Failure in the middle can leave partial state.
