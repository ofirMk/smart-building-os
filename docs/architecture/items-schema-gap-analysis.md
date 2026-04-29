# Items Schema Gap Analysis

## Purpose
This report compares legacy Items schemas (`items_catalog`, `supplier_items`) against the canonical Items domain (`erp_md_items`, `erp_md_product_families`) to de-risk migration of legacy Procurement/AI screens.

## Scope and Sources
- Canonical contract: `docs/architecture/canonical-data-contracts.md`
- Canonical migrations:
  - `supabase/migrations/20260626120000_erp_master_data_multitenant_foundation.sql`
  - `supabase/migrations/20260626133000_erp_master_data_contract_alignment.sql`
  - `supabase/migrations/20260627123000_erp_procurement_master_data_rfq_engine.sql`
  - `supabase/migrations/20260627133000_item_catalog_hierarchy_engine.sql`
- Legacy schemas and usage:
  - `supabase/snippets/archive-root-marker-ofek/marker_ofek_procurement.sql`
  - `supabase/snippets/archive-root-marker-ofek/marker_ofek_supplier_items.sql`
  - `supabase/snippets/archive-root-marker-ofek/marker_ofek_ai_invoices.sql`
  - `supabase/migrations/20260401213000_invoice_items_supplier_sync.sql`
  - Legacy runtime usage in procurement/AI screens and APIs.

---

## Current Canonical Snapshot (Items Domain)

### `erp_md_product_families` (canonical family master)
Key fields:
- `id`
- `company_id` (tenant key)
- `family_code` + `code` (duplicate naming currently co-exists)
- `name`
- `family_type_id`
- `default_budget_sub_chapter`
- `default_resource_id`
- timestamps

### `erp_md_items` (canonical item master)
Key fields:
- `id`
- `company_id` (tenant key)
- identity/description: `item_number`, `description`, `foreign_description`
- UOM: `unit_of_measure` (and also `uom` added by alignment migration)
- family linkage: `product_family_id` (and also `family_id`)
- operations: `is_inventory_managed`, `status`, `item_type`, `min_order_quantity`
- planning defaults: `budget_sub_chapter`, `resource_id`
- override flags: `budget_sub_chapter_manual_override`, `resource_id_manual_override`
- timestamps

Note: canonical tables currently carry dual/legacy-compatible columns (`item_number` + `sku`, `unit_of_measure` + `uom`, `product_family_id` + `family_id`). API currently reads/writes `item_number`/`unit_of_measure`/`product_family_id`.

---

## Legacy Snapshot

### `items_catalog` (deprecated)
Observed fields across legacy SQL + active code:
- `id`
- `sku`
- `description`
- `unit`
- `category`
- `default_price`
- `is_inventory`
- `created_at`
- `internal_sku` (added later)
- `last_price` (added later)
- `additional_attributes` jsonb (AI/OCR dynamic payloads)

### `supplier_items` (deprecated)
Observed fields across legacy SQL + active code:
- `id`
- `master_item_id` (FK to `items_catalog.id`)
- `supplier_id`
- `supplier_sku`
- `unit_price`
- `discount_pct`
- `last_updated`
- `is_preferred`
- `last_price` (used by legacy ingestion/action flows)

Related legacy table used by active flows:
- `supplier_item_prices` (used for historical price lookups/comparison in PO flows and ingestion)
  - observed fields from runtime queries: `master_item_id`, `supplier_id`, `supplier_sku`, `last_price`, `last_price_date`

---

## Column Mapping (Legacy -> Canonical)

### A) `items_catalog` -> `erp_md_items` / `erp_md_product_families`

| Legacy field | Canonical target | Status |
|---|---|---|
| `id` | `erp_md_items.id` | Different identity domain; cannot carry over 1:1 blindly |
| `sku` | `erp_md_items.item_number` | Mappable |
| `description` | `erp_md_items.description` | Mappable |
| `unit` | `erp_md_items.unit_of_measure` | Mappable |
| `is_inventory` | `erp_md_items.is_inventory_managed` | Mappable |
| `category` | `erp_md_product_families.family_code/name` + `erp_md_items.product_family_id` | Requires lookup/mapping table |
| `created_at` | `erp_md_items.created_at` | Mappable (if preserving history) |
| `internal_sku` | no canonical direct field | **Gap** |
| `default_price` | no canonical direct field on `erp_md_items` | **Gap** |
| `last_price` | no canonical direct field on `erp_md_items` | **Gap** |
| `additional_attributes` (jsonb) | no canonical AI metadata field | **Gap** |

### B) `supplier_items` -> canonical model

| Legacy field | Canonical target | Status |
|---|---|---|
| `master_item_id` | implied `erp_md_items.id` relation | No canonical link table in current `erp_md_*` contract |
| `supplier_id` | `erp_md_suppliers.id` | Exists on supplier side only |
| `supplier_sku` | no canonical direct field on item-supplier relation | **Gap** |
| `unit_price` | no canonical item-supplier spot price field in `erp_md_*` | **Gap** |
| `discount_pct` | no canonical field | **Gap** |
| `is_preferred` | no canonical preferred-supplier flag per item | **Gap** |
| `last_updated`/`last_price` | no canonical history trail per supplier-item | **Gap** |

---

## Critical Gaps (Must Be Addressed Before Legacy Sunset)

### 1) Pricing-on-item gap
Legacy screens expect item-level pricing (`default_price`, `last_price`) directly from item row; canonical item master intentionally has no direct price fields.
- Risk: procurement screens crash or lose pricing context during migration.
- Impact: PO suggestion logic, invoice AI enrichment, deviation checks.

### 2) Supplier-item mapping gap
Legacy depends heavily on direct many-to-many mapping table (`supplier_items`) with supplier SKU and negotiated terms.
- Canonical `erp_md_items` + `erp_md_product_families` do not currently provide equivalent row-level mapping.
- Existing procurement pricing tables (`erp_vendor_price_lists`, `erp_vendor_price_list_items`) are closer to commercial agreements than a lightweight master-data link expected by legacy screens.

### 3) Historical supplier price gap
Legacy flows read `supplier_item_prices` for price trend / minimum-price comparisons.
- No canonical equivalent in `erp_md_*` currently.
- Risk: loss of historical price intelligence and approval logic regressions.

### 4) AI/OCR metadata gap
Legacy `items_catalog.additional_attributes` stores flexible OCR/supplier metadata.
- Canonical has no equivalent JSONB extension field at item-level.
- Risk: ingestion pipelines lose enriched metadata or need ad-hoc side storage.

### 5) Internal SKU / alias identity gap
Legacy uses `internal_sku` for deterministic matching and idempotency.
- Canonical currently centers on `item_number`, without explicit alias/synonym model.
- Risk: weaker matching quality in OCR/import and duplicate item creation.

### 6) UOM normalization mismatch
Legacy stores free-text `unit`; canonical uses constrained ERP-style UOM semantics.
- Requires normalization mapping table/rules to avoid dirty migrations.

---

## Multi-Supplier Support Verdict

### Does canonical support multiple suppliers per item natively today?
**Not in the `erp_md_*` canonical Items contract.**

What exists today:
- `erp_md_items` and `erp_md_product_families` (item/family master)
- procurement tables for price lists and RFQ flows (`erp_vendor_price_lists`, `erp_vendor_price_list_items`, quote tables)

What is missing for parity with current legacy usage:
- a canonical, tenant-safe item-supplier mapping table with fields needed by master-data/procurement UX (supplier SKU, preferred supplier, current/last price, optional discount, audit dates).

### Recommendation before deprecating `supplier_items`
Design and approve a canonical table such as `erp_md_supplier_items` (or equivalent) with:
- `company_id` (mandatory tenant key, indexed)
- `item_id` -> `erp_md_items.id` (company-scoped FK)
- `supplier_id` -> `erp_md_suppliers.id` (company-scoped FK)
- `supplier_sku`
- `is_preferred`
- `current_unit_price` (optional)
- `discount_pct` (optional)
- `last_price` + `last_price_date` (or separate history table)
- timestamps + unique `(company_id, item_id, supplier_id)` and optional unique `(company_id, supplier_id, supplier_sku)`

This should be paired with a history table for audit/analytics if price timeline is required by approvals and AI.

---

## Migration Safety Notes (No Implementation Yet)
- Do not sunset legacy screens that require `supplier_items` / `supplier_item_prices` until canonical supplier-item model is approved.
- Do not delete legacy pricing columns from adapters until canonical price read-model is available.
- Keep migration adapter layer explicit: legacy read -> canonical DTO mapping -> UI.

