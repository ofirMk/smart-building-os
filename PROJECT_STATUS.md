# Project Status - Deep Engineering Version

Last Updated: 2026-04-04 (local) — **Derivative Gantt (V1):** `public.tasks` gains `parent_task_id` (master task FK, distinct from WBS `parent_id`), `subcontractor_id` → `entities`, `is_derivative`, `contract_id` → `contracts`. **Cascade:** `cascadeDerivativesForMaster` in `gantt-actions` runs after master date edits (`updateTaskGridRow`, `updateTaskDatesWithDependencies`, including summary subtree shifts); derivatives shift by master start delta and clamp `end_date` ≤ master `end_date`. **FS auto-schedule:** `wbs-schedule` skips `is_derivative` leaves; `recalculateWbsSchedule` does not overwrite derivative dates. **Guards:** DB trigger `enforce_derivative_within_master_window` + app validation (Hebrew errors). **UI:** Gantt bars — indigo tint for derivatives, red `styles` when `derivativeIsDiamondAlert` (lag vs master timeline/%); subcontractor dashboard `/marker-ofek/execution/gantt/[id]/subcontractor` (master vs sub, contract link + `updateDerivativeTaskBillingLink`). **Actions:** `createDerivativeTask`, `updateDerivativeTaskBillingLink`. Field view shows master line + diamond. Migration `20260417120000_tasks_derivative_gantt.sql`. **`npx tsc --noEmit`** exit code 0.

## Current logic (Partner Profit Center V1.0)

- **Server action:** `getPartnerFinancials` in `lib/actions/partner-metrics-actions.ts` (replaces inline naming; `fetchPartnerMetricsDashboard` delegates to it). **Profit** = recognized income − (subcontractors + salaries + petty + overhead + procurement). **Management fee** = 25% × net profit per project; portfolio totals roll up sums.
- **Income:** `mo_invoices` where `status` ∈ `approved`, `paid`, **plus** approved `partial_accounts.payment_due` for the same project when no `mo_invoices.linked_partial_account_id` references that partial (avoids double count). Requires enum `approved` on invoices — migration `20260407120000_mo_invoice_financial_status_approved.sql`.
- **Contract & Billing / Revenue Engine (V1.0):** View `contract_items` = `contract_line_items` (includes `wbs_weight_percent`, `sort_order`). Partial lines: `quantity_previous`, `quantity_current`, `line_total_price`; header `partial_accounts.current_progress_percent`. **`calculatePartialAccount`** uses **pure helper** `lib/marker-ofek/partial-account-calc.ts`: period ₪ = Σ line deltas; **cumulative** = `previous_cumulative_approved + period_gross`; **indexed period** = `period_gross × index_coefficient` (default 1; `index_linkage_base_date` on contract for future CPI); **deductions** from `contract_deduction_rules` (retention / insurance / lab_fees) with fallback to `contracts.retention_pct`, `insurance_pct`, `lab_fees_pct`; **payment_due** = indexed − deductions. Columns `partial_accounts.period_work_indexed`, `lab_fees_deduction`. **UI** (`/marker-ofek/finance/contracts/[id]`): pharmacy shell; KPI + recognition ribbon; BOQ table columns **קודם % | נוכחי % | מצטבר % | סכום מצטבר ₪ | תקופה ₪ | הצעת גנט %**. `getContractRecognizedTotals` for invoiced vs partials.
- **Salaries (hybrid):** if `projects.partner_cost_employee_salaries` > 0 use it; else Gantt labor (`computeGanttLaborCostByProjectId`). Exposed as `employeeSalariesIsManual` on each row.
- **Procurement:** sum PO `total_amount` per project excluding `draft` POs. **Scanner path:** `receiveGoodsFromScanner` inserts `goods_receipts` + `goods_receipt_items`, validates PO line ownership and remaining qty vs prior receipts, requires shortage notes on partial fills; revalidates procurement routes. **Command Center:** sub-nav links dashboard ↔ catalog ↔ assets; catalog mirrors `items_catalog` with search + dialog insert; assets page uses demo rows until a `company_assets` (or equivalent) table is wired.
- **RBAC:** unchanged (`resolvePartnerMetricsPersona`); Guy/Samer see only projects where they are `managing_partner_id`; Ophir sees all assigned projects + filter.
- **UI:** `/marker-ofek/partner-finance` — white “pharmacy” shell, thin `slate-100` borders, `font-currency-mono` (JetBrains) for money, Framer Motion `animate` on KPI figures and list entrance. Expandable dashboard + project drill-down to `/marker-ofek/partner-finance/[projectId]`. Legacy `/partner-finance` redirects to the Marker Ofek route.
- **Gantt (execution):** `gantt-task-react` integration — `Task` rows built from `GanttTaskRow` via `canonicalWbsFlatIds`; invalid ISO strings never become `Invalid Date` (`safeParseDay` + `sanitizedGanttTasks`). **Derivative Gantt:** subcontractor rows (`is_derivative`) linked to `parent_task_id` master; cascade on master moves; per-bar `styles` + ◆ label prefix; link to **סנכרון קבלני משנה**.

## Tender → contract (Golden Pipeline Ph.1)

- **Flow:** `draft` → **הגש למכרז** → `submitted` → קישור `linked_project_id` + `linked_entity_id` → (Ophir) **ניצחון והמרה לחוזה** → `contracts` row + `contract_line_items` (exposed as view `contract_items`) + `tender_projects.status = won`.
- **Engine:** Final BoQ `tender_boq_items` (`boq_version = final`), prefer **leaf** lines (no child rows); `contracts.total_amount` = sum(q×price); line `wbs_weight_percent` from share of total.
- **Facade:** Import `convertTenderToContract` from `lib/actions/contract-actions` in UI; implementation stays under `lib/marker-ofek/tenders/`.

## Dekel reference (Tenders BoQ)

- **Table `ref_dekel_prices`:** `item_description`, `external_sku`, `unit`, `list_price`, `category` (+ legacy `currency`, …). **Search:** RPC `search_dekel_prices(p_query, p_limit, p_category)` — priority `חשמל` / `תשתיות` when no category filter; Hebrew search-prefix stripping (`strip_hebrew_search_prefixes`); optional exact category filter for the fast ribbon.
- **Tender default multiplier:** `tender_projects.default_dekel_multiplier` (default **1.10**); BoQ page strip + dialog load/save via `getTenderDekelDefaults` / `updateTenderDefaultDekelMultiplier`.
- **Server actions:** `lib/marker-ofek/tenders/dekel-actions.ts` — `searchDekelPrices`, `applyDekelPriceToBoQ` (מקדם על מחיר בסיס → `unit_price`, עדכון תיאור ויחידה דרך `updateBoqItem`).
- **UI:** `/marker-ofek/tenders/boq` — `DekelPricePickerDialog` (רצועת קטגוריות מהירה, מחיר דקל → המחיר שלך, `font-currency-mono`).

## Schema changes (this update)

- `20260417120000_tasks_derivative_gantt.sql` — `tasks.parent_task_id` (FK master, `on delete restrict`), `subcontractor_id`, `is_derivative`, `contract_id`; checks + trigger `tasks_derivative_master_window_trg` (derivative `end_date` ≤ master `end_date`).
- `20260415120000_dekel_search_priority_and_tender_multiplier.sql` — `default_dekel_multiplier` on `tender_projects`; `strip_hebrew_search_prefixes`; `search_dekel_prices` v2 (3-arg).
- `20260414120000_ref_dekel_prices_finalize.sql` — עמודות `item_description` / `category`, אינדקסי חיפוש, `search_dekel_prices`, דוגמאות seed אם הטבלה ריקה.
- `20260413120000_tender_win_contract_pipeline.sql` — `tender_projects.status` ∈ `draft|submitted|won|lost`; `linked_project_id`, `linked_entity_id`; `contracts.tender_project_id` + unique (one contract per tender); `ref_dekel_prices` placeholder (Dekel sync TBD).
- (None for procurement scaffolding — uses existing `goods_receipts` / `goods_receipt_items` / `po_line_items`.)
- `20260407120000_mo_invoice_financial_status_approved.sql` — adds `approved` to `public.mo_invoice_financial_status` (before `paid`) for revenue recognition.
- `20260409120000_contract_billing_center_v1.sql` — `public.contract_items` view (alias of `contract_line_items`); `partial_account_line_items.quantity_previous`, `quantity_current`, `line_total_price`; `partial_accounts.current_progress_percent`.
- `20260410120000_contract_deduction_rules_index_linkage.sql` — `contract_deduction_rules` (retention / insurance / lab_fees % per contract); `contracts.lab_fees_pct`, `index_linkage_base_date`, `index_coefficient`; `contract_line_items.wbs_weight_percent`, `sort_order`; `partial_accounts.lab_fees_deduction`, `period_work_indexed`; view `contract_items` recreated; example BOQ seed template `supabase/snippets/example_boq_wbs_9_1m.sql`.

## Unresolved / follow-ups

- **Derivative Gantt:** No in-app UI yet to call `createDerivativeTask` (SQL or future dialog); `parent_task_id` vs WBS `parent_id` needs onboarding copy for PMs.
- ~~**Gantt / `gantt-client.tsx`:** TypeScript errors against `gantt-task-react` `Task`, missing symbols, or invalid `Date` values passed to `<Gantt />`.~~ **Fixed (2026-04-03):** `safeParseDay` guards `parseISO`; `sanitizedGanttTasks` ensures valid `Date` instances; `onDateChange` / `onProgressChange` match library arity `(task, children?)`, validate `toIso` before `updateTaskGridRow`. Pharmacy Gantt shell (`bg-[#FFFFFF]`, `border-slate-100`) unchanged.
- If payroll must be overridden to **exactly zero** while Gantt is non-zero, product needs a flag or NULLable manual column; V1 uses “positive manual wins.”
- RLS on `mo_invoices` / `projects` for partners should be reviewed for defense-in-depth (app layer already filters).

## Next steps

- Optional: one-click **אישור חשבון חלקי** (status → `approved`) from billing UI with confirmation; ensure `mo_invoices` linking workflow for partials that graduate to invoice.
- Optional: surface `approved` vs `paid` invoice mix in dashboards; admin workflow to set invoice status to `approved`.

## External agent sync

- **`GEMINI_SYNC_BRIEF.md`** — short contract for revenue recognition, billing math, and file pointers (kept in repo root).

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
