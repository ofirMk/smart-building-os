---
title: "MedaTech Priority ERP — §7 Tender Engine (Tenders & RFQs)"
source: original DOCX (איפיון מערכת ניהול.docx)
ingested_at: 2026-05-12
ingested_by: Cascade (Sprint T1 — Tender Engine)
status: canonical-reference
scope: §7 (full tender lifecycle — tender header, planning editions, BOQ
       intake, sub-tenders, RFQs to subcontractors, quote ingestion,
       comparison, and winner selection).
related:
  - docs/ingested-specs/medatech-master-data-procurement-module.md (§1+§2 — RFQ basics in §2.2.14-15)
  - docs/ingested-specs/medatech-priority-project-module.md (§5+§6 — projects + cost control)
  - docs/ingested-specs/medatech-contracts-module.md (§3 — owner/sub contracts)
---

# MedaTech §7 — מנוע מכרזים

> **Note on §2 vs §7 split.** §2.2.14-15 describe the *generic* RFQ → Quote →
> Comparison-report flow used in everyday procurement (already implemented as
> `erp_rfqs` + `erp_vendor_quotes`). **§7 is the bigger module** — a
> tender-management *engine* built around a project's planning edition,
> supporting sub-tenders, bulk RFQ generation from the BOQ, and a winner
> selection that propagates to all line items. This document covers §7.

---

## §7.1 General

A *tender* (מכרז) is a project-level container that holds:
- A **header** with the project's general parameters (estimator, dates,
  documents, internal/customer-facing notes).
- One or more **planning editions** (`מהדורות תכנון`). Each edition is flagged
  as exactly one of: **tender edition** (`מהדורת מכרז`), **zero edition**
  (`מהדורת אפס`), or **execution edition** (`מהדורת ביצוע`). At most one
  edition of each type can be active per project at any time.
- A **BOQ** (`כתב כמויות`) — entered manually or imported. The estimator can
  set unit prices manually OR mark items to receive fresh quotes from
  subcontractors via the bulk-open program (§7.3.2).
- One or more **sub-tenders** (`תת מכרז`). A sub-tender is the unit of
  competition: one winner per sub-tender, drawn from the quotes received from
  the participating subcontractors.

### §7.1.1 Editing locked editions
The system parameter `מורשה לפתיחת מהדורה` (per-user, on `נתונים לחברה
נוכחית`) determines whether a user can re-open an approved edition for edits.

### §7.1.2 Tender-edition flag
The `מהדורת מכרז` flag distinguishes the tender edition from the execution
edition for reports and analytics. Only one edition may carry this flag.

---

## §7.2 Creating the tender (`הקמת מכרז`)

The estimator opens a project record and fills:

| Field             | Hebrew                  | Notes                                        |
|-------------------|-------------------------|----------------------------------------------|
| project_number    | מס. פרויקט              | mandatory unique                             |
| description       | תיאור                   | mandatory                                    |
| customer          | לקוח                    | links to client master                       |
| status            | סטטוס                   | טיוטה / הוגש / ניצח / הפסיד                  |
| internal_notes    | הערות להגשה             | for internal status report                   |
| customer_notes    | הערות מזמין להגשה        | from customer's submission package           |
| estimator_user    | משתמש                   | the estimator                                |
| submission_date   | תאריך הגשה              | when bid was submitted                       |
| validity_until    | בתוקף עד                 | bid validity window                          |

---

## §7.3 Pricing vs. subcontractors (`תמחור מול קבלני משנה`)

### §7.3.1 Manual RFQ creation (`הקמת בקשות להצעות מחיר`)
RFQs are managed in the `הצעות מחיר מספק` screen. Header fields:

| Field              | Hebrew              | Notes                                                                           |
|--------------------|---------------------|---------------------------------------------------------------------------------|
| supplier_id        | מס. ספק             | the subcontractor                                                               |
| contact_name       | איש קשר             | from supplier's contact list                                                    |
| request_date       | תאריך               | date the request is created                                                     |
| status             | סטטוס               | טיוטא → בקשה (must be `בקשה` before sending to the subcontractor)               |
| project_id         | פרויקט              | the linked project                                                              |
| planning_version_id| מהדורת הפרויקט      | which planning edition the RFQ is bound to                                      |
| contract_type      | סוג חוזה            | the future contract type to derive when this RFQ wins                           |
| sub_tender_code    | תת מכרז             | grouping for competition                                                        |

Detail rows (`הצעות מחיר - פרוט`):

| Field         | Hebrew      | Notes                                       |
|---------------|-------------|---------------------------------------------|
| section_path  | מספר סעיף   | `מבנה/פרק/תת-פרק/סעיף`                       |
| description   | תיאור סעיף  | short description                            |
| sku           | מק"ט        | optional item link                          |
| quantity      | כמות        | required quantity                            |
| unit_price    | מחיר ליחידה | the price quoted by the subcontractor       |

Sub-screens:
- **`הצעת מחיר מספק - טקסט`** — free-text notes for the quote.
- **`נספחים`** — file attachments (technical specs etc.).

### §7.3.2 Automatic programs (`שיטות אוטומטיות לפתיחת/עדכון הצעות מחיר`)

Three bulk programs exist:

#### G1. `פתיחת/עדכון הצעה לקבלני משנה`
Opens or refreshes RFQs based on the BOQ:
1. Input — project, planning edition, sub-tender, list of BOQ items.
2. For each item — set an **absolute price** OR a **multiplier** for the
   estimator's reference price.
3. Choose subcontractors to send the RFQ to.
4. **System constraint** — at most `NumOfNewPprof` open quotes can exist for
   the same supplier+contract-type+sub-tender at once. The constant
   `NumOfNewPprof` lives in the `קבועי מכרזים` (tender system parameters)
   screen.
5. Each detail row is back-linked to the project + the source BOQ line.

#### G2. `העתקת הצעות מחיר לקבלנים`
Clones an existing quote to another subcontractor:
- **Dedup rule** — the system **does not** open a new quote if one already
  exists for the same `(supplier, contract_type, sub_tender)`.
- Same `NumOfNewPprof` cap applies.

#### G3. `מחיקת סעיפים מהצעות מחיר`
Bulk-delete selected items from a quote:
- Input — project, sub-tender, items to delete.
- Items are deleted via a delete-interface (audit trail).
- **Header items** cannot be deleted while child detail rows still exist.
- Only quotes in a status that allows changes can be modified.

### §7.3.3 Sending the RFQ + capturing prices

Three send channels:
- `הדפסת הצעת מחיר מספק` — direct print as HTML/PDF with the sub-tender
  payload.
- Excel export — full grid as XLSX.
- (Mailing/manual delivery is out of scope.)

Three capture channels:
- Manual entry of unit prices on the existing RFQ rows.
- Excel paste/import — strict line-for-line match required between the
  supplier's sheet and the system's RFQ rows.
- (PDF/OCR capture — out of scope.)

### §7.3.4 Quote comparison (`השוואת הצעות מחיר מקבלנים`)
Report `השוואת הצעות מחיר קבלנים למכרזים` shows side-by-side prices across
participating subcontractors per sub-tender, with totals and a delta column
vs. the estimator's reference price. This is the decision-support tool for
the estimator to pick a winner.

### §7.3.5 Marking the winner (`עדכון הצעה זוכה`)
- Exactly **one quote per sub-tender** can be marked as winner.
- When a quote is marked as winner, **all its detail rows are auto-marked
  as winning lines**, *except* rows whose price is `0` (deliberate exclusion
  for items priced at zero, typically free-of-charge items).
- The marker writes back to:
  - `quote.is_winner = true` (others in the same sub-tender → `false`)
  - `quote.status = ACCEPTED`
  - All non-zero-price `quote_lines.is_winner = true`
- This also makes the quote eligible for conversion into a contract (per the
  supplier's `agreement_type` from §2.1.2 — `NEW_CONTRACT` / `FRAME_PO` /
  `PRICE_LIST` / `AD_HOC`).

---

## System parameters (`קבועי מכרזים`)

| Parameter        | Default | Purpose                                                      |
|------------------|---------|--------------------------------------------------------------|
| `NumOfNewPprof`  | `5`     | Max simultaneously-open quotes per (supplier, contract_type, sub-tender). Guards bulk programs G1+G2. |

---

## Compatibility map (current code vs. §7)

| Spec area                        | Implementation status                                                                  | Gap |
|----------------------------------|----------------------------------------------------------------------------------------|-----|
| §7.1 Tender header               | `tender_projects` (legacy) + `erp_rfqs` (Priority-aligned)                            | ✅ schema, ⚠️ duality |
| §7.1.x Planning editions w/flag  | `erp_proj_planning_versions` + `is_tender_edition` (existing)                          | ✅  |
| §7.2 Tender creation fields      | `tender_projects` (status DRAFT/SUBMITTED/WON/LOST + linked_project_id + linked_entity)| ✅  |
| §7.3.1 Manual RFQ                | `erp_rfqs` + `erp_rfq_lines`                                                          | ⚠️ missing `sub_tender_code` + `contract_type` + `planning_version_id` |
| §7.3.2 G1 — Bulk open from BOQ   | (not implemented)                                                                      | ⬜ GAP — closed by `erp_open_rfqs_from_boq` RPC + UI dialog |
| §7.3.2 G2 — Clone to supplier    | (not implemented)                                                                      | ⬜ GAP — closed by `erp_clone_rfq_to_supplier` RPC |
| §7.3.2 G3 — Bulk delete items    | (not implemented)                                                                      | ⬜ deferred — UX is similar to multi-select on grid |
| §7.3.3 Send/capture              | UI exists for manual; Excel send/receive partial via `tenders-pricing-client.tsx`     | ⚠️ partial |
| §7.3.4 Comparison report         | `tenders-comparison-client.tsx` exists                                                 | ✅  |
| §7.3.5 Mark winner               | (not implemented at the RPC level — only ACCEPTED status)                             | ⬜ GAP — closed by `erp_mark_winning_quote` RPC |
| `NumOfNewPprof` system parameter | (not seeded)                                                                           | ⬜ GAP — seeded in T1 migration |

---

## Sprint T1 closures (this sprint)

This sprint closes the four critical Priority parity gaps at the `erp_rfqs`
layer (the legacy `tender_projects` stack is left untouched):

1. **Schema additions** — `sub_tender_code` + `contract_type` enum +
   `planning_version_id` on `erp_rfqs`; `is_winner` boolean on
   `erp_vendor_quotes` and `erp_vendor_quote_lines`; `tender_winner_uq`
   partial-unique index on `erp_vendor_quotes`.
2. **System parameter** — seed `NumOfNewPprof` = `5`.
3. **RPCs**:
   - `erp_mark_winning_quote(p_quote_id)` — atomic winner marking with
     0-price exclusion + status sync (§7.3.5).
   - `erp_open_rfqs_from_boq(p_company_id, p_project_id, p_version_id,
     p_sub_tender_code, p_contract_type, p_supplier_ids, p_boq_line_ids)`
     — bulk RFQ generation guarded by `NumOfNewPprof` (§7.3.2 G1).
   - `erp_clone_rfq_to_supplier(p_company_id, p_rfq_id, p_target_supplier_id)`
     — single-supplier clone with dedup constraint (§7.3.2 G2).
4. **Server actions** wrapping each RPC + revalidation.
5. **UI building blocks** — `MarkWinningQuoteButton` (inline action) +
   `OpenRfqsFromBoqDialog` (multi-step wizard).

> **Out of scope for T1** (deferred to T2):
> - G3 Bulk-delete items (UX-heavy, low parity-risk).
> - Excel template upload/download for the spec format.
> - Award → contract auto-conversion using `agreement_type` (waits for T2 once
>   the new parity columns are in production).

---

> *End of §7 ingest. T1 sprint is the implementation companion of this doc.*
