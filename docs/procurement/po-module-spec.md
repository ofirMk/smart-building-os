# Procurement Orders Module — Master Specification

> **Status**: Living document. Updated after each phase completes.
> **Owner**: Procurement module team.
> **Scope**: Full PO lifecycle (create → approve → send → receive → match → close).
> **Reference point**: Priority ERP's `הזמנת רכש` screen (reverse-engineered from production screenshots).

---

## 0. מטרה וגבולות

מסמך זה משמש **מקור-אמת יחיד** לתכנון, מימוש ותיעוד של מודול הזמנות הרכש בפלטפורמה. כל Phase חדש:
1. משדרג את הסכמה (בלבד additive migrations — לא breaking).
2. מעדכן את טבלת השדות ב-`po-field-reference.md`.
3. מוסיף רשומת סטטוס ב-§7 למטה.

**למה Priority כ-benchmark?** הוא ה-ERP הישראלי הדומיננטי בענף הבנייה; לקוחות מגיעים איתו ידע קיים. Feature-parity (Phases 7.3–7.7) נותנת לנו קבלה עסקית. Beyond-parity (7.8–7.12) נותן את הערך המוסף.

---

## 1. הנדסה לאחור — יכולות Priority שזוהו

### 1.1 ארכיטקטורת מסך (3 רמות Master-Detail + Sub-detail)

```
┌─ HEADER ──────────────────────────────────────────┐
│ Tabs: מחירים │ אסמכתאות │ פרוייקט │ אישורים       │
│       ומעקב ביצוע │ תנאים כספיים │ שונות         │
├─ LINES GRID ──────────────────────────────────────┤
│ Tabs: פירוט הזמנת רכש │ פירוט דגמים │ הזמנת       │
│       לקוח להזמנה │ כתובת למשלוח │ אישור │        │
│       מהדורות │ פרטי הצמדה │ נספחים │ קישור       │
│       לפרויקט/חשבון │ טקסט │ פרטי הספק │ הערות    │
│       פנימיות                                     │
├─ LINE DETAIL (per-line) ──────────────────────────┤
│ Sub-tabs: סה"כ הזמנה │ קישור לפרויקט/חשבון │       │
│           מאפיינים לעוד סל │ טקסט חופשי │ זמינות   │
│           מוצר │ זמינות פריט מרכז │ מלאי למוצר │  │
│           מעקב תנועות │ הצעות מחיר למוצר │         │
│           חשבוניות │ קישור תקלה                   │
├─ SUB-DETAIL (histórico/tracking) ─────────────────┤
│ מחירים אפשריים │ קניות אחרונות │ ניצול תקציב │     │
│ חתימה אלקטרונית │ לוג סטטוסים │ לוג שינויים       │
└────────────────────────────────────────────────────┘
```

### 1.2 עמודי תווך לוגיים ב-Priority

1. **F2 Drill-down** — כל שדה FK ניתן לפתיחה רקורסיבית לעומק כמה רמות.
2. **Tabs מרובי-רמות** — גישה לכל מידע רלוונטי בלי ניווט למסך אחר.
3. **Cross-linkage אוניברסלי** — PO יכול להיוולד מ-Requisition, לקשר Customer Order, לקלוט חשבוניות, להיקשר ל-Service Call. כל קשר דו-כיווני.

### 1.3 לוגיקת מנוע מחיר (מתוך Priority Help pop-up)

> "אם לא הוזן מחיר יחידה, המערכת תחפש את המחיר האחרון של המוצר אצל הספק ותציב אותו כאן בתוספת הנחה. היא תחפש מחירים שמאוחרים מ-X ימים לפי הקבוע `PPriceDays`."

**מנגנון**:
- הזנת `total_price` בלבד → חלוקה בכמות → `unit_price`.
- כמות בלבד → חיפוש historical (N ימים לאחור) מאותו ספק.
- תמיד זמין panel "מחירים אפשריים למוצר" עם כל ההצעות.

### 1.4 סוגי PO (`סוגי הזמנת רכש`)

טבלת תצורה: קוד + שם עברית/אנגלית + **טקסט קבוע דו-לשוני** המוצמד אוטומטית ל-PO body. דוגמאות מהצילום: ציוד משרדי (A), חומרי ניקוי (B), מחשבים וחומרה (C), מזון ושתיה (D).

---

## 2. ניתוח פער (Gap Analysis)

| יכולת | Priority | `smart-building-os` (Phase 7.2) |
|---|---|---|
| Grid + CRUD בסיסי | ✅ | ✅ |
| Auto-pricing | ✅ מחירון + היסטוריה | ⚠️ מחירון בלבד |
| VAT dynamic (קוד מע"מ) | ✅ | ❌ hardcoded 17% |
| Multi-currency + exchange rate | ✅ per-line | ❌ header-only |
| Supply date per-line | ✅ | ❌ |
| Discount % per-line | ✅ | ❌ |
| Shipping address | ✅ | ❌ |
| Payment terms | ✅ net-X + EOM | ❌ |
| Approval workflow | ✅ multi-level | ❌ |
| Attachments | ✅ | ❌ |
| Rich-text PO body | ✅ WYSIWYG | ❌ |
| Revisions/versions | ✅ | ❌ |
| Change log | ✅ | ❌ |
| Goods receipt | ✅ | ❌ |
| 3-way invoice match | ✅ | ❌ |
| Cross-linkage (Requisition/CO/Invoice) | ✅ | ❌ |

**הערכה**: אנחנו ב-~15% מ-Priority פונקציונלית.

---

## 3. שיפורים קדימה (Beyond Priority)

Priority חזק בפונקציונליות ישנה; חלש ב-UX מודרני, AI, ואינטגרציות. אלה ההזדמנויות:

### 3.1 AI-driven
- **Best-price recommendation** — סריקה חוצה-ספקים
- **Budget burn live preview** — ניצול תקציב בזמן הקלדה
- **Anomaly detection** — אזהרה ויזואלית על חריגות מחיר
- **Demand forecasting** — כמות מומלצת לפי דפוסי צריכה
- **Delivery ETA ML** — חיזוי זמן אספקה מהיסטוריית הספק

### 3.2 UX מודרני
- Progressive disclosure (טאבים מתקדמים לפי דרישה)
- Command palette (Cmd+K)
- Draft autosave
- Inline validation + hints
- Split-view (ספק/פרויקט כ-sidebar)

### 3.3 שיתופי פעולה
- Comments thread פר-PO
- @mentions עם push
- Real-time presence (Supabase Realtime)
- Mobile-first approver UI

### 3.4 Integration-first
- Webhooks על כל שינוי סטטוס
- Supplier Portal (magic-link)
- E-invoice OCR + 3-way auto-match
- חתימה דיגיטלית (תקן ישראלי)

---

## 4. עקרונות תכנון (Refinements — לאחר feedback)

### 4.1 **Approval-first** (refinement #1)
שרשרת האישורים היא **הלב** של הבקרה בפרויקטי תשתית. לכן:
- **Phase 7.3** יכלול **skeleton migration** לטבלאות `erp_md_po_types` ו-`erp_po_approvals` — למנוע יצירת הזמנות "יתומות" ללא מנגנון אישור **כבר מיום 1**.
- **Phase 7.7** ימלא את הלוגיקה, ה-UI והזרימה — אבל הסכמה תהיה מוכנה מראש.
- כל `erp_purchase_orders` שייווצר מ-7.3 והלאה יכלול `assignee_user_id` + `current_approval_level` מוכנים.

### 4.2 **Multi-tenant UI clarity** (refinement #2)
RLS מאחורי הקלעים לא מספיק כש-**קבוצת החזקות** מנהלת ~N חברות-בנות. לכן:
- בכל מסך PO: **בר עליון עם שם החברה הפעילה** (badge בולט — לא רק בקונסול).
- בחירת פרויקט מציגה `${projectNumber} · ${name} · ${site}` (כולל אתר גיאוגרפי).
- מעבר חברה → banner צהוב אזהרה אם יש Draft פתוח בחברה אחרת.
- **זה ייושם ב-Phase 7.3 משולב עם Header Enrichment**.

### 4.3 **AI-ready API design** (refinement #3)
**Phase 7.5** (Smart Pricing) ייבנה כך ש-**סוכני Python** יוכלו להתחבר בלי עבודה נוספת:
- **REST endpoints עם OpenAPI spec** (לא Server Actions פנימיים).
- **JSON responses שטוחים**, ללא session-dependent context.
- **Stateless inference** — הפעלה חוזרת עם אותם קלטים נותנת אותו פלט.
- **Rate limiting מוכן** (token-bucket מבוסס Supabase).
- **Service-role token support** לקריאות backend-to-backend.
- Phase 7.10 יבנה על זה מבלי לשכתב schema.

### 4.4 **Living docs in repo** (refinement #4)
- `docs/procurement/po-module-spec.md` (this file) — high-level plan.
- `docs/procurement/po-field-reference.md` — field table updated per-phase.
- אחרי כל Phase: עדכון §7 + הוספת שורה ל-reference table.
- **Memory hash** — רשומת memory עם hash של המסמך, לשליפה מהירה בשיחות עתידיות של Cascade/Cursor.

---

## 5. תכנית שלבים מפורטת

### 🔵 Phase 7.3 — Header Enrichment + Multi-tenant UI + Approval Skeleton

**יעדים**:
1. הרחבת כותרת PO לשדות הקריטיים של Priority.
2. הצגת החברה הפעילה בבירור ב-UI.
3. הכנה מוקדמת של סכמת האישורים (skeleton בלבד).

**Schema**:
```sql
-- Migration 1: Header enrichment
ALTER TABLE erp_purchase_orders
  ADD COLUMN supplier_contact_name  text,
  ADD COLUMN supplier_contact_role  text,
  ADD COLUMN receiving_warehouse_id uuid REFERENCES erp_md_warehouses(id),
  ADD COLUMN warehouse_location     text,
  ADD COLUMN shipping_method        text,
  ADD COLUMN po_type_id             uuid,  -- FK יתווסף אחרי יצירת erp_md_po_types
  ADD COLUMN branch_id              uuid,
  ADD COLUMN for_user_id            uuid REFERENCES auth.users(id),
  ADD COLUMN requisition_id         uuid,
  ADD COLUMN quote_id               uuid,
  ADD COLUMN framework_order_id     uuid,
  ADD COLUMN customer_order_id      uuid,
  ADD COLUMN general_discount_pct   numeric(5,2) DEFAULT 0 CHECK (general_discount_pct BETWEEN 0 AND 100);

-- Migration 2: Approval skeleton (ready for 7.7 to fill in)
-- See po_approval_skeleton.sql — creates:
--   erp_md_po_types
--   erp_po_approvals
--   Adds assignee_user_id, current_approval_level to erp_purchase_orders
```

**UI**:
- `CompanyContextBadge` בכותרת הטופס (refinement #2).
- Header form מפורק ל-3 טאבים: `Main | Logistics | References`.
- כל FK עם drill-down (reuse `use-f2-listener`).
- Draft autosave כל 30 שניות (`localStorage` + resume prompt).

**Acceptance**:
- `tsc --noEmit` clean.
- E2E: יצירת PO עם כל שדות ה-header החדשים.
- Badge חברה נראה בראש העמוד.

**Effort**: 4-5 ימים (כולל ה-skeleton).

---

### 🟢 Phase 7.4 — Line Enrichment

**Schema**:
```sql
ALTER TABLE erp_purchase_order_lines
  ADD COLUMN supply_date         date NOT NULL DEFAULT (CURRENT_DATE + INTERVAL '14 days'),
  ADD COLUMN discount_pct        numeric(5,2) DEFAULT 0,
  ADD COLUMN line_currency       varchar(3) DEFAULT 'ILS',
  ADD COLUMN exchange_rate       numeric(12,6) DEFAULT 1,
  ADD COLUMN price_source        text CHECK (price_source IN
    ('SUPPLIER_PRICELIST','LAST_PURCHASE','MANUAL','QUOTE','FRAMEWORK')),
  ADD COLUMN manufacturer_name   text,
  ADD COLUMN line_notes          text;
```

**UI**:
- עמודות: `ת. אספקה`, `הנחה %`, באדג' `price_source`.
- חישוב total ברמת שורה: `qty * unit_price * (1 - discount/100)`.

**Effort**: 2-3 ימים.

---

### 🟡 Phase 7.5 — Smart Pricing Engine (AI-ready API)

**API חדש** (refinement #3 — OpenAPI-compliant, Python-agent-ready):

```
GET /api/procurement/orders/price-suggestions
    ?itemId=<uuid>&supplierId=<uuid>&date=<iso8601>

Response:
{
  "suggestions": [
    { "source": "SUPPLIER_PRICELIST",
      "price": 15.00, "currency": "ILS",
      "effectiveFrom": "2026-04-01", "confidence": 0.95 },
    { "source": "LAST_PURCHASE",
      "price": 14.50, "currency": "ILS",
      "effectiveFrom": "2026-03-10", "poNumber": "PO-0042",
      "confidence": 0.90 },
    { "source": "BEST_OFFER_CROSS_SUPPLIER",
      "price": 12.80, "currency": "ILS",
      "supplierId": "...", "supplierName": "ספק אלטרנטיבי",
      "confidence": 0.70 }
  ],
  "statistics": {
    "median": 14.50, "mean": 14.10, "stdDev": 1.23,
    "sampleSize": 12, "windowDays": 90
  },
  "anomaly": { "detected": false, "deltaPct": null }
}
```

**עקרונות**:
- Stateless: אותם קלטים → אותה תשובה.
- Service-role header support: `X-Service-Role: <key>` לקריאות backend.
- OpenAPI schema ב-`docs/api/procurement-openapi.yaml`.

**UI**:
- Panel "מחירים אפשריים" מתחת לטבלת השורות.
- לחיצה על הצעה → החלפת `unit_price` + `price_source`.

**Effort**: 5-6 ימים.

---

### 🟣 Phase 7.6 — Attachments + Rich Text

**Schema**:
```sql
CREATE TABLE erp_po_attachments (
  id uuid PK, company_id uuid, purchase_order_id uuid FK,
  file_name text, storage_path text, mime_type text,
  size_bytes bigint, uploaded_by uuid FK, uploaded_at timestamptz,
  description text, visible_to_supplier boolean DEFAULT false
);

ALTER TABLE erp_purchase_orders
  ADD COLUMN body_html         text,
  ADD COLUMN body_html_english text;
```

**Storage**: Supabase bucket `po-attachments` עם RLS לפי `company_id`.
**Editor**: Tiptap (מבוסס ProseMirror).

**Effort**: 4 ימים.

---

### 🔴 Phase 7.7 — Approval Workflow (Full UI + Logic)

**בסכמה**: טבלאות `erp_md_po_types` + `erp_po_approvals` כבר קיימות מ-7.3. כאן ממלאים לוגיקה.

**Lifecycle**:
```
DRAFT → PENDING_APPROVAL → APPROVED → SENT_TO_SUPPLIER → RECEIVING → RECEIVED → CLOSED
                      ↓
                  REJECTED                                          → CANCELLED (any stage)
```

**יכולות**:
- הגדרת שרשרת אישורים פר-סוג PO (`approval_chain_json`).
- אישור mobile-first: דף ייעודי `/approve/[id]` עם כפתור ענק.
- Push notifications (Supabase Edge Function + Expo SDK כש-mobile).
- חתימה דיגיטלית (base64 canvas).

**Effort**: 7-8 ימים.

---

### 🟤 Phase 7.8 — Revisions + Change Log

**Schema**:
```sql
CREATE TABLE erp_po_revisions (
  id uuid PK, purchase_order_id uuid FK, revision_number int,
  snapshot_jsonb jsonb, created_at, created_by, reason text
);
CREATE TABLE erp_po_change_log (
  id uuid PK, purchase_order_id uuid FK, line_id uuid NULL,
  field_name text, old_value text, new_value text,
  changed_at timestamptz, changed_by uuid
);
```

**Trigger**: על כל UPDATE → audit row.
**UI**: diff-view צבעוני בין revisions.

**Effort**: 3-4 ימים.

---

### ⚫ Phase 7.9 — Goods Receipt + 3-Way Match

**Schema**:
```sql
CREATE TABLE erp_goods_receipts (id, po_id, received_date, delivery_note_number, ...);
CREATE TABLE erp_goods_receipt_lines (id, gr_id, po_line_id, quantity_received, ...);
```

**לוגיקה**: PO_line.quantity - Σ(GR_lines.received) = open_balance.
**3-way**: PO + GR + Invoice → MATCHED אם ± 1%.

**Effort**: 5 ימים.

---

### 🌟 Phase 7.10 — AI Smart Features

בנוי על ה-API מ-7.5 (refinement #3). Python agents יוכלו לצרוך את אותם endpoints.

**יכולות**:
- Budget burn live preview (sidebar widget).
- Anomaly detection (PostgreSQL percentile windows).
- Best-price discovery cross-supplier.
- Delivery ETA ML (time-series על `erp_goods_receipts.received_date`).
- Optimal quantity suggestion.

**Tech**: Supabase Edge Functions (Deno) + עמודת cache ב-`erp_ai_cache`.

**Effort**: 8-10 ימים.

---

### 🔵 Phase 7.11 — Supplier Portal + E-Invoice

- `/supplier-portal` עם magic-link auth.
- ספק רואה/מאשר/דוחה/מעלה חשבונית.
- E-invoice OCR (Gemini Vision) + auto-match.

**Effort**: 12-14 ימים.

---

### 🟢 Phase 7.12 — Mobile + Collaboration

- PWA או React Native wrapper.
- Comments thread, @mentions, real-time presence.
- Quick-approve push action.

**Effort**: 8-10 ימים.

---

## 6. Timeline מומלץ

| רבעון | Phases | משך כולל |
|---|---|---|
| Q2 2026 | 7.3 + 7.4 + 7.7 (parity בסיסי) | ~14 ימים |
| Q3 2026 | 7.5 + 7.6 + 7.9 (parity מלא) | ~14 ימים |
| Q4 2026 | 7.8 + 7.10 (beyond) | ~14 ימים |
| 2027 H1 | 7.11 + 7.12 (portal + mobile) | ~22 ימים |
| **סה"כ** | | **~64 ימים** |

> **הערה**: 7.7 מתעדף לפני 7.5 כי approval workflow חשוב לבקרה עסקית יותר מ-smart pricing.

---

## 7. סטטוס (עודכן אחרון: 2026-04-30)

| Phase | תיאור קצר | סטטוס | תאריך סיום |
|---|---|---|---|
| 7.1 | Landing + Grid | ✅ | 2026-04-29 |
| 7.2 | Create Form + POST API + Governance | ✅ | 2026-04-30 |
| **7.3** | **Header Enrichment + Multi-tenant UI + Approval Skeleton** | 🚧 PLANNED | — |
| 7.4 | Line Enrichment | ⏳ PLANNED | — |
| 7.5 | Smart Pricing (AI-ready API) | ⏳ PLANNED | — |
| 7.6 | Attachments + Rich Text | ⏳ PLANNED | — |
| 7.7 | Approval Workflow (Full) | ⏳ PLANNED | — |
| 7.8 | Revisions + Change Log | ⏳ PLANNED | — |
| 7.9 | Goods Receipt + 3-Way | ⏳ PLANNED | — |
| 7.10 | AI Smart Features | ⏳ PLANNED | — |
| 7.11 | Supplier Portal + E-Invoice | ⏳ PLANNED | — |
| 7.12 | Mobile + Collaboration | ⏳ PLANNED | — |

---

## 8. Cross-references

- **Field-level reference**: `docs/procurement/po-field-reference.md`
- **API contract**: `docs/api/procurement-openapi.yaml` (נוצר ב-Phase 7.5)
- **Architecture decisions**:
  - `docs/decisions/2026-04-30-po-restore-project-governance.md` (TBD)
- **System index**: `docs/SYSTEM_INDEX.md` (רשומות "Phase 7.1/7.2")

---

## 9. Contribution Notes

כל מי שעובד על המודול:
1. קורא את המסמך הזה + `po-field-reference.md` לפני שינוי.
2. כל schema change → migration חדשה (never ALTER existing migrations).
3. כל שדה חדש → עדכון `po-field-reference.md` באותו PR.
4. בסיום Phase → עדכון §7 כאן + רשומה ב-`SYSTEM_INDEX.md`.
