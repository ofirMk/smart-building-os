---
title: MedaTech Specification × Implementation Compatibility Audit
audit_date: 2026-05-12
author: Cascade (compatibility-audit response — God Mode pause)
trigger: User raised concern that chapters 1, 2, 3 had not been actively
         cross-checked between the MedaTech spec and our modules before
         building Sprint W2.
scope:
  - §1 General — UI conventions, BPM, permissions
  - §2 Procurement — items, suppliers, POs, GR, invoices, RFQs, frame POs
  - §3 Owner/Subcontractor — contracts, change-orders, partial bills, raw-material offset
  - §5 Projects — control infrastructure + budget editions
  - §6 Cost Control — periods, snapshots, forecast
source_specs:
  - docs/ingested-specs/medatech-master-data-procurement-module.md (§1+§2, ingested today)
  - docs/ingested-specs/medatech-contracts-module.md (§3)
  - docs/ingested-specs/medatech-priority-project-module.md (§5+§6)
out_of_scope_chapters:
  - §4 Inventory (not yet ingested)
  - §7 Tenders (only TOC-level; deeper ingest pending)
  - §8 Finance / AR / AP (deferred to "finance polish" milestone)
  - §9 Open questions for the customer
status: definitive (Cascade signed off on each row based on live code + migration grep)
---

# MedaTech Compatibility Audit — 2026-05-12

> **Why this audit exists.** When closing out Sprint W2 Stage 4 the user
> challenged: *"Did you also scan chapters 1, 2, 3 and validate them against
> our modules? Full inter-module compatibility is required."* The honest
> answer was **no** — Stage 3 had built §3 (W2) from scratch but no
> structured gap-analysis had been performed across the spec corpus.
>
> This document is that audit. It is the **source of truth** for which
> MedaTech requirements are implemented, which are partial, and which are
> still open. Future sprints should update the relevant row here before
> closing.

## Legend
- ✅ **Met** — implementation matches the spec rule.
- ⚠️ **Partial** — implementation exists but is missing a configurable,
  a UI surface, or a sub-rule from the spec.
- ⬜ **Gap** — no implementation; explicit decision needed (defer or build).
- 🟢 **Bonus** — we implemented something the spec doesn't require but is
  a Tier-1 expectation (e.g. AI Copilot).

---

## Section A — §1 General Conventions

| § | Rule | Implementation | Status |
|---|------|----------------|:---:|
| §1.0 | Single-environment per organization | Multi-tenant via `company_id` + RLS (architectural superset) | 🟢 |
| §1.1 | UI primitives (screen, child-screen, query-screen, choose-list, warning, error, report) | shadcn/ui + Data Grid + Sheet + dialogs; toasts for warning/error; print pages for reports | ✅ |
| §1.2.1 | BPM — status transitions + transition notifications | Per-workflow server actions + Postmark email engine. No central BPM editor (status DSL hard-coded per entity) | ⚠️ functional parity, not configurable |
| §1.2.2 | Business-rule generator (warnings, restrictions on fields) | Zod validators (server) + form-level guards; no UI rule-editor | ⚠️ functional parity, not configurable |
| §1.2.3 | Data generator (auto-fill columns) | Supabase triggers + server-side computed columns (PO number, vat_pct resolver) | ✅ |
| §1.3 | Permissions by group + per-screen / per-column granularity | Supabase Auth + RLS (per-table policies); no per-column masking yet | ⚠️ row-level only |
| §1.3 | Warning → error promotion per role | Severity is hard-coded; no configurable per-role override | ⬜ |

**Section A verdict:** Functional parity achieved for the operational
features. The "configurable rule engine" capabilities (BPM editor, rule
generator, column masking) are deliberately deferred — Tier-1 customers in
modern SaaS rarely need them and they add significant surface area. **No
action required** for Sprint W2.

---

## Section B — §2 Procurement

| § | Rule | Implementation | Status |
|---|------|----------------|:---:|
| §2.1 | Order → GR → Invoice default flow + exceptions | `erp_purchase_orders` → `erp_grn` → `erp_vendor_invoices` (3-way match foundation in `20260805120000_3way_match_foundation.sql`) | ✅ |
| §2.1.1 | General-purpose project for overhead | Convention, not enforced; no seed "General Project" record | ⚠️ |
| §2.1.2 | Per-supplier agreement type enum (PRICE_LIST / FRAME_PO / QUOTE) | No `agreement_type` field on `erp_md_suppliers` — implicit via record existence | ⬜ |
| §2.2.2 | PO lifecycle DRAFT→APPROVED→SENT→CLOSED | Status enum + transitions in PO route; SENT requires manual transition per spec | ✅ |
| §2.2.2 | "Possible prices for product" sub-view | No dedicated screen | ⬜ |
| §2.2.2 | PO basis from Quote or Frame PO with line auto-populate | Smart-pricing engine + `supplier-item-mapping` resolves price; basis-link UI minimal | ⚠️ |
| §2.2.3 | GR multi-PO linking | GRN schema supports multi-PO via line-level link | ✅ |
| §2.2.3 | GR reopen program (Final → Draft if not invoiced) | No `reopen_grn` RPC | ⬜ |
| §2.2.4 | Return-to-Vendor (RtV) doc, GR-based, credit-note linkage | Not implemented | ⬜ |
| §2.2.5 | Consolidated vendor invoice, qty/price variance tracking, header `הפרש מחיר` | `erp_vendor_invoices` + line-level deviation; 3-way match flags variance | ✅ |
| §2.2.5 | Invoice closure → `סגירת חשבונית` (book to GL) | GL posting not wired (deferred to finance milestone) | ⚠️ |
| §2.2.5 | Invoice cancellation programs (current-date / origin-date reversal) | Not implemented | ⬜ |
| §2.2.6 | Debit invoice to vendor (over-charge) | Not implemented as separate entity | ⬜ |
| §2.2.7 | Mandatory `project_id`, `control_subchapter_id`, `control_resource_id` on every line | PO lines: enforced. GRN/Invoice lines: column exists, NOT-NULL constraint not consistently applied | ⚠️ |
| §2.2.7 | Auto-roll of subchapter+resource from upstream doc | Implemented for PO → GRN; partial for GRN → Invoice | ⚠️ |
| §2.2.8 | Item families two-level (family_type → family) | `erp_md_item_family_types` + `erp_md_item_families` | ✅ |
| §2.2.9 | Item master with full field set (SKU, desc, foreign-desc, family, status, UOM, type, inventory-managed) | `erp_md_items` + `items-purchase-factory-uom-fields` migration | ✅ |
| §2.2.10 | Supplier master with all child screens (items, contacts, finance, bank, alert) | Supplier card scaffold with multiple tabs; finance & bank tabs present | ✅ |
| §2.2.10 | Supplier numbering bands (700000 / 800000) | `supplier_num` is free-text; no range enforcement | ⚠️ |
| §2.2.10 | Auto-create matching GL account per supplier | Not wired (no GL chart of accounts yet) | ⬜ |
| §2.2.10 | Per-supplier popup alert on any doc | Not implemented | ⬜ |
| §2.2.10 | Supplier bank-detail change log | No audit trail on bank details | ⬜ |
| §2.2.11 | Items-per-supplier cross-walk + supplier UOM override | `supplier-item-mapping` table; UI in supplier card | ✅ |
| §2.2.12 | Supplier price list — tiered + history + effective date | `erp_md_supplier_price_lists` with effective_from/to + tier support | ✅ |
| §2.2.12 | Programs: copy / build / bulk-update by % | Copy + build exist; bulk-update by % NOT implemented | ⚠️ |
| §2.2.13 | Frame POs (Blanket POs) — commitment with auto-decrement | `erp_blanket_purchase_orders` + lines | ✅ schema, ⚠️ UI partial |
| §2.2.14 | RFQ master + line + multi-supplier fan-out | `erp_rfqs` + `erp_rfq_lines`; manual duplicate-per-supplier matches spec | ✅ schema, ⚠️ UI partial |
| §2.2.15 | Vendor quote capture + comparison report | `erp_vendor_quotes` + basic comparison view; full tender-flow is §7 | ⚠️ |

**Section B verdict:**
- **Strong coverage** of master-data (items, suppliers, families, price
  lists) and the happy-path P2P flow (PO → GR → Invoice).
- **Real gaps** (high business value): Return-to-Vendor, debit-invoice,
  GR-reopen, invoice cancellation, GL booking, supplier-agreement-type enum.
- **UI gaps** (schema exists, UX missing): RFQ + Frame PO + Vendor Quote
  screens are functional but not first-class workspaces. They feed the
  upcoming §7 Tenders work, so these UI gaps will naturally close.

---

## Section C — §3 Owner / Subcontractor Contracts

| § | Rule | Implementation | Status |
|---|------|----------------|:---:|
| §3.1 | Contract types: BOQ / LUMP_SUM / COST_PLUS | `pricing_method` enum on `erp_subcontractor_contracts` | ✅ |
| §3.1 | Both sides modelled (owner / subcontractor) | `erp_subcontractor_contracts` exists; **`erp_client_contracts` deferred to Phase 3** | ⚠️ subcontractor-only today |
| §3.1 | Per-line tax/discount overrides | `vat_pct` resolved by `getVatMultiplier`; discount/escalation supported | ✅ |
| §3.2.1 | Contract setup with `subchapter` + `resource` defaults | Header has `default_subchapter_id`; lines override | ✅ |
| §3.2.1.1 | Change-order discipline (immutable history + APPROVED-only consumption) | `erp_contract_amendments` + `erp_create_change_order` RPC + `CONTRACT_CHANGE_ORDER_REQUIRES_APPROVAL` param | ✅ (Sprint W2 Stage 3) |
| §3.2.2 | Partial Account (Progress Certificate) header + lines + auto-populate | `erp_subcontractor_bills` + lines; waterfall RPC `erp_compute_subcontractor_bill_waterfall` | ✅ |
| §3.2.2 | Calculation program — cumulative escalation per partial account | Implemented in waterfall RPC (sequence: retention → insurance → advance recovery → escalation → raw-material offset) | ✅ |
| §3.2.2 | Manual offset / retention override per line | Supported via line-level columns + recalc trigger | ✅ |
| §3.2.2 | Raw-material offset reporting per line | Implemented; auto-trigger from vendor invoice (Sprint W2 Stage 3) | ✅ |
| §3.2.2 | Output: print + submit | Print template exists; submit transitions status | ✅ |
| §3.2.2.1 | Submitted vs Approved dual-ledger (owner side) | `erp_update_bill_by_approved` RPC + Dual-Pane UI (Sprint W2 Stage 3) | ✅ |
| §3.2.2.2 | AGGREGATE-only submitted mode blocks DETAILED approved | `bill_entry_mode` enum + RPC validation | ✅ |
| §3.2.3 | Linking invoice → partial account (consolidated invoice) | Invoice schema supports linkage; UI minimal | ⚠️ |
| §3.3 | Raw-material offset (`קיזוז חומר גלם`) with configurable trigger stage | `RAW_MATERIAL_OFFSET_TRIGGER_STAGE` system parameter (PO / GRN / VENDOR_INVOICE) | ✅ |
| §3.3 | Cost-control linkage: same subchapter+resource on PO + offset row | Implemented via auto-trigger; preserves dimensions | ✅ |
| §3.3 | Edge case: partial allocation across multiple bills | Supported by allocation tracking on offset rows | ✅ |
| 3-NEW | `vat_pct` resolution by system parameter `DEFAULT_VAT_PCT` per company | Migrated Sprint W2 Stage 4 (`getVatMultiplier(companyId)`) | ✅ |

**Section C verdict:** **Strong, deliberate coverage** — §3 was built
from scratch in Sprint W2 specifically to match this spec. Only gaps:
- **Owner-side mirror** (`erp_client_contracts` + `erp_compute_client_bill_waterfall`) — Phase 3, deliberately deferred.
- **Consolidated invoice ↔ partial-account UI flow** — schema ready, UX
  needs a workspace screen.

---

## Section D — §5+§6 Projects + Cost Control

> **Important update:** The implementation-status table inside
> `medatech-priority-project-module.md` is **stale**. It reflects commit
> `f56c05c0` (Sprint A.4) — but since then `20260903100000_erp_cost_control.sql`
> (Sprint A.5) has closed many of the marked gaps. The audit below reflects
> the **current** code, not the historical Sprint-A.4 snapshot.

| § | Rule | Implementation | Status |
|---|------|----------------|:---:|
| §5.2.1 | Subchapters table | `erp_proj_control_subchapters` | ✅ |
| §5.2.2 | Chapters table | `erp_proj_control_chapters` | ✅ |
| §5.2.3 | Subjects table | `erp_proj_control_subjects` | ✅ |
| §5.2.4 | Resources w/ is_quantifiable + UOM + conversion_ratio | `erp_proj_control_resources` with full field set | ✅ |
| §5.2.5 | Item-family defaults (subchapter + resource) | Implemented via migration `20260903100000` and earlier additions | ✅ |
| §5.2.6 | Item defaults + conversion_ratio | Implemented; special items (retention / offset / escalation / advance) covered | ✅ |
| §5.2.7 | Costing-items family flag `is_costing_resource` | Flag present on items + UI filter | ✅ |
| §5.2.8 | UOM pseudo-items | Implemented as part of seed | ✅ |
| §5.3 | Budgeting terminology (Structure / Chapter / Subchapter / Item segments) | BOQ has the 4-segment code structure | ✅ |
| §5.4 | New-project setup (customer, PM, type, dates, Edition 0 chain) | `erp_proj_projects` + auto-create-edition flow | ✅ |
| §5.5.1 | BOQ structure with header rows (qty without price) | **Schema requires non-null unit_price on detail rows** — header rows handled via `is_header` flag added post-A.4 | ✅ |
| §5.5.2 | Three exclusive edition flags (tender / base / execution) | `erp_proj_planning_versions` extended; partial unique index | ⚠️ flags exist; uniqueness constraint not enforced for all three |
| §5.5.2 | Approved-edition lock (DB-level) | Trigger added in Sprint A.5 migration | ✅ |
| §5.5.2 | "מורשה לפתיחת מהדורה" override role | Not implemented as a distinct role | ⬜ |
| §5.5.3 | Auto-import sections from change orders (`imported_from_contract` flag) | Column added; auto-import program not wired | ⚠️ |
| §6.2.4 | Mandatory `(project, subchapter, resource)` on every cost-impacting doc | Enforced on PO; partial on GRN/Invoice (see §2.2.7) | ⚠️ |
| §6.3.3 | Open Control Account = new execution edition | Supported by edition lifecycle | ✅ |
| §6.3.4 | Open Control Period (snapshot, MM/YY) | `erp_proj_control_periods` table | ✅ |
| §6.3.5 | Cost-collection RPC | `erp_collect_costs(p_company_id, p_project_id, p_control_month)` | ✅ |
| §6.3.5 | Nightly `TODAY` snapshot job | RPC exists; cron job not yet scheduled | ⚠️ |
| §6.3.6 | Drill-down screen (per subchapter / resource / both / per doc) | Cost Control Cockpit (`cost-control-cockpit.tsx`) — drill-down per subchapter+resource | ✅ |
| §6.3.7 | Workbench for assigning subchapter/resource on undimensioned docs | UI exists at procurement line level (line-enrichment dialog); central workbench partial | ⚠️ |
| §6.3.8/9 | Revenue + expense forecast-to-completion per period | `erp_proj_control_forecasts` table | ✅ |
| §6.4 | Planning-vs-actual screen | Cost Control Cockpit shows side-by-side | ✅ |
| §6.5 | Budget-overrun warning on document save | Implemented at line-deviation level (3% rule); per-(subchapter,resource) overrun check NOT applied at save time | ⚠️ |
| §6.6 | Control reports per period | Print templates partial; standard "variance / drilldown" reports not all delivered | ⚠️ |

**Section D verdict:** **Dramatically better than the stale doc claimed.**
The biggest open items are now:
- Per-(subchapter, resource) **save-time** budget-overrun guard (§6.5).
- Nightly `TODAY` snapshot cron job.
- `imported_from_contract` auto-import program (currently manual).

---

## Section E — Inter-module compatibility (focus of this audit)

This section answers the user's question explicitly: **do the modules
fit together at the seams?**

| Seam | Test | Status |
|------|------|:---:|
| §3 W2 ↔ §2 Procurement: raw-material auto-offset | `erp_apply_raw_material_offset_from_invoice` trigger reads vendor-invoice rows and writes offset rows on the contract bill. Subchapter+resource preserved. | ✅ verified in Stage 3 |
| §3 W2 ↔ §2 VAT: `vat_pct` resolution | `getVatMultiplier(companyId)` reads `DEFAULT_VAT_PCT` system parameter; falls back to `bill.vat_pct` then to 17%. Migrated Stage 4. | ✅ |
| §3 W2 ↔ §6 Cost Control: bill rows roll up to control snapshots | `erp_collect_costs` aggregates from `erp_subcontractor_bill_lines` via subchapter+resource | ✅ |
| §2 PO ↔ §6 Cost Control: PO lines as actuals | `erp_collect_costs` includes PO + GR + Invoice + Bill in actuals | ✅ |
| §2 RFQ ↔ §7 Tenders: bid-comparison feed | `erp_vendor_quotes` table exists; full Tender Engine is **next module to build** (Sprint T1 per the prompt I sent you) | ⚠️ ready to extend |
| §3 W2 ↔ §5 Planning: change-order imports to new BOQ section | `imported_from_contract` column exists; auto-import program **NOT wired** | ⬜ |
| §3 W2 Phase 3 ↔ §3 W2 Phase 2: owner-side mirror | `erp_client_contracts` + mirror RPCs **NOT YET BUILT** — deferred to Phase 3 | ⬜ deliberate defer |
| §1 BPM ↔ all modules: status-transition notifications | Hand-coded per workflow; works in W2 (Postmark wired) | ✅ |

---

## Findings — Top 5 priorities to close before Sprint T1 (Tenders)

These are the items where **leaving the gap open will cost us real
compatibility issues** when Tender Engine starts feeding contracts:

1. **§3 Phase 3 — Owner-side contract mirror.**
   Tender Engine will produce a winning bid that becomes a `client_contract`
   on the owner side. Without `erp_client_contracts` and the mirror waterfall,
   we'll have to refactor mid-Tender. **Recommended:** schedule one focused
   session to build the mirror before T1, even if minimal.

2. **§5.5.3 — `imported_from_contract` auto-import program.**
   When a change-order issues a NEW_LINE (Stage 3 RPC), the BOQ does not
   auto-receive the new section. This breaks the loop §3 ↔ §5. **Recommended:**
   add a small RPC `erp_import_change_order_to_boq` triggered from `erp_create_change_order`.

3. **§6.5 — Budget-overrun guard at line save.**
   Currently the 3% deviation rule fires on lines but the **per-(subchapter,
   resource) cumulative overrun** check is missing. A PO line that would
   blow the resource budget passes silently. **Recommended:** add a
   `BEFORE INSERT/UPDATE` trigger on PO/GR/Invoice lines comparing committed
   sum against `current_budget × tolerance`. Severity configurable.

4. **§2.2.7 — Mandatory dimensions on GRN/Invoice lines.**
   Inconsistent NOT-NULL across the P2P chain. Cost-collection picks up
   undimensioned rows silently and they don't roll up. **Recommended:**
   tighten NOT-NULL after a backfill migration.

5. **§2.1.2 — `supplier_agreement_type` enum on suppliers.**
   When Tender Engine awards a bid, knowing the supplier's agreement type
   determines whether to auto-create a Frame PO, a Quote, or a one-shot PO.
   Today that decision is implicit. **Recommended:** add an enum column with
   a default of `QUOTE`; backfill is mechanical.

---

## Findings — Non-critical gaps (defer with explicit decision)

- §1.3 column-masking by role — **defer** (premature)
- §1.2 configurable BPM editor — **defer** (rule generator out of scope)
- §2.2.3 GR-reopen RPC — **defer until finance polish**
- §2.2.4 Return-to-Vendor — **defer until finance polish**
- §2.2.5 invoice cancellation programs — **defer until finance polish**
- §2.2.6 debit-invoice to vendor — **defer until finance polish**
- §2.2.10 supplier popup alert — **defer** (low ROI)
- §2.2.10 supplier bank change-log — **defer** (low ROI for now; audit infra later)
- §2.2.12 bulk-price-update program — **defer** (manual update is workable)
- §6.3.5 nightly `TODAY` snapshot cron — **schedule when production**
- §6.6 missing control-reports variants — **add ad-hoc as customers request**
- §5.5.2 "מורשה לפתיחת מהדורה" role — **defer** (RLS update later)

---

## Conclusion

The codebase is **substantially more aligned** with the MedaTech spec than
the stale Sprint-A.4 status table claimed. Sprint W2 closed §3 cleanly,
and Sprint A.5 (`20260903100000_erp_cost_control.sql`) closed most of §6.
The five priority items above are the **only blockers** for clean §3 ↔ §7
integration when Tender Engine starts.

**Recommendation:** before running the Sprint T1 (Tenders) prompt, close
**at minimum** items 1 + 2 + 5 from the Top-5 list. Items 3 + 4 can run
in parallel with T1.
