# 2026-05-03 — PO Phase A: Reduced Scope After Audit

> Status: **Accepted** · Author: pair (user + assistant) · Domain: Procurement / PO

## Context

`docs/architecture/po-card-spec.md` (drafted earlier in this conversation series)
defined a Phase A migration with ~10 numbered sections (`3.A.1`–`3.A.10`),
covering: status enum extension to 10 values, metadata table, header columns,
line columns, PO types master, payment terms master, approver lists, materialized
approvers, audit logs, and seed data.

When the user asked to "close the gap with Priority before talking about UX"
and re-baseline Phase A, an audit of the existing migrations revealed that **most**
of that draft had already shipped during phases 7.3–8.2:

| Drafted in spec | Actual state |
|---|---|
| `erp_md_po_types` (3.A.5)         | ✅ exists (`20260801120000`) |
| `erp_po_approvals` (3.A.8)        | ✅ exists (`20260801120000`) |
| `erp_po_change_log` (3.A.9 lines) | ✅ exists (`20260801190000`) |
| `body_html` field                 | ✅ exists (`20260801170000`) |
| Line: `supply_date`, `discount_pct`, `line_currency`, `exchange_rate`, `price_source`, `manufacturer_name`, `line_notes` | ✅ all exist (`20260801140000`) |
| Line: `received_qty`              | ✅ exists (`20260804100000`) |
| Header: `currency`, `total_amount_*`, `general_discount_pct`, `urgency_*`, `ai_negotiation_*` | ✅ all exist (`20260730120000`, `20260801140000`) |
| Status enum: `PENDING_APPROVAL`, `SENT_TO_SUPPLIER`, `PARTIALLY_RECEIVED`, `FULLY_RECEIVED` | ✅ all added (`20260801180000`, `20260803090000`, `20260804100000`) |
| `erp_payment_terms` master         | ✅ exists (`20260529120000`) — partial seed |
| `erp_po_attachments` (DMS)         | ✅ exists (`20260801170000`, `20260801200000`) |

Treating these as "to-do" would have created duplicate columns, broken triggers,
and contradicted `R4 — No duplication` in `canonical-data-contracts.md`.

## Decision

Re-scope Phase A to **only the true remaining gap** — i.e., what Priority's SOP
demands that we still don't have:

### What Phase A *now* delivers

1. **Enum extension** (3 missing values): `PROFORMA`, `ON_SHIP`, `SHIPMENT_CONFIRMED`.
2. **`erp_po_status_types`** — metadata table with 15 Priority-aligned flags
   (`allow_changes`, `allows_gr`, `is_approved`, `is_closed`, `sends_email`,
   `is_post_approval`, `is_cancelled`, `exclude_from_reports`, `matrix_skip`,
   `external_update`, `included_in_tasks`, `is_legacy_alias`, …) plus seed for
   all 10 Priority statuses + 2 legacy aliases.
3. **Header columns** still missing: `contact_id` (FK), `receiving_warehouse_code`,
   `order_date`, `payment_terms_code` (FK), `vat_code`, `withholding_pct`,
   `shipping_addr_he`, `shipping_addr_en`, `is_confidential`, `affects_planning`,
   `closed_at`, `closed_by`.
4. **Line columns** still missing: `line_number`, `uom`, `supplier_sku`,
   `supplier_sku_description`, `budget_item_code`, `budget_utilization_date`,
   `import_cost_type`, `demand_number`, `sales_order_id`, `sales_order_line_id`,
   `line_status` (CHECK + auto-sync trigger), `is_closed_line`, `split_parent_line_id`.
5. **Payment terms seed** enrichment with non-conflicting codes
   (`03`, `04`, `05`, `06`, `07`, `P02`, `EOM`, `E30`, `E60`).

### What Phase A explicitly *does not* deliver (deferred)

* **Approver lists separate table** — superseded by `po_type_id` +
  `approval_chain_json` DSL (already in `20260801180000`).
* **`next_approver_user_id` on header** — derived at query time from
  `erp_po_approvals` ordered by `level`. No need to denormalize.
* **`erp_po_status_log` separate table** — `erp_po_change_log` (Phase 7.8) covers
  status transitions via the `entity_type='HEADER' field_name='status'` rows.
* **`current_revision` on header** — `erp_po_revisions` (Phase 7.8) tracks this
  natively.
* **Sales Order FK** (`erp_sales_orders` linkage) — column added but no FK yet,
  pending review of the existing `erp_sales_orders` schema and creation of
  `erp_sales_order_lines` if missing. To be added in Phase B'.

## Migrations

Three additive migrations, all idempotent:

| File | Concern |
|---|---|
| `20260807100000_po_status_priority_parity.sql`  | ALTER TYPE only (PG enum constraint) |
| `20260807100100_po_status_metadata_table.sql`   | Table + RLS + seed (must be a separate transaction) |
| `20260807110000_po_header_lines_priority_parity.sql` | All header & line column additions + `line_status` sync trigger |
| `20260807120000_po_payment_terms_priority_seed.sql`  | INSERT … ON CONFLICT DO NOTHING for 9 new codes |

## Consequences

* **Spec drift fixed**: `po-card-spec.md` §1 now reflects ground truth, §3 only
  describes the actual delta.
* **No breaking changes**: every existing PO row remains valid (`line_status`
  defaults to `OPEN`; new boolean flags default to safe values).
* **API & UI follow-ups**:
  * `POST /api/procurement/orders` and `PUT …` need to accept the new fields.
  * `GET /api/procurement/status-types` (new, read-only) for the UI dropdowns.
  * Tesla auto-fill at create-time: `contact_id` ← supplier primary, `currency`
    ← supplier default, `payment_terms_code` ← supplier default, etc.

## Alternatives considered

1. **Single mega-migration** — rejected: PG can't use a new enum value in the
   same transaction it was added; also harder to debug.
2. **Skip enum extension, map PROFORMA/ON_SHIP semantically** — rejected: breaks
   "feels like home" parity goal; users from Priority will look for these exact
   statuses.
3. **Drop legacy `PENDING_PRICE_APPROVAL` and `SENT`** — rejected: would break
   existing rows; instead marked `is_legacy_alias=true` and `exclude_from_reports=true`.

## Follow-ups

* Decision log file for **Phase B (UI parity)** when we begin work on the 6-tab
  refactor and 13-line sub-tabs.
* Decision log file for **Phase C (Approvals data-driven)** if we replace the
  `approval_chain_json` DSL with a normalized table.
