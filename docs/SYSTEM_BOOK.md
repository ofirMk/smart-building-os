# 📖 Smart Building OS — ספר המערכת

> **מקור האמת היחיד.** אם אין כאן — אין במערכת.
>
> כל פיתוח חדש (מסך, טבלה, API, חוק עסקי) מתחיל בקריאה של הדוקס המופיעים כאן, מתעדכן אחרי הגעה ל-merge, ומוסיף שורה ל-Decision Log אם ההחלטה לא-טריוויאלית.

---

## 🧭 כיצד להשתמש בספר הזה

1. **מתחילים מכאן** — הדף הזה הוא אינדקס. אף פעם לא עוסקים בחומר הוא לא מקושר מפה.
2. **סקופ חדש? קודם מחפשים בתוכן העניינים** — הימנעות מכפל אינדקסים, טבלאות, או מסכים קיימים.
3. **החלטה לא-טריוויאלית? מוסיפים ל-`decisions/`** — עם תאריך, נימוק, ואלטרנטיבות שנבחנו.
4. **שינוי רוחבי בסכמה? מעדכנים את `canonical-data-contracts.md`** — ואז כל המסמכים שמצביעים אליו.
5. **הגעת לקוד? חייב להתאים למסמך רלוונטי** — אחרת או שהמסמך שגוי ומתעדכן, או שהקוד לא מאושר.

---

## 📚 תוכן עניינים

### 🏛️ ארכיטקטורה וחוזים

| מסמך | מה בו | מתי לקרוא |
|---|---|---|
| [`SYSTEM_INDEX.md`](./SYSTEM_INDEX.md) | מפת דומיינים + נתיבי UI + קונבנציות | לפני כל מסך חדש |
| [`architecture/canonical-data-contracts.md`](./architecture/canonical-data-contracts.md) | **ה-Data Bible** — טבלאות קנוניות, APIs, Deprecated | לפני כל migration / API |
| [`architecture/items-schema-gap-analysis.md`](./architecture/items-schema-gap-analysis.md) | פערים בין schema ישן (`items_catalog`) לחדש (`erp_md_*`) | לפני עבודה על פריטים |
| [`architecture/7-DAY-RECOVERY-SPRINT.md`](./architecture/7-DAY-RECOVERY-SPRINT.md) | תיעוד ספרינט התייצבות אחרון | היסטוריה בלבד |
| [`architecture/DEPLOYMENT.md`](./architecture/DEPLOYMENT.md) | מדריך deploy | לפני הרצה ב-prod |
| [`architecture/PHASE_3_4_STATE.md`](./architecture/PHASE_3_4_STATE.md) | סטטוס שלבי AI | לפני עבודה על AI |

### 🆕 מסמכים שעדיין יש לבנות (Pending)

| מסמך | מה יהיה בו | סטטוס |
|---|---|---|
| [`architecture/master-data-onboarding-plan.md`](./architecture/master-data-onboarding-plan.md) | תוכנית 8 טבלאות ה-Onboarding (מ-Priority SOP) — migrations + seeds + מסכי ניהול | ✅ **נבנה** |
| `architecture/form-engine-spec.md` | איפיון ה-Form Engine — DSL, validation, triggers, sub-levels, AI copilot | ⏳ בהמתנה |
| `architecture/permissions-matrix.md` | מטריצת הרשאות: תפקידים × דומיינים × actions, כולל RLS patterns | ⏳ בהמתנה |
| `architecture/business-rules-registry.md` | רישום Cascades, Validations, Auto-fills — כללי הקוד העסקי | ⏳ בהמתנה |

### 📥 מפרטים חיצוניים שהוטמעו (Ingested Specs)

| מסמך | מקור | סטטוס |
|---|---|---|
| [`ingested-specs/priority-defining-a-part-sop.md`](./ingested-specs/priority-defining-a-part-sop.md) | [Priority SOP LB19000119](https://www.eshbelsaas.co.il/eshbel/primail/library/SOP_Defining%20a%20Part13_H.pdf) | ✅ **נבנה** |
| [`ingested-specs/lihtman-system-spec-excerpts.md`](./ingested-specs/lihtman-system-spec-excerpts.md) | DOCX של משתמש — איפיון ל"טמן | ✅ **נבנה** |
| [`ingested-specs/onboarding-master-data-templates.md`](./ingested-specs/onboarding-master-data-templates.md) | 8 תמונות Excel-like של תבניות קליטה | ✅ **נבנה** |
| [`ingested-specs/priority-opening-supplier-sop.md`](./ingested-specs/priority-opening-supplier-sop.md) | Priority SOP פתיחת ספק (§2) | ✅ **נבנה** |
| [`ingested-specs/priority-purchase-order-sop.md`](./ingested-specs/priority-purchase-order-sop.md) | Priority SOP הזמנת רכש (§2) | ✅ **נבנה** |
| [`ingested-specs/medatech-priority-project-module.md`](./ingested-specs/medatech-priority-project-module.md) | DOCX ל"טמן — פרקים §5+§6 (פרויקטים + בקרה תקציבית) | ✅ **נבנה** |
| [`ingested-specs/medatech-contracts-module.md`](./ingested-specs/medatech-contracts-module.md) | DOCX ל"טמן — פרק §3 (חוזי מזמין/קבלן + קיזוז חו"ג) | ✅ **נבנה (2026-05-11)** |

### 📑 מדריכים תפעוליים

| מסמך | מה בו |
|---|---|
| [`MARKER_OFEK_HANDBOOK.md`](./MARKER_OFEK_HANDBOOK.md) | התקנה, משתני סביבה, סדר הרצת SQL, CI, troubleshooting |

### 📝 יומן החלטות (Decisions Log)

| מסמך | החלטה | תאריך |
|---|---|---|
| `decisions/2026-04-26-form-engine-pilot.md` | בחירת Form Engine כבסיס לכל המסכים | ⏳ טיוטה |

---

## 🗺️ מפה ברמה-גבוהה

```
┌──────────────────── Frontend (Next.js App Router) ─────────────────────┐
│                                                                         │
│   app/(dashboard)/marker-ofek/                                          │
│     ├─ command-center/         ← מרכז הפיקוד (דשבורד ראשי)              │
│     ├─ items/                  ← קטלוג פריטים ← 🎯 כרטיס פריט (Pilot)   │
│     ├─ procurement/            ← הזמנות רכש, קבלות, חשבוניות            │
│     ├─ tenders/                ← מכרזים + הצעות מקבלני משנה             │
│     ├─ projects/               ← פרויקטים + Gantt + בקרה תקציבית        │
│     ├─ contracts/              ← חוזים וחשבונות חלקיים                  │
│     ├─ finance/                ← כספים (AR/AP, centralized, partials)   │
│     ├─ executive/              ← דשבורד הנהלה                           │
│     └─ admin/master-data/      ← ⏳ ניהול טבלאות lookup (חדש!)          │
│                                                                         │
└────────────────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────── API Layer (Next.js Route Handlers) ─────────────────┐
│   /api/master-data/*      ← CRUD לכל ה-Master Data (קנוני)              │
│   /api/erp/*              ← ERP flows (procurement, finance, RFQ)       │
│   /api/erp/ai/jobs        ← תור עבודות AI (HMAC-protected)              │
└────────────────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌───────────────────────── Supabase (Postgres + RLS) ────────────────────┐
│   erp_md_*               ← Master Data קנוני (items, suppliers, ...)   │
│   erp_*                  ← טרנזקציות עסקיות (POs, GRNs, invoices, ...) │
│   mo_*                   ← Marker-Ofek specific (audit, comments, ...)  │
│   ai_jobs                ← תור עבודות AI                                │
│                                                                         │
│   DEPRECATED: items_catalog, supplier_items, supplier_item_prices       │
│               proc_* (legacy procurement)                               │
└────────────────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌──────────────────── AI Worker (Python + FastAPI + CrewAI) ─────────────┐
│   ai-worker/                                                            │
│     ├─ main.py            ← FastAPI + HMAC auth                         │
│     ├─ crews/             ← CrewAI crews (gantt_risk, ...)              │
│     └─ tools/             ← Supabase tools לkrews                       │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 🏢 דומיינים קנוניים — מצב וסטטוס

| דומיין | טבלאות קנוניות | API קנוני | סטטוס UI | הערות |
|---|---|---|---|---|
| **Items (Master)** | `erp_md_items`, `erp_md_product_families`, `erp_md_supplier_items` | `/api/master-data/items` | ⚠️ מינימלי | `items/new` = 5 שדות בלבד — צפוי שיפוץ |
| **Suppliers (Master)** | `erp_md_suppliers`, `erp_md_supplier_contacts`, `erp_supplier_bank_accounts` | `/api/master-data/suppliers` | ⚠️ חלקי | חסרים: classification, city, postal, ניכיון, תוקף ספרים |
| **Payment Terms** | `erp_payment_terms` | — | ❌ אין | Seed חלקי (3/9). צריך מסך ניהול |
| **Supplier Classifications** | **חסר!** | — | ❌ אין | טבלה לא קיימת כלל |
| **Units of Measure** | `units_of_measure` | — | ❌ אין | Seed חלקי. צריך מסך ניהול |
| **Currencies** | `currencies` + `erp_currencies` (כפילות) | — | ❌ אין | לאחד לטבלה יחידה |
| **Purchase Orders** | `erp_purchase_orders`, `erp_purchase_order_lines` | `/api/erp/procurement/purchase-orders` | ✅ פעיל | הזרם הראשי |
| **Goods Receipts** | `erp_goods_receipts`, `erp_goods_receipt_lines` | `/api/erp/procurement/goods-receipts` | ✅ פעיל | — |
| **Vendor Invoices** | `erp_vendor_invoices`, `erp_vendor_invoice_lines` | `/api/erp/procurement/vendor-invoices` | ✅ פעיל | — |
| **RFQ / Quotes** | `erp_vendor_price_lists`, `erp_vendor_quotes` | `/api/erp/procurement/...` | ✅ פעיל | — |
| **AI Jobs Queue** | `ai_jobs` | `/api/erp/ai/jobs` | ✅ פעיל (Phase 4a/b) | HMAC + CrewAI + Gemini |

---

## ⚖️ עקרונות תשתית קבועים

מתועדים בשלמותם ב-[`canonical-data-contracts.md`](./architecture/canonical-data-contracts.md) — תקציר:

1. **R1 — Tenant isolation**: כל רשומה עסקית עם `company_id`. אסור לכתוב בלי.
2. **R2 — Canonical writes only**: UI כותב רק דרך APIs קנוניים. לא כותבים ישר לטבלאות legacy.
3. **R3 — Legacy via adapter**: קריאה מ-`DEPRECATED` מותרת רק דרך adapter שממפה ל-canonical DTO.
4. **R4 — No duplication**: אסור ליצור טבלה/API חדש אם יש מקביל קנוני.
5. **R5 — RLS always**: כל טבלה חדשה מקבלת `user_has_company_access(company_id)` ב-policy.
6. **R6 — Audit immutable**: כל שינוי עסקי משמעותי ב-`mo_audit_logs` (טריגר).

---

## 🚧 פיצ'רים בעבודה כעת (Active)

| # | פיצ'ר | סטטוס | תלויות |
|---|---|---|---|
| 1 | הטמעת 8 טבלאות Onboarding (Priority alignment) | 🟡 בתכנון | `master-data-onboarding-plan.md` |
| 2 | Form Engine (Pilot: Supplier Classifications) | 🟡 בתכנון | `form-engine-spec.md` |
| 3 | כרטיס פריט v2 (4 שלבים כ-Priority) | 🔴 חסום | תלוי ב-#1 ו-#2 |
| 4 | AI Copilot לכרטיס פריט (classify, translate, suggest) | 🔴 חסום | תלוי ב-#3 + Phase 4c |

---

## 🎯 צעד הבא

ראה [`decisions/2026-04-26-form-engine-pilot.md`](./decisions/2026-04-26-form-engine-pilot.md) — החלטת ה-Pilot שנקבעה.

---

*עודכן: 2026-04-26 — מסמך חי. עדכנו אחרי כל merge שמשפיע על ארכיטקטורה.*
