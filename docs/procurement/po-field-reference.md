# Procurement Orders — Field-Level Reference

> **Purpose**: טבלת שדות ברמת פירוט מלאה לכל הטבלאות במודול. מתעדכן **בסיום כל Phase**.
> **Reading**: `Status` = ✅ קיים / 🚧 בפיתוח / ⏳ מתוכנן / ❌ לא רלוונטי לנו.
> **Naming convention**: עמודות DB ב-snake_case; DTOs ב-API ב-camelCase.

---

## 1. `erp_purchase_orders` (Header)

| # | Hebrew | DB column | PG type | Constraints | API name | UI control | Phase | Status |
|---|---|---|---|---|---|---|---|---|
| 1 | מזהה | `id` | uuid | PK, default gen_random_uuid() | `id` | hidden | 7.1 | ✅ |
| 2 | חברה | `company_id` | uuid | NOT NULL, FK→companies, RLS | `companyId` | hidden (from header) | 7.1 | ✅ |
| 3 | מס' ספק | `supplier_id` | uuid | NOT NULL, FK→erp_md_suppliers | `supplierId` | Select + F2 drill-down | 7.2 | ✅ |
| 4 | מס' הזמנה | `po_number` | text | NOT NULL, UNIQUE(company_id, po_number) | `poNumber` | readonly, auto-gen | 7.2 | ✅ |
| 5 | פרוייקט | `project_id` | uuid | NOT NULL, FK→erp_proj_projects | `projectId` | Select + F2 | 7.2 | ✅ |
| 6 | סטטוס | `status` | text | CHECK IN (...), default 'DRAFT' | `status` | badge + timeline | 7.1 | ✅ |
| 7 | מטבע | `currency` | varchar(3) | NOT NULL, default 'ILS', CHECK | `currency` | Select (ILS/USD/EUR) | 7.2 | ✅ |
| 8 | סה"כ נטו | `total_amount_net` | numeric(14,2) | NOT NULL, default 0 | `totalAmountNet` | readonly | 7.2 | ✅ |
| 9 | מע"מ | `total_amount_vat` | numeric(14,2) | NOT NULL, default 0 | `totalAmountVat` | readonly | 7.2 | ✅ |
| 10 | סה"כ ברוטו | `total_amount_gross` | numeric(14,2) | NOT NULL, default 0 | `totalAmountGross` | readonly | 7.2 | ✅ |
| 11 | הערות | `notes` | text | nullable | `notes` | textarea | 7.2 | ✅ |
| 12 | תאריך יצירה | `created_at` | timestamptz | NOT NULL, default now() | `createdAt` | readonly | 7.1 | ✅ |
| 13 | נוצר ע"י | `created_by` | uuid | FK→auth.users | `createdBy` | readonly | 7.1 | ✅ |
| 14 | תאריך עדכון | `updated_at` | timestamptz | NOT NULL, default now() | `updatedAt` | readonly | 7.1 | ✅ |
| **Phase 7.3 additions (Header Enrichment)** ||||||||
| 15 | איש קשר אצל הספק | `supplier_contact_name` | text | nullable | `supplierContactName` | Input | 7.3 | ⏳ |
| 16 | תפקיד איש הקשר | `supplier_contact_role` | text | nullable | `supplierContactRole` | Input | 7.3 | ⏳ |
| 17 | מחסן מקבל | `receiving_warehouse_id` | uuid | FK→erp_md_warehouses | `receivingWarehouseId` | Select + F2 | 7.3 | ⏳ |
| 18 | איתור במחסן | `warehouse_location` | text | nullable | `warehouseLocation` | Input | 7.3 | ⏳ |
| 19 | אופן משלוח | `shipping_method` | text | nullable | `shippingMethod` | Select | 7.3 | ⏳ |
| 20 | סוג הזמנה | `po_type_id` | uuid | FK→erp_md_po_types | `poTypeId` | Select + F2 | 7.3 | ⏳ |
| 21 | סניף | `branch_id` | uuid | FK→erp_md_branches | `branchId` | Select | 7.3 | ⏳ |
| 22 | עבור משתמש | `for_user_id` | uuid | FK→auth.users | `forUserId` | Select | 7.3 | ⏳ |
| 23 | דרישה מרכזית | `requisition_id` | uuid | FK→erp_purchase_requisitions | `requisitionId` | Select + F2 | 7.3 | ⏳ |
| 24 | הצעת מחיר | `quote_id` | uuid | FK→erp_price_quotes | `quoteId` | Select + F2 | 7.3 | ⏳ |
| 25 | הזמנת מסגרת | `framework_order_id` | uuid | FK→erp_framework_orders | `frameworkOrderId` | Select + F2 | 7.3 | ⏳ |
| 26 | הזמנת לקוח | `customer_order_id` | uuid | FK→erp_customer_orders | `customerOrderId` | Select + F2 | 7.3 | ⏳ |
| 27 | הנחה כללית % | `general_discount_pct` | numeric(5,2) | NOT NULL, default 0, CHECK 0..100 | `generalDiscountPct` | Input number | 7.4 | ✅ |
| **Phase 7.3 — Approval skeleton columns** ||||||||
| 28 | לטיפול | `assignee_user_id` | uuid | FK→auth.users, nullable | `assigneeUserId` | Select (fills in 7.7) | 7.3 skel | 🚧 |
| 29 | רמת אישור נוכחית | `current_approval_level` | integer | default 0 | `currentApprovalLevel` | readonly (set by 7.7 RPCs) | 7.3 skel | ✅ logic in 7.7 |
| 30 | דחיית הרשאה לספק | `approval_deferred_to_supplier` | boolean | default false | `approvalDeferredToSupplier` | checkbox (logic in 7.7) | 7.3 skel | 🚧 |
| **Phase 7.4 — Urgency + AI negotiation** ||||||||
| 31 | רמת דחיפות | `urgency_level` | text | NOT NULL, default 'NORMAL', CHECK IN (NORMAL/HIGH/CRITICAL) | `urgencyLevel` | RadioGroup | 7.4 | ✅ |
| 32 | הצדקת דחיפות | `urgency_justification` | text | nullable (≥10 chars if urgency≠NORMAL) | `urgencyJustification` | Textarea | 7.4 | ✅ |
| 33 | סטטוס AI negotiation | `ai_negotiation_status` | text | NOT NULL, default 'NOT_ATTEMPTED', CHECK IN (…) | `aiNegotiationStatus` | badge | 7.4 | ✅ |
| 34 | חיסכון AI (₪) | `ai_negotiated_savings` | numeric(14,2) | nullable | `aiNegotiatedSavings` | readonly | 7.4 | ✅ |
| 35 | לוג משאומ | `ai_negotiation_log` | jsonb | default '[]' | `aiNegotiationLog` | collapsed | 7.4 | ✅ |
| 36 | קישור RFQ | `rfq_id` | uuid | nullable (FK in 7.10.3) | `rfqId` | readonly link | 7.4 | ✅ (FK pending) |
| **Phase 7.5 — PO-level deviation governance** ||||||||
| 37 | סטיית ברמת PO (%) | `po_total_deviation_pct` | numeric(6,2) | nullable (computed by API) | `poTotalDeviationPct` | readonly % | 7.5 | ✅ |
| 38 | דורש escalation PO | `requires_po_escalation` | boolean | NOT NULL, default false | `requiresPoEscalation` | badge | 7.5 | ✅ |
| **Phase 7.6 — PO body (rich-text)** ||||||||
| 39 | טקסט לספק (עברית) | `body_html` | text | nullable | `bodyHtml` | Tiptap editor (UI ⏳) | 7.6 | ✅ schema |
| 40 | טקסט לספק (אנגלית) | `body_html_english` | text | nullable | `bodyHtmlEnglish` | Tiptap editor (UI ⏳) | 7.6 | ✅ schema |

---

## 2. `erp_purchase_order_lines` (Lines)

| # | Hebrew | DB column | PG type | Constraints | API name | UI control | Phase | Status |
|---|---|---|---|---|---|---|---|---|
| 1 | מזהה | `id` | uuid | PK | `id` | hidden | 7.1 | ✅ |
| 2 | חברה | `company_id` | uuid | NOT NULL, FK, RLS | `companyId` | hidden | 7.1 | ✅ |
| 3 | הזמנה | `purchase_order_id` | uuid | NOT NULL, FK→erp_purchase_orders | `purchaseOrderId` | hidden | 7.1 | ✅ |
| 4 | מס' שורה | `line_number` | integer | NOT NULL | `lineNumber` | readonly | 7.1 | ✅ |
| 5 | מק"ט | `item_id` | uuid | NOT NULL, FK→erp_md_items | `itemId` | Select + F2 | 7.2 | ✅ |
| 6 | מק"ט ספק | `item_sku` | text | nullable | `itemSku` | Input (override) | 7.2 | ✅ |
| 7 | תיאור | `description` | text | nullable | `description` | Input | 7.1 | ✅ |
| 8 | כמות | `quantity` | numeric(14,3) | NOT NULL, > 0 | `quantity` | Input number | 7.2 | ✅ |
| 9 | מחיר יחידה | `unit_price` | numeric(14,4) | NOT NULL, ≥ 0 | `unitPrice` | Input number | 7.2 | ✅ |
| 10 | סה"כ שורה | `total_price` | numeric(14,2) | **GENERATED** (qty × unit_price) | `totalPrice` | readonly | 7.2 | ✅ |
| 11 | סעיף תקציבי | `budget_sub_chapter` | text | **NOT NULL** | `budgetSubChapter` | auto from item | 7.2 | ✅ |
| 12 | קוד משאב | `resource_id` | uuid | **NOT NULL**, FK | `resourceId` | auto from item | 7.2 | ✅ |
| **Phase 7.4 additions (Line Enrichment)** ||||||||
| 13 | ת. אספקה | `supply_date` | date | nullable | `supplyDate` | Date picker | 7.4 | ✅ |
| 14 | הנחה % | `discount_pct` | numeric(5,2) | NOT NULL, default 0, CHECK 0..100 | `discountPct` | Input number | 7.4 | ✅ |
| 15 | מטבע שורה | `line_currency` | varchar(3) | NOT NULL, default 'ILS' | `lineCurrency` | Select | 7.4 | ✅ |
| 16 | שער חליפין | `exchange_rate` | numeric(12,6) | NOT NULL, default 1, CHECK >0 | `exchangeRate` | Input number | 7.4 | ✅ |
| 17 | מקור מחיר | `price_source` | text | CHECK IN (SUPPLIER_PRICELIST/LAST_PURCHASE/MANUAL/QUOTE/FRAMEWORK/AI_CROSS_SUPPLIER) | `priceSource` | badge + select | 7.4 | ✅ |
| 18 | שם יצרן | `manufacturer_name` | text | nullable | `manufacturerName` | Input | 7.4 | ✅ |
| 19 | הערות שורה | `line_notes` | text | nullable | `lineNotes` | Textarea (collapsed) | 7.4 | ✅ |
| **Phase 7.5 additions (3% Rule governance — populated by POST via RPC)** ||||||||
| 20 | דורש escalation | `requires_escalation` | boolean | NOT NULL, default false; trigger enforces justification | `requiresEscalation` | badge | 7.5 | ✅ |
| 21 | הצדקת escalation | `escalation_justification` | text | required ≥10 chars if requires_escalation=true | `escalationJustification` | Textarea | 7.5 | ✅ |
| 22 | קטגוריית escalation | `escalation_category` | text | CHECK IN (BUSINESS_RELATIONSHIP/QUALITY/AVAILABILITY/LEAD_TIME/OTHER) | `escalationCategory` | Select | 7.5 | ✅ |
| 23 | סטיית מחיר (%) | `price_deviation_pct` | numeric(6,2) | nullable (computed) | `priceDeviationPct` | readonly % | 7.5 | ✅ |
| 24 | ספק חליפי | `alternative_supplier_id` | uuid | FK→erp_md_suppliers, nullable | `alternativeSupplierId` | readonly link | 7.5 | ✅ |
| 25 | מחיר חליפי | `alternative_unit_price` | numeric(14,4) | nullable | `alternativeUnitPrice` | readonly | 7.5 | ✅ |
| 26 | זמן אספקה חליפי | `alternative_lead_time_days` | integer | nullable | `alternativeLeadTimeDays` | readonly | 7.5 | ✅ |
| **Phase 7.9 additions (Receiving)** ||||||||
| 20 | כמות שהתקבלה | `quantity_received` | numeric(14,3) | default 0 | `quantityReceived` | readonly (from GR) | 7.9 | ⏳ |
| 21 | יתרה לאספקה | `quantity_open` | numeric(14,3) | **GENERATED** (qty - received) | `quantityOpen` | readonly | 7.9 | ⏳ |

---

## 3. `erp_md_po_types` (PO Types — Phase 7.3 skeleton, 7.7 logic)

| # | Hebrew | DB column | PG type | Constraints | Phase | Status |
|---|---|---|---|---|---|---|
| 1 | מזהה | `id` | uuid | PK | 7.3 | 🚧 |
| 2 | חברה | `company_id` | uuid | NOT NULL, RLS | 7.3 | 🚧 |
| 3 | קוד | `code` | varchar(8) | NOT NULL, UNIQUE(company_id, code) | 7.3 | 🚧 |
| 4 | שם (עברית) | `name_he` | text | NOT NULL | 7.3 | 🚧 |
| 5 | שם (אנגלית) | `name_en` | text | nullable | 7.3 | 🚧 |
| 6 | טקסט קבוע (עברית) | `default_text_he` | text | nullable | 7.3 | 🚧 |
| 7 | טקסט קבוע (אנגלית) | `default_text_en` | text | nullable | 7.3 | 🚧 |
| 8 | שרשרת אישורים | `approval_chain_json` | jsonb | nullable (used in 7.7) | 7.3 skel | 🚧 |
| 9 | פעיל | `is_active` | boolean | default true | 7.3 | 🚧 |

---

## 4. `erp_po_approvals` (Approval Records — Phase 7.3 skeleton, 7.7 logic)

| # | Hebrew | DB column | PG type | Constraints | Phase | Status |
|---|---|---|---|---|---|---|
| 1 | מזהה | `id` | uuid | PK | 7.3 | 🚧 |
| 2 | חברה | `company_id` | uuid | NOT NULL, RLS | 7.3 | 🚧 |
| 3 | הזמנה | `purchase_order_id` | uuid | NOT NULL, FK | 7.3 | 🚧 |
| 4 | רמה | `level` | integer | NOT NULL, ≥ 1 | 7.3 | 🚧 |
| 5 | מאשר (user) | `approver_user_id` | uuid | FK→auth.users, nullable | 7.3 | 🚧 |
| 6 | תפקיד נדרש | `required_role` | text | nullable | 7.3 | 🚧 |
| 7 | סטטוס | `status` | text | CHECK IN (PENDING, APPROVED, REJECTED, BYPASSED) | 7.3 | 🚧 |
| 8 | הוכרע בתאריך | `decided_at` | timestamptz | nullable | 7.3 | 🚧 |
| 9 | הערת מאשר | `comment` | text | nullable | 7.3 | 🚧 |
| 10 | חתימה (base64) | `signature_data` | text | nullable (used in 7.7) | 7.3 skel | 🚧 |

---

## 5. Tables Planned & Delivered

| Table | Phase | Status | Purpose |
|---|---|---|---|
| `erp_md_company_settings` | 7.4.0 | ✅ | הגדרות AI + thresholds פר-חברה (3% Rule, feature flags, RFQ limits) |
| `erp_ai_audit_log` | 7.4.0 | ✅ | לוג מלא של קריאות LLM (model, tokens, cost, reasoning, decision-tier) |
| `erp_md_supplier_item_mapping` | 7.4.5 | ✅ | גשר Supplier-SKU ↔ Master-SKU (AI-matched, versioned) |
| `erp_po_approved_exceptions` | 7.5 | ✅ | זיכרון חריגות מאושרות (משתיק escalation חוזר) |
| `erp_po_attachments` | 7.6 | ✅ | קבצים מצורפים פר-PO (metadata; bucket po-attachments) |
| `erp_md_item_assets` | 7.6 | ✅ | נכסי Master SKU גלובליים (datasheets, תמונות, תווי תקן SII) |
| `erp_po_revisions` | 7.8 | ✅ | גרסאות מלאות (snapshot jsonb: header + lines + approvals) |
| `erp_po_change_log` | 7.8 | ✅ | Audit field-level + trigger גנרי על כותרת ה-PO |
| `erp_goods_receipts` | 7.9 | ⏳ PLANNED | קבלת טובין — כותרת |
| `erp_goods_receipt_lines` | 7.9 | ⏳ PLANNED | קבלת טובין — שורות |
| `ai_jobs` (extended) | 7.4.0 | ✅ | תור משימות AI async — נוספו priority/attempts/idempotency_key/scheduled_at |
| `erp_po_comments` | 7.12 | ⏳ PLANNED | Comments thread פר-PO |

## 5.1 RPC Functions

| Function | Phase | Purpose |
|---|---|---|
| `erp_compute_price_suggestions(company_id, master_item_id, supplier_id, quantity, window_days)` | 7.5 | מנוע הצעות מחיר רב-מקורי (SUPPLIER_PRICELIST/LAST_PURCHASE/BEST_OFFER_CROSS) |
| `erp_compute_line_deviation(company_id, master_item_id, supplier_id, unit_price, quantity, project_id)` | 7.5 | 3% Rule: מחזיר deviation + requires_escalation + exception_applied |
| `erp_evaluate_trigger_expr(expr, amount, threshold, requires_po_esc, has_line_esc, urgency)` | 7.7 | DSL evaluator ל-approval_chain_json |
| `erp_resolve_approval_chain(po_id)` | 7.7 | מחזיר שרשרת אישורים עם activated=true/false פר level |
| `erp_submit_po_for_approval(po_id)` | 7.7 | DRAFT → PENDING_APPROVAL + יצירת approvals |
| `erp_decide_approval(approval_id, decision, comment)` | 7.7 | APPROVE/REJECT + propagation (next level / cancellation of peers) |
| `erp_create_po_revision_snapshot(po_id, reason)` | 7.8 | יוצר revision עם snapshot מלא (header + lines + approvals) |

---

## 6. API Endpoints — Contract Reference

| Endpoint | Method | Phase | Purpose |
|---|---|---|---|
| `/api/procurement/orders` | GET | 7.1 | List POs with supplier JOIN |
| `/api/procurement/orders` | POST | 7.2 | Create PO (Header + Lines, server-side calc) |
| `/api/procurement/orders/[id]` | GET | 7.3 | Single PO detail view |
| `/api/procurement/orders/[id]` | PATCH | 7.3 | Update header fields |
| `/api/procurement/orders/[id]` | DELETE | 7.3 | Soft-delete (only DRAFT) |
| `/api/procurement/orders/[id]/lines` | POST | 7.4 | Add line to existing PO |
| `/api/procurement/orders/[id]/lines/[lineId]` | PATCH/DELETE | 7.4 | Line-level CRUD |
| `/api/procurement/pricing/suggestions` | GET | 7.5 | ✅ Multi-source price engine (AI-ready): מחזיר suggestions עם bestAlternative |
| `/api/procurement/orders/[id]/attachments` | POST/GET/DELETE | 7.6 | Attachments |
| `/api/procurement/orders/[id]/submit-for-approval` | POST | 7.7 | Move DRAFT → PENDING_APPROVAL |
| `/api/procurement/orders/[id]/approve` | POST | 7.7 | Approve current level |
| `/api/procurement/orders/[id]/reject` | POST | 7.7 | Reject + reason |
| `/api/procurement/orders/[id]/revisions` | GET | 7.8 | List revisions |
| `/api/procurement/orders/[id]/receive` | POST | 7.9 | Record goods receipt |
| `/api/procurement/orders/[id]/ai/budget-burn` | GET | 7.10 | Budget preview |
| `/api/procurement/orders/[id]/ai/anomalies` | GET | 7.10 | Anomaly detection |

---

## 7. Status enum — single source of truth

```
DRAFT
PENDING_PRICE_APPROVAL   (from price-ceiling trigger)
PENDING_APPROVAL         (Phase 7.7)
APPROVED                 (Phase 7.7)
REJECTED                 (Phase 7.7)
SENT_TO_SUPPLIER         (Phase 7.7)
RECEIVING                (Phase 7.9 — partial)
RECEIVED                 (Phase 7.9 — full)
CLOSED                   (Phase 7.9)
CANCELLED                (any stage, by author or approver)
```
