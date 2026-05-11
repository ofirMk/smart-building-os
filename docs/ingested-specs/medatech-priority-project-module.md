---
title: MedaTech Priority ERP Specification — Lihtman (2016)
source_file: c:\Users\user\Desktop\הנהלת חשבונות\איפיון מערכת ניהול.docx
source_date: 2016-10-18
vendor: MedaTech (medatech.com, Tirat Carmel)
customer: ל"טמן בע"מ
ingested_at: 2026-05-11
ingested_by: Cascade (Sprint A.4 follow-up — Priority Pivot)
status: canonical-reference
scope: This document is the contractual "rule book" for how Lihtman runs project
       planning, budget editions and cost control in Priority ERP. Sprints A.4+
       reverse-engineer it into the modern cloud architecture under
       `erp_proj_*` tables.
focus_chapters: §5 (Projects), §6 (Cost Control), with auxiliary references to
                §2.2 (Procurement), §3 (Owner/Subcontractor) and §7 (Tenders).
---

# MedaTech Priority — Lihtman Specification (ingested)

> **Ingestion note (Cascade):** the original `.docx` was extracted via
> `System.IO.Compression.ZipFile` → `word/document.xml` → regex-stripped to
> plain text. Hebrew OCR-style typos in the original (`פר1יקט`, `קב!צות`,
> `ניחים`) are preserved verbatim. Use this file as the **canonical reference**
> for any new schema/UI work — link back to it from migrations and PRs.
>
> The full extracted text lives at the path above. The summary below is
> structured for engineering use and explicitly **cross-referenced** with the
> current implementation status (Sprint A.4 commit `f56c05c0`).

---

## Chapter 5 — פרויקטים (Project Planning)

### §5.1 General
- Projects module is the planning backbone for cost control (§6).
- **Every activity in the company is a project** — even non-project work
  (overhead, G&A) is modelled as a project for accounting cohesion.

### §5.2 Control Infrastructure (`erp_proj_control_*`)

#### §5.2.1 Subchapters (`erp_proj_control_subchapters`)
- Each subchapter represents **a stage in the project** (e.g. "01 — תשתיות
  בתקרות", "02 — גמר עבודות תשתית בדירות").
- Defined as a "Profit Center cut #3" in Priority.
- FK to `chapter_id`.

#### §5.2.2 Chapters (`erp_proj_control_chapters`)
- Higher-level grouping above subchapters.
- The spec explicitly states: **"חתך 'תת-פרק = פרק'"** — i.e. for Lihtman
  there is **no functional difference** between chapter and subchapter; chapter
  exists only as a hierarchical container.

#### §5.2.3 Subjects (`erp_proj_control_subjects`)
- Top-level grouping of resources.
- Spec examples:
  | Code | Description |
  |------|-------------|
  | 1    | קבלנים      |
  | 2    | חומרים      |
  | 3    | ציוד        |
  | 4    | שכר         |
  | 5    | שונות       |

#### §5.2.4 Resources (`erp_proj_control_resources`)
- "Profit Center cut #4". Linked to subject.
- **`is_quantifiable`** flag = enables quantitative control (must define `uom`).
- Spec examples (verbatim):
  | Code | Description     | UOM   | Quantitative |
  |------|-----------------|-------|:------------:|
  | 1001 | צינורות         | מ״מ   | ✓ |
  | 1002 | תעלות           | מ״מ   | ✓ |
  | 2001 | לוחות חשמל      | יח׳   | ✓ |
  | 3001 | קבלן חשמל       | שקל   |   |
  | 9001 | מנהל פרויקט     | ש״ע   | ✓ |
  | 9002 | מנהל עבודה      | ש״ע   | ✓ |

#### §5.2.5 Defaults on item families
- Each `proc_item_family` carries `default_control_subchapter_id` +
  `default_resource_id`. New items inherit them automatically.
- Existing item defaults are NOT overridden by family changes.

#### §5.2.6 Defaults on items (and special items)
- Each item carries `default_control_subchapter_id` + `default_resource_id`.
- **Critical:** special items for עכבון / קיזוז / התייקרות / מקדמה used in
  subcontractor contracts also need these defaults — even though those amounts
  are not collected as actual costs (the linkage is technical, to satisfy the
  NOT-NULL constraint on document lines).
- `conversion_ratio` field on quantitative resources, mapping resource UOM ↔
  item UOM. Falls back to global UOM-conversion table.

#### §5.2.7 Costing Items (מק"טי תמחור)
- Dedicated item family **"תמחור תקציבי"** flagged with `is_costing_resource`.
- BOM dropdown ("עץ מוצר לפעילות") shows **only** these items by default.

#### §5.2.8 UOM Items
- Each UOM used in contracts (שקל, יחידה, טון, מ"א, …) is created as a
  pseudo-item for internal reference.

### §5.3 Terminology in budgeting
- **Structure (מבנה)** — segment 1 (e.g. ציבורי / דירות / כלליות).
- **Chapter (פרק)** — segment 2 (e.g. דירות-טיפוס A).
- **Subchapter (תת-פרק)** — segment 3.
- **Item (סעיף)** — segment 4 (e.g. `0010`).
- Full code example: `01.01.01.0010`.
- **Resource BOM (עץ מוצר לפעילות)** — cost breakdown of a single BOQ line.

### §5.4 Creating a new project
Fields:
- `customer_id` (מזמין)
- `project_number` — auto-generated (rule-driven)
- `project_manager_id`
- `project_type`
- `planned_start_date`, `planned_end_date`
- Edition 0 is created and linked to:
  - Project BOQ (§5.5)
  - Resource BOM per BOQ line
  - Owner contract
  - Subcontractor contracts
  - Frame purchase orders

### §5.5 Loading the budget plan

#### §5.5.1 General — BOQ structure
- Owner BOQ is usually in payment milestones per apartment / unit / project.
- Subcontractor BOQs are detailed per execution line.
- **The cost-control BOQ structure** uses parent header rows + detail rows:
  ```
  01           דירות                  יח׳   88
  01.01        דירות-טיפוס A          יח׳   88
  01.01.01     דירות-טיפוס A          יח׳   88
  01.01.01.0010 תשתיות בתקרות         קומפלט 28   → subchapter "01"
  01.01.01.0020 גמר עבודות תשתית      קומפלט 28   → subchapter "02"
  01.01.01.0030 הספקת אביזרי קצה      קומפלט 28   → subchapter "03"
  ...
  02           ציבורי                  יח׳   88
  02.01.01.0010 הארקת יסודות          קומפלט 1   43,520   → subchapter "06"
  ...
  99           כלליות                  יח׳   -
  99.01.01.0010 כלליות                 קומפלט 1                → subchapter "93"
  ```
- Header rows have `quantity` but no `unit_price`.
- Multiple BOQ lines can map to the **same** control subchapter (cost rolls up
  at the subchapter level, not the line level).

#### §5.5.2 Creating a Planning Edition
- Created via "Copy edition" from previous edition (typically the tender edition
  becomes the base for budget).
- Flags (mutually-exclusive across editions of the same project — **exactly one
  of each may exist at a time**):
  - `is_tender_edition` (מהדורת מכרז)
  - `is_base_version` / "is_zero_edition" (מהדורת אפס)
  - `is_execution_version` (מהדורת ביצוע)
- Status: DRAFT (טיוטה) / APPROVED (מאושרת).
- **Approved editions cannot be modified** (DB constraint).
- A user with the cookie/permission `'מורשה לפתיחת מהדורה'` can re-open an
  approved edition.

#### §5.5.3 Auto-import sections from change orders
- Direct action "הוספת סעיפים חריגים לפרויקט" on the editions screen.
- Input: contracts / change orders (approved only).
- Output: new BOQ rows in the active edition, flagged `imported_from_contract`.

---

## Chapter 6 — בקרה תקציבית (Cost Control)

### §6.1 General
Cost control is the **planning vs actual** dimension: original budget,
current budget, actual utilization (procurement + contracts), forecast to
completion, all snapshotted per control period.

### §6.2 Process flow

#### §6.2.1 Initial steps (one-time per project)
1. Create project.
2. Create Edition #0 (original budget).
3. Price BOQ lines (resource BOM).
4. Link BOQ lines + BOM rows to control cuts (subchapter + resource).
5. Mark edition as "מהדורת אפס".
6. Approve.

#### §6.2.2 Recurring steps (every control period — usually monthly)
1. Copy previous edition → new edition.
2. Add change-order / new sections.
3. Update budget (price / qty / control cuts).
4. Update progress % per section (manual or from approved owner-bill).
5. Optionally update progress % per resource (auto-derived from line %).
6. Mark edition `is_execution_version` → approve.
7. **Open new control period** (snapshot record).
8. **Run cost-collection routine** (gathers actuals from all documents).
9. Use workbench to assign subchapter/resource on documents missing them.
10. Update revenue + expense forecast-to-completion.
11. Generate control reports.
12. Close control period.

#### §6.2.3 Definitions in control
- **תקציב מקורי** (original budget) — from `is_base_version=true` edition.
- **תקציב עדכני** (current budget) — from `is_execution_version=true` edition.
- **ניצול בפועל** (actual utilization) — sum of cost from all project
  documents grouped by `(project, subchapter, resource)`.
- **סכום מאושר לתשלום** (approved for payment) — split into "in books"
  (booked to GL) and "off books" (committed but not yet booked).
- **צפי לגמר** (forecast to complete) — manual per (subchapter, resource).

#### §6.2.4 Layers of control
- Documents that contribute to actuals: **all** project-linked documents —
  procurement (PO / GR / vendor invoice), subcontractor (contract / partial
  bill), manual journal entries, and the inventory/material ledger.
- **Mandatory dimensions on every project document line:**
  `project_id` + `control_subchapter_id` + `control_resource_id`.
- Dimensions auto-roll from the upstream document (e.g. GR inherits from PO).

### §6.3 Detailed process

#### §6.3.1 Define budget for the project
Same as §5.5.2 — produces a planning edition with BOQ + BOM linked to control
cuts.

#### §6.3.2 Link control cuts on every document
- **Mandatory** — `project_id`, `control_subchapter_id`, `control_resource_id`
  on every cost-impacting document line **belonging to the active budget
  edition only**.
- Auto-rolls from upstream docs (PO → GR → Invoice).
- Subchapter/resource defaults come from the item & item family (§5.2.5/6).

#### §6.3.3 Open Control Account
- = Open new planning edition (`is_execution_version=true`, status=DRAFT).
- Add new/change-order sections.
- Update prices / qty / control cuts.
- Update progress %:
  - Default: same as previous period.
  - Manual override via `progress_pct` or `progress_qty`.
  - **Or** auto-roll from approved owner partial-bill.
- Updating section % cascades to resource %; resource % can be manually
  overridden afterwards.
- Mark `is_execution_version=true` → approve.

#### §6.3.4 Open Control Period
- New record in `erp_proj_control_periods` keyed by
  `(project_id, control_month)` in `MM/YY` format.
- Acts as a **snapshot** of the project state from inception through the last
  day of the chosen month.
- Snapshot contents:
  - Current budget (from execution edition).
  - Actual utilization (collected from all docs).
  - Approved-for-payment (in-books + off-books).
  - Forecast-to-completion.
- If new costs arrive after collection, re-run collection ("איסוף נתונים").

#### §6.3.5 Run cost collection
- **Not** automatic / real-time. Triggered manually OR via the nightly
  `TODAY` job (special period reserved for today's snapshot, refreshed daily).
- Aggregates per `(project, subchapter, resource)`:
  1. Original budget (Edition 0).
  2. Current budget (execution edition).
  3. Actual utilization (open documents).
  4. Approved for payment (in/off books).
  5. Forecast to complete.

#### §6.3.6 Analyze collected costs
- Central screen `Projects → Cost Control` with snapshot per period.
- Drill-down cuts: per subchapter, per resource, per
  subchapter×resource, per document.
- Ability to click through to the source document.

#### §6.3.7 Workbench for setting subchapter/resource on documents
- For documents that arrived without dimensions, the workbench lists them and
  allows bulk assignment from the control screen.

#### §6.3.8 Update revenue forecast-to-completion
- Manual field per (subchapter, resource) per period.

#### §6.3.9 Update expense forecast-to-completion
- Manual field per (subchapter, resource) per period.
- EAC (Estimate at Completion) = Actual + Forecast-to-Complete.

### §6.4 Planning vs Actual screen
- Side-by-side comparison: original budget, current budget, actual, forecast,
  variance, % completion.
- Filters: subchapter, resource, control period.

### §6.5 Budget overrun warning on documents
- Trigger on document line save: if cumulative committed for
  `(project, subchapter, resource)` would exceed `current_budget` × tolerance,
  raise warning / error (configurable by user permission).

### §6.6 Control reports
- Standard reports per control period (planned vs actual, variance, drilldown,
  exception report).

---

## Auxiliary cross-references

### §3 Owner / Subcontractor — bills tie-in to cost control
- Approved owner partial-bill provides the **revenue** side of cost control
  and can auto-feed progress % per BOQ section (§6.3.3).
- Approved subcontractor partial-bill provides one of the **actual** input
  streams (already implemented in Sprint A.3).

### §7 Tenders — feeding the tender edition
- Tender edition (`is_tender_edition=true`) is built from the contractor-bids
  comparison and "winning bid update" routine, then copied into Edition 0.

---

## Implementation Status (Sprint A.4 — commit `f56c05c0`)

The migration `20260828100000_priority_project_planning.sql` implements the
**structural backbone**:

| MedaTech Concept                          | Table / Column                                | Status |
|-------------------------------------------|-----------------------------------------------|:------:|
| §5.2.1 Subchapters                        | `erp_proj_control_subchapters`                | ✅ |
| §5.2.2 Chapters                           | `erp_proj_control_chapters`                   | ✅ |
| §5.2.3 Subjects                           | `erp_proj_control_subjects`                   | ✅ |
| §5.2.4 Resources + is_quantifiable + UOM  | `erp_proj_control_resources`                  | ✅ |
| §5.2.5 Item-family defaults               | (planned for A.5+)                            | ⬜ |
| §5.2.6 Item defaults + conversion         | (planned for A.5+)                            | ⬜ |
| §5.2.7 Costing-items family               | (planned — `is_costing_resource` flag)        | ⬜ |
| §5.5 Editions (3 flags + unique)          | `erp_proj_planning_versions` extended         | ✅ |
| §5.5.2 Approved-edition lock              | (trigger missing)                             | ⬜ |
| §5.5 BOQ 4 segments                       | `erp_proj_boq_lines` extended                 | ✅ |
| §5.5 Header rows (qty without price)      | (current schema requires non-null unit_price) | ⚠️ |
| §5.5 Resource BOM                         | `erp_proj_boq_resources`                      | ✅ |
| §5.5.3 `imported_from_contract` flag      | (column missing)                              | ⬜ |
| §6.2.4 Control cuts on every document     | (PO / contract / invoice line columns)        | ⬜ |
| §6.3.4 Control Periods table              | `erp_proj_control_periods` (missing)          | ⬜ |
| §6.3.5 Cost collection RPC                | `erp_collect_costs(...)` (missing)            | ⬜ |
| §6.3.7 Workbench                          | UI missing                                    | ⬜ |
| §6.3.8/9 Forecast-to-completion           | column on period rows (missing)               | ⬜ |
| §6.4 Planning-vs-actual screen            | page missing                                  | ⬜ |
| §6.5 Budget overrun warning               | trigger missing                               | ⬜ |
| §6.6 Control reports                      | print templates missing                       | ⬜ |
| Demo seed: subject/resource/edition/BOQ   | included                                      | ✅ |

The **demo seed deliberately diverges** from the spec on one point: the spec
labels resource `3001 = קבלן חשמל` and `1001 = צינורות`. The Sprint A.4 seed
uses `1001 = קבלן חשמל` per the explicit user instruction. **No action
required** — flagged here for traceability only.
