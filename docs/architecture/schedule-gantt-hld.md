# Phase 4 — Schedule / Gantt HLD

**Status:** ⏳ Awaiting decision · *do not write DDL or UI yet*
**Author:** Cascade · **Date:** 2026-05-10
**Decision required from:** Product Owner (you) — pick one of the 3 paths in §6.

---

## 1. Critical discovery — there is *no* greenfield here

A **mature, multi-board Gantt module already exists** in this codebase. Before any planning,
I scanned the repo and found:

| Asset | Location | What it gives us |
|---|---|---|
| 11 migrations | `supabase/migrations/202604–202606*gantt*.sql` | `gantts` (boards) + `gantt_tasks` (with `parent_id`, dependencies as JSONB, resources, costs, **baselines**, **actual_start/actual_end**, milestones, schedule snapshots, derivative tasks for ספק-ביצוע) |
| Server actions | `lib/marker-ofek/gantt-actions.ts` (~2,400 lines!) | CPM-style date recalc, dependency validation, indent/outdent, derivative linking, cost variance, WBS roll-up |
| Live UI | `app/(dashboard)/marker-ofek/execution/gantt/[id]/page.tsx` + `gantt-client.tsx` (8 sub-components) | Full editor: task list, MS-Project task detail, resource pool, dependency overlay, WBS import dialog |
| AI worker | `ai-worker/crews/gantt_risk_crew.py` + `tools/supabase_gantt_tool.py` | CrewAI agent for risk analysis |
| Pitch component | `components/marker-ofek/pitch/gantt-investor-hero.tsx` | Mock Kanban already in place |
| Type contracts | `types/gantt.ts` | `GanttRecord`, `GanttTask`, `GanttDependencyType=FS\|SS\|FF\|SF`, `GanttScheduleMode=auto\|manual` |

**Implication:** writing a fresh `erp_proj_schedules` schema would create a parallel, conflicting
domain. The Phase 4 prompt I wrote yesterday was based on incomplete context. We must change course.

---

## 2. The actual gap (= why the schedule isn't yet "investor-grade")

Two real gaps remain — both are **integration**, not greenfield:

### Gap A — Domain mismatch with the demo project
- The Gantt module reads from `public.projects` (legacy table; FK `gantt_tasks.project_id → projects.id`).
- Phases 1-3 (contract / PO / bill) live in `public.erp_proj_projects` (ERP module). The demo
  project "גיאה גן יבנה" used by all our pitch buttons exists **only** in `erp_proj_projects`.
- Result today: clicking a hypothetical "Schedule" button for the demo project would route to
  `/execution/gantt/{erp_proj_projects.id}` and the page would `notFound()`.

### Gap B — No CEO Command Center entry point + no "Lihtman schedule" demo data
- `investor-command-center.tsx` has no Gantt button (just contract/bill/PO).
- Even if the link existed, the legacy `projects` table doesn't contain a richly-seeded demo
  schedule that mirrors the busy hard-copy schedule the client provided. The existing Gantt
  pages would show empty state.

### Non-gaps (already done, do not rebuild)
- Schema for tasks/deps/baselines/costs ✅
- CPM date recalculation ✅
- Dependency types FS/SS/FF/SF + lag ✅
- Hierarchical (`parent_id`) tasks + WBS ✅
- Resource assignment + cost rollup ✅
- AI risk worker (CrewAI) ✅

---

## 3. Domain model — what's already there (no changes proposed)

```
projects (legacy)
└── gantts (board)             ← multi-board: "Master schedule", "Façade phase", etc.
    └── gantt_tasks
         ├─ parent_id            (hierarchy / WBS)
         ├─ dependencies jsonb   ([{taskId, type:FS|SS|FF|SF, lag}])
         ├─ resources    jsonb
         ├─ baseline_start/_end  (saved snapshot)
         ├─ actual_start/_end    (delay tracking)
         ├─ is_milestone / is_derivative
         └─ cost / progress / status / constraint_*
```

This is **identical to MS Project's model**. No design change needed.

---

## 4. Calculation strategy — already decided in the codebase

**Runtime, not stored.** `lib/marker-ofek/scheduling/calculateTaskDates` runs CPM forward+backward
passes against the full task graph in JS, with FS_HOLIDAYS skipping. No `critical_path` column
exists; critical path is derived on each render. **Recommendation: keep as-is** — investor demo
needs ≤200 tasks, runtime CPM is <50 ms. Storing would add complexity (cache invalidation on
every dependency edit) for zero perceptible win.

---

## 5. AI hooks — already wired

- `ai-worker/crews/gantt_risk_crew.py` exposes a CrewAI agent that consumes `supabase_gantt_tool.py`
  and emits delay-risk badges.
- For investor demo, we'd surface its output as a small "AI שמזהה סיכון" badge on critical-path bars.
  This is a thin UI overlay, not a new pipeline.

---

## 6. **Three paths forward — pick one**

### Path A — Bridge seed (recommended, 1-day work) ⭐
> *Make the existing Gantt work for the demo project, with zero schema changes.*

1. Insert the Lihtman demo project into `public.projects` (the legacy table) using the
   **same UUID** as `erp_proj_projects.id` for "גיאה גן יבנה". Now both modules point at the
   same project key.
2. Insert one `gantts` row ("Master Schedule") + ~18 `gantt_tasks` mirroring the busy hard-copy
   schedule (excavation → foundations → frame → MEP rough-in → finishes → handover) with
   real FS dependencies, 2 baselines (planned + 5-day delay actual on the frame), and
   subcontractor resources tying back to existing `erp_md_suppliers` rows.
3. Add CEO Command Center button **"לוח זמנים חי"** (orange, `GanttChartSquare`) →
   `/marker-ofek/execution/gantt/{DEMO_PROJECT_ID}`.
4. Add an AI-risk badge overlay on the existing client (small component, mock data ok if the
   CrewAI worker isn't deployed).

**Pros:** zero new tables, zero new components, full reuse of 2,400 LOC of mature code.
**Cons:** project lives in two tables (`projects` and `erp_proj_projects`). Acceptable —
this is already true for many other ERP modules; the dual-write is documented in
`docs/SYSTEM_INDEX.md`.

### Path B — Cross-domain view (3-day work)
> *Add a SQL view `v_unified_projects` that UNIONs `projects` and `erp_proj_projects`, and
> change `fetchProjectTasks`/page guards to query the view.*

**Pros:** clean architectural fix.
**Cons:** touches 2,400 LOC of stable code; risk of regressions in production Gantt flows;
not investor-visible work.

### Path C — Greenfield `erp_proj_schedules` parallel (5+ days, **not recommended**)
> *Build a second Gantt system inside the ERP module.*

**Pros:** ERP-pure.
**Cons:** duplicate of existing logic, wasted effort, two competing Gantt UIs in production.
This is what the Phase-4 prompt proposed before the discovery — I now actively recommend against it.

---

## 7. Recommendation

**Path A.** Maximum demo impact / minimum risk. Concretely:

```
Phase 4.1  — migration: bridge-insert demo project into `projects` + seed 18 gantt_tasks + 1 gantt
             with realistic Lihtman-style schedule + 1 baseline snapshot + actual-vs-baseline drift on the frame
Phase 4.2  — CEO Command Center: add 4th demo button "לוח זמנים חי" (orange, GanttChartSquare)
Phase 4.3  — small AI-risk overlay component on the existing gantt-client (badge on critical path)
Phase 4.4  — tsc + db push + commit + push + autonomous next-step recommendation
```

No changes to schema, no changes to existing components, ~250 lines of seed SQL +
~80 lines of UI overlay + 1 button. Demo-ready in one focused session.

---

## 8. Open questions for you

1. **Approve Path A?** Or do you want me to proceed with Path B / C anyway?
2. **Hard-copy detail level** — the schedule in the hard copies has ~60+ activities. For demo,
   18 well-chosen ones with realistic dependencies tell the story; 60 makes the screen noisy.
   Confirm 18 is fine, or specify a different count.
3. **AI risk badges** — mock data for now, or block on deploying the CrewAI worker first?
   Mock recommended for demo speed.
