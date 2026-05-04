# Purchase Order Card — Implementation Spec

> **Translation of Priority SOP LB120173 v04 to our system.**
> Source: `docs/ingested-specs/priority-purchase-order-sop.md` (read-only).
> Status: living document. Updated per phase.
>
> **2026-05-03 update** — Phase A scope re-baselined after re-auditing existing
> migrations (`20260801120000`–`20260805120000`). Most of what was originally
> drafted in this doc as "missing" already shipped during phases 7.3–8.2.
> See §1.5 for the **actual current state** and §3 for the **reduced Phase A**.

## 🎯 North Star — "פיאט 127 → טסלה"

המשתמש מהסרטון של Priority ירגיש:
1. **בבית** — כל הטרמינולוגיה זהה (6 לשוניות, 10 סטטוסים, 13 actions,
   שמות שדות עבריים). F6/F8 shortcuts נשמרים ב-keybinds. Print template
   מוכר. Flow זהה.
2. **בטסלה** — כל פעולה שהייתה ידנית ב-Priority הופכת ל-AI/real-time:
   - Auto-fill חכם (לא רק ברירות מחדל אלא **predictive**)
   - Natural language PO creation ("הזמן 100 עפרונות מיואב")
   - Real-time מחיר monitoring + alerts
   - Predictive delay forecasting (פיגור לפני שקרה)
   - Voice + chat interfaces
   - Mobile-first + offline

כל Phase להלן מכיל 2 קטעים:
- 🏠 **Parity** — מה שחייב להיות זהה ל-Priority
- ⚡ **Tesla** — מה שאנחנו מוסיפים מעבר

---

## 1. מצב נוכחי אצלנו (Baseline — accurate as of 2026-05-03)

### 1.1 ENUM `erp_purchase_order_status` (10 ערכים — *actual*)
לאחר phases 7.7, 8.1.4, 8.2:
`DRAFT · PENDING_APPROVAL · PENDING_PRICE_APPROVAL · APPROVED · SENT_TO_SUPPLIER · PARTIALLY_RECEIVED · FULLY_RECEIVED · SENT · CLOSED · CANCELLED`.

**Mapping ל-Priority's 10 statuses**:

| Priority | אצלנו | סטטוס |
|---|---|---|
| DRAFT (טיוטא) | `DRAFT` | ✅ |
| PROFORMA (פרופרמה) | — | ❌ **חסר** (Phase A) |
| PENDING_APPROVAL (מחכה לאישור) | `PENDING_APPROVAL` | ✅ |
| APPROVED (אושרה) | `APPROVED` | ✅ |
| SENT (נשלחה) | `SENT_TO_SUPPLIER` | ✅ (rename, ours is more precise) |
| ON_SHIP (באוניה) | — | ❌ **חסר** (Phase A) |
| SHIPMENT_CONFIRMED (אישור משלוח) | — | ❌ **חסר** (Phase A) |
| PARTIAL_ARRIVAL (הגעה חלקית) | `PARTIALLY_RECEIVED` | ✅ |
| CLOSED (סגורה) | `CLOSED` + `FULLY_RECEIVED` | ✅ |
| CANCELLED (מבוטלת) | `CANCELLED` | ✅ |

Extras אצלנו: `PENDING_PRICE_APPROVAL` (legacy, נשמר), `SENT` (legacy alias של `SENT_TO_SUPPLIER`).

### 1.2 `erp_purchase_orders` — עמודות שכבר קיימות (post-phase 8.2)
**Identity & links**: `id`, `company_id`, `project_id` (nullable), `supplier_id`, `po_number`, `title`, `status`, `notes`, `issued_at`, `created_at`, `updated_at`.

**Financial breakdown** (Phase 7.2.A): `currency`, `total_amount_net`, `vat_amount`, `total_amount_gross`, `total_amount` (legacy mirror), `general_discount_pct`.

**Approval workflow** (Phases 7.3, 7.7): `po_type_id` → `erp_md_po_types`, `assignee_user_id`, `current_approval_level`, `approval_deferred_to_supplier`.

**AI governance** (Phase 7.4): `urgency_level`, `urgency_justification`, `ai_negotiation_status`, `ai_negotiated_savings`, `ai_negotiation_log`, `rfq_id`, `po_total_deviation_pct`, `requires_po_escalation`.

**Body & comms** (Phase 7.6): `body_html`, `body_html_english`.

**Pricing legacy**: `price_override_status` (NONE/REQUESTED/APPROVED).

### 1.3 `erp_purchase_order_lines` — עמודות שכבר קיימות
**Core**: `id`, `company_id`, `purchase_order_id`, `project_id` (nullable), `budget_sub_chapter` (nullable), `resource_id` (nullable), `description`, `quantity`, `unit_price`, `total_price` (generated).

**Item linkage** (Phase 7.2.A): `item_sku`, `item_id` → `erp_md_items(id)`, `effective_unit_price`.

**Priority parity** (Phase 7.4): `supply_date` (= requested_delivery_date), `discount_pct`, `line_currency`, `exchange_rate`, `price_source` ∈ {SUPPLIER_PRICELIST, LAST_PURCHASE, MANUAL, QUOTE, FRAMEWORK, AI_CROSS_SUPPLIER}, `manufacturer_name`, `line_notes`.

**Governance** (Phase 7.5): `requires_escalation`, `escalation_justification`, `escalation_category`, `price_deviation_pct`, `alternative_supplier_id`, `alternative_unit_price`, `alternative_lead_time_days`.

**Subcontractor**: `blanket_purchase_order_line_id`, `subcontractor_id`, `is_offset`, `linked_subcontractor_bill_id`.

**Goods receipt** (Phase 8.2): `received_qty` (rollup from `erp_goods_receipt_lines`).

### 1.4 טבלאות תומכות שכבר קיימות
- `erp_md_po_types` — Priority "סוגי הזמנת רכש" + `approval_chain_json` DSL.
- `erp_po_approvals` — שורות אישור פר-level פר-PO.
- `erp_po_attachments` — DMS metadata (bucket: `po-attachments`, RLS per-tenant). **= מודול ה-DMS המבוקש.**
- `erp_md_item_assets` — DMS גלובלי לתמונות/datasheets/תקנים (bucket: `master-sku-assets`).
- `erp_po_revisions` — snapshots מלאים (header+lines+approvals).
- `erp_po_change_log` — diff field-level (entity_type ∈ HEADER/LINE/APPROVAL/ATTACHMENT).
- `erp_goods_receipts` + `erp_goods_receipt_lines` — קליטה (Phase 8.2).
- `erp_vendor_invoices` + 3-way match (Phase 8.3).
- `erp_md_supplier_item_mapping` — Smart pricing engine.
- `erp_po_approved_exceptions` — חריגות מאושרות.
- `erp_payment_terms` — קודי תנאי תשלום (seed חלקי: 01/02/11).

### 1.5 RPCs שכבר קיימות
- `erp_evaluate_trigger_expr` (DSL: always | amount_above | requires_po_escalation | any_line_requires_escalation | urgency_high).
- `erp_resolve_approval_chain(po_id)` — מחזיר chain מ-`po_type.approval_chain_json`.
- `erp_submit_po_for_approval(po_id)` — DRAFT → PENDING_APPROVAL.
- `erp_decide_approval(approval_id, APPROVE/REJECT, comment)`.
- `erp_compute_price_suggestions`, `erp_compute_line_deviation`.
- `erp_create_po_revision_snapshot(po_id, reason)`.
- `erp_complete_goods_receipt(gr_id)` — atomic GR closure + PO status rollup.

### 1.6 UI קיים
- `/procurement/orders` — dashboard.
- `/procurement/orders/new` — טופס יצירה (RHF + zod).
- `/procurement/orders/[id]` — detail עם tabs.
- Components: `orders-dashboard`, `orders-list-scaffold`,
  `purchase-order-engine-form`, `po-actions-toolbar`,
  `po-approvals-tab`, `po-attachments-tab`, `po-creation-sidebar`,
  `po-history-tab`, `po-official-pdf`, `po-smart-pricing-tab`,
  `line-enrichment-dialog`, `ai-import-copilot-modal`.

### 1.7 API קיים (17+ endpoints)
- `GET/POST /api/procurement/orders`
- `GET/PUT/DELETE /api/procurement/orders/[id]`
- Approvals: `/approvals` · `/submit` · `/[id]/decide`
- Attachments, History, Invoices, Send, Sent-log, Receipt
- `/pricing/suggestions` (AI pricing)

### 1.8 מה כבר בטסלה
- ✅ AI pricing suggestions (`pricing/suggestions` route)
- ✅ AI import copilot (`ai-import-copilot-modal`)
- ✅ Line enrichment dialog
- ✅ Smart pricing tab
- ✅ Official PDF print
- ✅ DMS (per-tenant `po-attachments` bucket + `erp_po_attachments` metadata)

---

## 2. תרגום רעיוני: Priority ↔ שלנו

| Priority | אצלנו | פער |
|---|---|---|
| 6 tabs (מחירים/אסמכתאות/פרויקט/אישורים/כספים/שונות) | UI קיים אבל טאבים שונים | ⚠️ **refactor to 6-tab** |
| Header: מס'ספק/תאריך/מס'הזמנה/שם ספק/איש קשר | קיים (title + supplier_id + po_number) | ⚠️ חסר "איש קשר" per-PO |
| לשונית מחירים | `po-smart-pricing-tab` | חופפת אבל צריכה re-skin לפי Priority |
| לשונית אסמכתאות | חלקית (blanket, invoices) | ❌ חסר: מחסן מקבל · סוג הזמנה · דרישה · הזמנת לקוח · import |
| לשונית פרויקט | `project_id` ב-schema | ⚠️ אין tab ייעודי |
| לשונית אישורים ומעקב ביצוע | `po-approvals-tab` | חלקית — חסר: רשימת מאשרים · חתום הבא · flags |
| לשונית תנאים כספיים | חסר | ❌ **חסר טאב מלא** |
| לשונית שונות | חסר | ❌ |
| 13 sub-tabs של שורות | `po-lines-tab` (flat) | ❌ **refactor to nested tabs** |
| 12 bottom sub-screens (זמינות/מלאי/תנועות…) | חלקי — דרך linkages | ❌ רובם חסרים |
| 10 סטטוסים | 6 סטטוסים | ❌ חסרים: PROFORMA, PENDING_APPROVAL, ON_SHIP, SHIPMENT_CONFIRMED, PARTIAL_ARRIVAL, REOPEN |
| Status properties (15 flags) | enum flat | ❌ **חסרה טבלת metadata** |
| רשימות מאשרים (threshold matrix) | RPC hard-coded | ❌ **חסר** data-driven |
| BPM graph editor | — | Phase-Late |
| סוגי הזמנת רכש (master table) | — | ❌ Phase A |
| תנאי תשלום codes (7 seed) | חסר ב-PO (קיים בספק) | ❌ |
| Price waterfall (4-level + PPriceDays) | AI suggestions שונה | ⚠️ merge — waterfall לוגי + AI |
| Projected inventory per line | — | ❌ חדש |
| Line split action | — | ❌ |
| Post-approval changes screen | — | ❌ |
| Change log לשורה + Status log לשורה | `po-history-tab` partial | ⚠️ להרחיב |
| Print template | `po-official-pdf` ✅ | ⚠️ התאמה לפי Priority |
| Report: פיגורים באספקות | — | ❌ |
| Report: הזמנות פתוחות-ספקים | חלקית | ⚠️ |
| Custom report builder / BI | — | Phase-Late |
| 13 direct actions | 3–5 קיימים | חלקי |
| `מוצרים לספק` picker | קיים inline | ⚠️ UX — אין F6 / Ctrl+F6 |
| Dual-language shipping address | — | ❌ |
| Rich-text body per PO | `notes` field | ⚠️ להרחיב ל-`body_html` |

---

## 3. Phased Plan (A → F)

### Phase A — Foundation parity (Schema + API) 🏠

**Updated 2026-05-03**: Phase A scope reduced after audit. Only the *true*
remaining gaps below. Three additive migrations:

#### 3.A — Migration A: Status workflow parity (`20260807100000_po_status_priority_parity.sql`)

```sql
-- A.1 — Extend PO status enum (3 חדשים)
alter type erp_purchase_order_status add value if not exists 'PROFORMA';
alter type erp_purchase_order_status add value if not exists 'ON_SHIP';
alter type erp_purchase_order_status add value if not exists 'SHIPMENT_CONFIRMED';

-- A.2 — Status metadata (Priority's "מאפיינים" של סוג סטטוס)
create table if not exists public.erp_po_status_types (
  status       public.erp_purchase_order_status primary key,
  name_he      text not null,
  name_en      text not null,
  color        text,
  note         text,
  -- Priority-aligned flags:
  allow_changes                  boolean not null default false, -- ניתנת לשינוי
  allows_gr                      boolean not null default false, -- מאפשרת קליטה
  is_approved                    boolean not null default false, -- מצב מאושר
  is_closed                      boolean not null default false, -- סגורה
  is_status_on_close             boolean not null default false, -- סטטוס בסגירה
  is_status_on_reopen            boolean not null default false, -- סטטוס בפתיחה מחדש
  sends_email                    boolean not null default false, -- שליחת מייל בהגעה לסטטוס
  is_post_approval               boolean not null default false, -- אחרי אישור
  is_status_on_approval_cancel   boolean not null default false, -- סטטוס בביטול אישור
  is_cancelled                   boolean not null default false, -- מבוטלת
  exclude_from_reports           boolean not null default false, -- אל תכלול בדוחות
  matrix_skip                    boolean not null default false, -- מדלג על מטריצת אישורים
  external_update                boolean not null default false, -- נשלט חיצונית
  included_in_tasks              boolean not null default true   -- מופיע במשימות
);

-- A.3 — Seed all 10 statuses (+ legacy aliases)
-- (PENDING_PRICE_APPROVAL ו-SENT הם legacy — ממופים אבל מסומנים כ-exclude_from_reports
-- כדי שלא יבלבלו דוחות חדשים).
```

#### 3.B — Migration B: Header + Line columns parity (`20260807110000_po_header_lines_priority_parity.sql`)

```sql
-- B.1 — PO header: missing Priority parity columns
alter table public.erp_purchase_orders
  add column if not exists contact_id               uuid
    references public.erp_md_supplier_contacts(id) on delete set null,   -- איש קשר per-PO
  add column if not exists receiving_warehouse_code text,                -- מחסן מקבל
  add column if not exists order_date               date,                -- תאריך הזמנה (≠ issued_at)
  add column if not exists payment_terms_code       varchar(16)
    references public.erp_payment_terms(code) on delete set null,        -- FK למאסטר
  add column if not exists vat_code                 text,                -- override של מע"מ
  add column if not exists withholding_pct          numeric(6,3),        -- ניכוי במקור per-PO
  add column if not exists shipping_addr_he         jsonb,               -- {name,contact,phone,fax,line1,line2,line3,city,state,zip,country}
  add column if not exists shipping_addr_en         jsonb,
  add column if not exists is_confidential          boolean not null default false,
  add column if not exists affects_planning         boolean not null default true,
  add column if not exists closed_at                timestamptz,
  add column if not exists closed_by                uuid references auth.users(id) on delete set null;

-- B.2 — PO lines: missing Priority parity columns
alter table public.erp_purchase_order_lines
  add column if not exists line_number              integer,             -- סדר תצוגה
  add column if not exists uom                      text,                -- יחידת מידה (snapshot)
  add column if not exists supplier_sku             text,                -- מק"ט ספק
  add column if not exists supplier_sku_description text,                -- תיאור הספק
  add column if not exists budget_item_code         text,                -- מק"ט תקציב
  add column if not exists budget_utilization_date  date,                -- תאריך ניצול
  add column if not exists import_cost_type         text                 -- L/S/A
    check (import_cost_type is null or import_cost_type in ('L','S','A')),
  add column if not exists demand_number            text,                -- מס' דרישה
  add column if not exists sales_order_id           uuid,                -- FK יתווסף ב-Phase B' (after we model SO lines properly)
  add column if not exists sales_order_line_id      uuid,
  add column if not exists line_status              text                 -- סטטוס שורה
    check (line_status is null or line_status in ('OPEN','PARTIAL','CLOSED','CANCELLED'))
    default 'OPEN',
  add column if not exists is_closed_line           boolean not null default false,
  add column if not exists split_parent_line_id     uuid
    references public.erp_purchase_order_lines(id) on delete set null;   -- לפיצול שורות
```

**הערות חשובות**:
- `requested_delivery_date` כבר קיים בשם `supply_date` (Phase 7.4). לא משכפל.
- `actual_receipt_date` *לא* נדרש כעמודה — נחושב מ-`erp_goods_receipt_lines` ב-view.
- `received_qty`, `discount_pct`, `currency` (= line_currency), `manufacturer_name`, `price_source`
  כבר קיימים. לא משכפל.
- `next_approver_user_id` ו-`approver_list_code` — *לא* נוסיף; ה-flow נסמך על
  `po_type_id.approval_chain_json` (Phase 7.7) שעובד יותר טוב.

#### 3.C — Migration C: Payment terms enrichment (`20260807120000_po_payment_terms_priority_seed.sql`)

```sql
-- C.1 — Seed Priority-style codes WITHOUT overriding existing ones (ON CONFLICT DO NOTHING).
--       קודים קיימים: 01='שוטף', 02='ש15', 11='30 יום'. נשמרים.
insert into public.erp_payment_terms (code, description, is_eom, months_to_add, days_to_add, installments)
values
  ('03', '15 יום',  false, 0, 15,  1),
  ('04', '45 יום',  false, 0, 45,  1),
  ('05', '30 יום',  false, 0, 30,  1),
  ('06', '60 יום',  false, 0, 60,  1),
  ('07', '120 יום', false, 0, 120, 1),
  ('P02','90 יום',  false, 0, 90,  1),  -- Priority's 02; שונה כי 02 קיים
  ('EOM','שוטף +0', true,  0, 0,   1),
  ('EOM30','שוטף + 30', true, 0, 30, 1),
  ('EOM60','שוטף + 60', true, 0, 60, 1)
on conflict (code) do nothing;
```

**API delta** (Phase A):
- `GET /api/procurement/status-types` — read-only מ-`erp_po_status_types`.
- `GET /api/master-data/payment-terms` — קיים? אם לא — להוסיף read-only.
- POST/PUT של PO: לקבל `payment_terms_code`, `contact_id`, `shipping_addr_*`,
  `receiving_warehouse_code`, `is_confidential`, `affects_planning`.
- POST של PO line: לקבל `line_number`, `supplier_sku`, `uom`, `line_status`, `demand_number`.
- Line split: `POST /api/procurement/orders/[id]/lines/[lineId]/split` — מעתיק שורה
  עם `split_parent_line_id` מקושר.

🏠 **Parity delivered (after A)**: כל 10 ה-status של Priority קיימים עם metadata,
header של PO זהה מבחינת fields ל-Priority (מינוס "החתום הבא" שמיותר אצלנו), שורה
תומכת בכל ה-flows של Priority (פיצול, מק"ט ספק, סטטוס שורה, קישור ל-SO).

⚡ **Tesla in A** (auto-fill ב-API ה-POST):
- `currency` ← supplier default
- `payment_terms_code` ← supplier default
- `vat_code` ← supplier default
- `contact_id` ← primary order-contact של הספק
- `shipping_addr_he` ← מ-warehouse אם נבחר, אחרת מ-company HQ
- `line_number` ← auto-increment פר-PO
- `line_status` ← `OPEN` תמיד; gate לסגירה: `received_qty >= quantity`

### Phase B — UI Parity (6 tabs, 13 line sub-tabs, 12 bottom)

🏠 **Parity** — refactor מלא של `/procurement/orders/[id]`:

**6 Main tabs**:
1. **מחירים** — `PoPricingTab`
   - Aggregate view: gross/discount/net/VAT/total.
   - Live calculation as lines change.
2. **אסמכתאות** — `PoReferencesTab`
   - FK pickers: blanket PO, sales order, demand.
   - Dropdown: `po_type_code` → `סוגי הזמנת רכש`.
   - Warehouse picker → auto shipping address.
   - Import toggle (יבוא/יצוא) + docs.
   - Sub-screen: **כתובת למשלוח** (bilingual).
   - Sub-screen: **הזמנות רכש-טקסט** (rich-text HTML editor).
   - Sub-screen: **נספחים** (attachments).
3. **פרויקט** — `PoProjectTab` (reuse existing project linkage).
4. **אישורים ומעקב ביצוע** — `PoApprovalsTrackingTab`
   - Approver list picker + materialized chain.
   - Flags: הדפסה, ניתנת לשינוי, סגורה, סגורה חלוקת, משפיעה על התכנון,
     דרוש הרשאה לספק, לקוח בלבד, הודית.
   - Sub-screen: **אישור הזמנת הרכש** grid (approve checkboxes).
5. **תנאים כספיים** — `PoFinancialTermsTab` (new)
   - VAT code, hedging currency, rates, withholding, payment terms.
6. **שונות** — `PoMiscTab` (placeholder for extensions).

**Lines grid** — `PoLinesGrid` with:
- Columns matching Priority (15 visible + scroll).
- **F6 picker** — opens Supplier Items drawer (`מוצרים לספק`).
- **Ctrl+F6** — opens full items catalog.
- Inline edit with real-time line total + projected inventory preview.
- 13 line sub-tabs as collapsible panels per line.

**12 bottom sub-screens** — `PoBottomDrawer`:
- Sticky bottom panel with tabs: סה"כ · פרויקט · קוד סל · טקסט חופשי
  · **זמינות מוצר מרכזי** · **זמינות פריט מרכז** · **מלאי למוצר** ·
  **מעקב תנועות** · **הצעות מחיר למוצר** · חשבוניות · קישור תקלה
  · הזמנות לקוח.

⚡ **Tesla in B**:
- **Command palette** (Cmd+K) — חיפוש כל שדה/פעולה/שורה.
- **Inline AI suggestions** — כל שדה מציע השלמה חכמה.
- **Projected inventory on hover** — בלי לחיצה.
- **Voice commands** — "הוסף עוד 50 יחידות" → auto-creates line.
- **Chat assistant** — sidebar שמסביר כל החלטה ("למה המחיר הזה?").
- **Real-time price monitoring** — אם המחיר בשוק השתנה, alert live.

### Phase C — Approvals engine (data-driven) 🏠⚡

🏠 **Parity**:
- `materializeApprovers(po_id)` — יוצר chain ב-`erp_po_approvers`.
- `submitForApproval(po_id)` — סטטוס → `PENDING_APPROVAL`, email ראשון.
- `approveStep(po_id, user_id)` — מאשר שלב, או backup.
- `lastApproverSkip` — אם אחרון מאשר → סטטוס → `APPROVED` + דילוג.
- `checkBpmRule(po_id, target_status, user_id)` — מחזיר allow/deny.
- Status guards — `erp_po_status_types` dictates allowable ops.

⚡ **Tesla**:
- **Predictive approval routing** — AI ממליץ אילו מאשרים להוסיף לפי
  sum/category/supplier history.
- **Auto-approve low-risk** — מתחת לסף X + spec standard + supplier
  trusted = אישור מיידי (with audit).
- **Approval chat** — מאשר יכול לשאול "למה הסכום עלה 20%?" וה-AI
  יסביר.
- **Parallel approvals** — מאשרים עצמאיים במקום sequence (opt-in).

### Phase D — Post-approval changes + Audit 🏠

🏠 **Parity**:
- מסך נפרד `/procurement/orders/changes` — permission `po:change:approved`.
- שולף PO מאושר → form נפרד שמעדכן `erp_purchase_order_lines` +
  דוחף ל-`erp_po_line_change_log`.
- Status change → דוחף ל-`erp_po_status_log`.
- UI: `לוג שינויים לשורה` + `לוג סטטוסים` sub-panels.

⚡ **Tesla**:
- **Diff view** (git-style) בכל שינוי.
- **"Undo" button** per change.
- **AI summary** של מהלך השינויים ("4 שורות עודכנו, 2 תאריכים נדחו").

### Phase E — Reports & BI 🏠⚡

🏠 **Parity**:
- `/procurement/orders/reports/open-by-supplier` — `הזמנות פתוחות-ספקים`.
- `/procurement/orders/reports/delays` — `פיגורים באספקות` (עם `ימי פיגור`).
- Report dialog pattern: saved queries + rerun.
- Export: PDF / Excel.

⚡ **Tesla**:
- **Predictive delay forecasting** — תחזית פיגור לפני שקרה (לפי ספק,
  קטגוריה, עונה).
- **Anomaly detection** — alert כשמחיר/כמות חריגים.
- **Natural-language query** — "הראה לי את כל ה-POs שמעל 50K שלא סופקו
  עדיין".
- **Auto-summaries** — executive summary יומי/שבועי.

### Phase F — BPM engine & visual editor 🏠

🏠 **Parity**:
- Graph editor UI (nodes + edges + rules).
- `erp_po_status_transitions` table + `erp_po_transition_rules`.
- Right-click menu: חוקים / מאפיינים / קבע צבע / שנה שם.
- Rules DSL (simple: `field op value`; advanced: JS sandbox).

⚡ **Tesla**:
- **AI rule suggestion** — "נראה שאתה תמיד מאשר אם supplier=X, רוצה
  חוק?"
- **Rule impact simulation** — לפני שהחלת חוק, הראה איך הוא ישפיע על
  POs היסטוריים.

### Phase G — Direct actions parity ⚡

13 הפעולות מ-Priority:

| Priority action | אצלנו | Phase |
|---|---|---|
| הדפסת PO (HE) | ✅ `po-official-pdf` | A (polish) |
| Print PO (EN) | ⚠️ partial | B |
| קבלות סחורה | ✅ GR module | — |
| תיקו ביצוע | ❌ | C (drill) |
| שמירת מהדורות | ⚠️ revisions | A |
| העתקת מהדורות | ❌ | D |
| הקמת מחיר מוסכם | ❌ | C (supplier quote create) |
| PO חוזרת | ❌ | E (recurring) |
| בניית מטריצה לפי שורה | ❌ | D |
| איפוס שינויים | ❌ | D (revert to approved) |
| דרישת תחליך | ❌ | E (demand tracking) |
| אשף הזמנות | ⚠️ | A |

⚡ **Tesla additions**:
- **"Copy this PO to…"** — quick clone to another supplier/project.
- **"Schedule this PO"** — future-dated creation.
- **"Negotiate"** — AI-assisted price negotiation via email/WhatsApp.

---

## 4. Phase priorities (execution order)

### 🥇 Phase A (פונדציה) — עכשיו
**ערך עסקי**: המשתמש מ-Priority פותח PO ורואה כל ה-fields שהוא מכיר,
הסטטוסים זהים, terminology זהה. כלום לא חסר בשכבת הנתונים.

**Scope**:
1. מיגרציה 3.A.1–3.A.10.
2. APIs: status-types (GET) · po-types (CRUD) · approver-lists (CRUD) · payment-terms (GET).
3. Backfill: קיום POs → ברירות מחדל שקופות (status נשאר, `po_type_code=null`).
4. Form validation: Status transitions לפי `erp_po_status_types`.

**לא ב-A**: UI refactor, גרף BPM, reports.

### 🥈 Phase B (UI parity) — אחרי A
- 6 tabs + 13 line sub-tabs + 12 bottom sub-screens.
- F6/Ctrl+F6 pickers.
- Print template polish.

### 🥉 Phase C (Approvals data-driven)
- `materializeApprovers` flow.
- Replace hard-coded RPCs.
- Sub-screen `אישור הזמנת הרכש` grid.

### Phase D (Post-approval + Audit)
- מסך שינויים נפרד.
- Audit tables populated + UI.

### Phase E (Reports)
- Open-by-supplier.
- Delays.
- Custom builder (basic).

### Phase F (BPM editor)
- Rules engine + visual editor.

### Phase G (Direct actions)
- משובץ לאורך כל הפאזות.

---

## 5. Tesla-exclusive features (not in Priority)

Features שלא קיימות ב-Priority בכלל — אלה ה-"Tesla" שלנו:

1. **Natural-language PO creation**
   *"צור PO ל-100 עפרונות מיואב, אספקה בעוד שבוע, תיקנן ל-פרויקט X"*
   → LLM tool-calling → PO נוצר.

2. **Voice-to-PO** (mobile)
   הקלטה בשטח → transcription → PO draft.

3. **Real-time price radar**
   Scraping + supplier feeds → התראה כשמחיר ב-PO > ממוצע שוק.

4. **Smart recurring POs**
   AI זיהה דפוס — "אתה מזמין ניירות כל חודש 1, להפוך ל-recurring?"

5. **Mobile-first with offline**
   Create PO בשטח בלי רשת → sync כשרשת חוזרת.

6. **Cross-company intelligence**
   אם חברה אחרת ברשת שלנו הזמינה אותו פריט מאותו ספק ב-10% יותר זול,
   alert.

7. **AI contract extraction**
   Upload הסכם מסגרת (PDF) → AI מוציא terms → יוצר Blanket PO אוטומטית.

8. **WhatsApp integration**
   ספק שולח אישור ב-WhatsApp → אוטומטית מעדכן `SHIPMENT_CONFIRMED`.

9. **Carbon tracking**
   כל PO מראה CO₂ footprint מתוכנן (לפי supplier + transport mode).

10. **Predictive cash flow**
    PO מחובר ל-`תנאי תשלום` → forecast ל-treasury 90 יום קדימה.

---

## 6. Open questions / decisions

1. **האם להמיר את ה-enum הקיים או להוסיף ערכים?** — **הוסיף** (adds לא breaks).
2. **Approvers matrix per-company או global?** — per-company (tenant-aware).
3. **Rich-text ב-body_html או markdown?** — HTML (מה-Priority, תואם rendering בדפוס).
4. **מיקום של מסך "שינויים בהזמנות מאושרות"** — `/procurement/orders/changes/[poId]` (nested).
5. **האם לנצל את ה-`erp_change_orders` הקיים?** — **כן** (חופף ל-`erp_po_line_change_log`) — מיזוג ב-Phase D.
6. **Backward compat לסטטוסים הישנים** — `PENDING_PRICE_APPROVAL` עדיין valid (לא מסירים).

---

## 7. Validation checklist per Phase

### A
- [ ] Migration applied local + cloud.
- [ ] All new tables RLS = company-scoped.
- [ ] Seed data loaded (payment terms + status types).
- [ ] TypeScript types regenerated.
- [ ] Existing tests pass.
- [ ] New tests for materialize-approvers RPC.

### B
- [ ] 6 tabs visible + keyboard-navigable.
- [ ] F6/Ctrl+F6 picker works.
- [ ] All Priority terminology visible in Hebrew.
- [ ] Projected inventory accurate.
- [ ] Print template matches spec section 6.

### C–G
- [ ] Per-phase checklists TBD.
