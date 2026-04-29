# Canonical Data Contracts

## Purpose
This document is the **data bible** for Smart Building OS.  
Every new feature and refactor must follow canonical contracts below.  
Anything listed as `DEPRECATED` is legacy and must not be used for new writes.

## Contract Rules
- **R1:** Every business record is tenant-scoped by `company_id`.
- **R2:** UI writes only through canonical API/domain paths (no direct mixed table writes).
- **R3:** Legacy sources can be read only via adapters during migration window.
- **R4:** No new route/table duplication for existing canonical domains.

## Canonical Domains

### 1) Items (Master Data)
- **Canonical Tables:**
  - `erp_md_items`
  - `erp_md_product_families`
  - `erp_md_supplier_items` (item-supplier pricing linkage for Procurement)
- **Canonical APIs:**
  - `GET/POST /api/master-data/items`
  - `GET/PUT/DELETE /api/master-data/items/[id]`
  - `GET/POST /api/master-data/product-families`
  - `GET/PUT/DELETE /api/master-data/product-families/[id]`
  - `GET/POST /api/master-data/supplier-items`
  - `GET/PUT/DELETE /api/master-data/supplier-items/[id]`
- **Canonical App Aliases (allowed wrappers only):**
  - `/api/items` -> wrapper of `/api/master-data/items`
  - `/api/product-families` -> wrapper of `/api/master-data/product-families`

#### Items `DEPRECATED`
- `items_catalog` (legacy catalog table family)
- `supplier_items` (legacy item-supplier map)
- `supplier_item_prices` (legacy supplier-item pricing history map)
- any direct UI write path that bypasses `/api/master-data/items*`

---

### 2) Suppliers (Master Data)
- **Canonical Tables:**
  - `erp_md_suppliers`
  - `erp_md_supplier_contacts`
  - `erp_md_supplier_bank_accounts`
  - `erp_md_supplier_items` (shared with Items domain for pricing ownership)
- **Canonical APIs:**
  - `GET/POST /api/master-data/suppliers`
  - `GET/PUT/DELETE /api/master-data/suppliers/[id]`
  - `GET/POST /api/erp/master-data/suppliers/[id]/contacts`
  - `GET/PUT/DELETE /api/erp/master-data/suppliers/[id]/contacts/[contactId]`
  - `GET/POST /api/erp/master-data/suppliers/[id]/bank-accounts`
  - `GET/PUT/DELETE /api/erp/master-data/suppliers/[id]/bank-accounts/[bankAccountId]`

#### Suppliers `DEPRECATED`
- `proc_suppliers` as master record source for new features
- `proc_supplier_catalog_prices` as authoritative pricing source for new features
- any duplicated supplier profile model outside `erp_md_*`

---

### 3) Purchase Orders (Procurement)
- **Canonical Tables:**
  - `erp_purchase_orders`
  - `erp_purchase_order_lines`
  - `erp_goods_receipts`
  - `erp_goods_receipt_lines`
  - `erp_vendor_invoices`
  - `erp_vendor_invoice_lines`
- **Canonical APIs:**
  - `GET/POST /api/erp/procurement/purchase-orders`
  - `GET/PUT /api/erp/procurement/purchase-orders/[id]`
  - `GET/POST /api/erp/procurement/purchase-orders/[id]/lines`
  - `PUT/DELETE /api/erp/procurement/purchase-orders/[id]/lines/[lineId]`
  - `GET/POST /api/erp/procurement/goods-receipts`
  - `GET/PUT /api/erp/procurement/goods-receipts/[id]`
  - `GET/POST /api/erp/procurement/vendor-invoices`
  - `GET/PUT /api/erp/procurement/vendor-invoices/[id]`

#### Purchase Orders `DEPRECATED`
- `proc_purchase_orders` + `proc_purchase_order_lines` for new writes
- `proc_goods_receipts`, `proc_supplier_invoices` as authoritative source for new modules
- old mixed PO flows writing both `proc_*` and `erp_*`

---

## Migration Guardrails
- Existing screens touching `DEPRECATED` tables must be tagged as **legacy-adapter** in PR.
- Legacy adapter output must map to canonical DTOs before reaching UI.
- New tables/routes are forbidden if canonical equivalent already exists.

## Approval Workflow
- Any change to canonical ownership requires:
  1. CTO approval
  2. Update to this document
  3. Compatibility/migration note in sprint log
