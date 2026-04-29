# Master Data Onboarding — Integrated Plan

> **זהו מסמך האינטגרציה.** מאחד את כל המקורות (Priority SOP, תבניות Onboarding, Lihtman Spec, סכמת DB) למסלול פעולה יחיד.
>
> **קריאה חובה לפני:** [`canonical-data-contracts.md`](./canonical-data-contracts.md), [`items-schema-gap-analysis.md`](./items-schema-gap-analysis.md)
>
> **מקורות גולמיים נשמרו ב:** [`../ingested-specs/`](../ingested-specs/) *(Priority SOP, תבניות קליטה, DOCX של ל"טמן)*.

---

## 1. תכלית ומטרה

לאפשר הקמה מלאה של **כרטיס פריט** (ושאר המסכים בהמשך) על בסיס תשתית Master Data שלמה, המקבילה 1:1 לתשתית של Priority ש"המשתמש מרגיש בה בבית", תוך הוספת שכבת "Fighter Jet" מודרנית (AI, realtime, voice).

ההנחה: אין קוד מסך חדש לפני שה-Master Data שהוא נשען עליו קיים במלואו — אחרת קוד ספגטי.

---

## 2. המקורות וההלימה ביניהם

| מקור | מה הוא מספק | רמת סמכות |
|---|---|---|
| **Priority SOP — LB19000119** (מ-eshbelsaas) | תהליך קנוני: "פתיחת מק״ט" ב-4 שלבים | 🟢 **Canonical** — זה המשתמש שאנו מפתים לעזוב |
| **Lihtman DOCX** (61K תווים) | איפיון ל"טמן: מודולי ERP בנייה קבלנית, מכרזים, בקרה תקציבית | 🟡 **Reference** — מאמת business scope ומינוח |
| **8 תמונות Onboarding** | תבניות קליטת Master Data (הטבלאות הצהובות של Priority) | 🟢 **Canonical** — שדות, widths, types, mandatory flags |
| **`canonical-data-contracts.md`** | חוזים פנימיים של המערכת שלנו | 🟢 **Canonical** — לא לשבור אלא רק להרחיב |
| **סכמת DB בפועל** (migrations) | מצב אמת בפועל | 🟢 **Source of truth** — כל פער ← migration |

**כלל ההכרעה**: אם יש סתירה בין Priority SOP לבין קוד קיים — Priority מנצח, אלא אם יש החלטה מתועדת ב-`decisions/` שמצדיקה סטייה.

---

## 3. 8 הדומיינים — מטריצת אינטגרציה מלאה

### 3.1 **משפחות מוצר** (Product Families)

| שדה תבנית (תמונה 2) | Priority field | DB עכשיו | פער | פעולה |
|---|---|---|---|---|
| טיפוס (`CHAR 8`) | Family Type code | ✅ `erp_item_family_types.code` | אין | — |
| משפחה (`CHAR 4`, M) | Family code | ✅ `erp_md_product_families.family_code` | רוחב: `VARCHAR(32)` רחב מדי | ⚠️ לשקול constraint `length <= 8` (לא חוסם) |
| תאור משפחה (`RCHAR 32`) | Family description | ✅ `erp_md_product_families.name` | אין | — |

**הרחבות קיימות מעבר לתבנית** (שמורות — לא מוסרות):
- `default_budget_sub_chapter` + `default_resource_id` — ייחודי למודול הבנייה של ל"טמן (מ-DOCX).

**Seed נדרש**: החברה טוענת CSV משלה. שורה אחת מובטחת: `('GENERAL', 'משפחה כללית')` כברירת מחדל של `product_family_id` בכרטיס פריט (לפי Priority SOP, שלב א', סעיף 3).

**מסך ניהול נדרש**: `/marker-ofek/admin/master-data/families`.

---

### 3.2 **סיווג ספקים** (Supplier Classifications)

| שדה תבנית (תמונה 4) | Priority field | DB עכשיו | פער | פעולה |
|---|---|---|---|---|
| קוד סוג ספק (`CHAR 3`) | Supplier type code | ❌ **חסר טבלה!** | קריטי | **Migration חדש** |
| תאור סוג ספק (`RCHAR 32`, M) | Supplier type description | — | — | **Migration חדש** |

> ⚠️ הערה חשובה: קיים `erp_md_supplier_type` שהוא **enum** בינארי (`STANDARD`/`SUBCONTRACTOR`). זה לא מחליף את הסיווג החופשי — הוא complementary. הטבלה החדשה היא classification של "סוג תחום פעילות" (חומרי חשמל, אינסטלציה, וכו').

**Migration מתוכנן**:
```sql
create table public.erp_md_supplier_classifications (
  id uuid primary key default gen_random_uuid(),
  company_id text not null references public.erp_companies(id) on delete restrict,
  classification_code varchar(3) not null,
  description varchar(32) not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint erp_md_supplier_classifications_code_format 
    check (classification_code ~ '^[A-Za-z0-9]{1,3}$'),
  constraint erp_md_supplier_classifications_company_code_uq 
    unique (company_id, classification_code)
);

-- RLS + company isolation כמו שאר erp_md_*
alter table public.erp_md_suppliers
  add column if not exists classification_id uuid
  references public.erp_md_supplier_classifications(id) on delete set null;
```

**Seed מוצע** (מהדוגמה של ל"טמן):
```
01 | חומרי חשמל
02 | אינסטלציה
03 | קבלני ביצוע
04 | יועצים
05 | מובילים
```

**מסך ניהול**: `/marker-ofek/admin/master-data/supplier-classifications` (Pilot של Form Engine).

---

### 3.3 **תנאי תשלום** (Payment Terms)

| שדה תבנית (תמונה 8) | Priority field | DB עכשיו | פער | פעולה |
|---|---|---|---|---|
| תנאי תשלום (`CHAR 3`) | Code | ✅ `erp_payment_terms.code` (`VARCHAR 16`) | אין | — |
| קוד תנאי תשלום (`RCHAR 24`, M) | Description | ✅ `erp_payment_terms.description` | רוחב שונה | — |
| שוטף (`CHAR 1`, default Y) | End-of-month flag | ✅ `is_eom BOOLEAN` | שיוף ל-`'Y'` | — |
| חודשים (`INT 6`) | Months to add | ✅ `months_to_add INTEGER` | אין | — |
| ימים (`INT 6`) | Days to add | ✅ `days_to_add INTEGER` | אין | — |
| מספר תשלומים (`INT 3`) | Installments | ✅ `installments INTEGER` | אין | — |

**סטטוס**: מבנה תואם 100%. חסר רק **Seed מלא**.

**Seed נדרש** (מתבנית תמונה 8):
```
01 | שוטף        | is_eom=Y | 0m  | 0d  | 1 pay
02 | ש15         | is_eom=Y | 0m  | 15d | 1 pay
03 | ש30         | is_eom=Y | 1m  | 0d  | 1 pay
04 | ש45         | is_eom=Y | 1m  | 15d | 1 pay
05 | ש60         | is_eom=Y | 2m  | 0d  | 1 pay
06 | ש90         | is_eom=Y | 3m  | 0d  | 1 pay
07 | ש120        | is_eom=Y | 4m  | 0d  | 1 pay
08 | 2 תשלומים   | is_eom=Y | 0m  | 0d  | 2 pay
09 | 3 תשלומים   | is_eom=Y | 0m  | 0d  | 3 pay
```

**קיים כעת ב-DB**: רק `01, 02, 11`. **פעולה**: migration seed שמוסיף 03-09 ומעדכן את 02 להתאמה.

**מסך ניהול**: `/marker-ofek/admin/master-data/payment-terms`.

---

### 3.4 **יחידות מידה** (Units of Measure)

| שדה תבנית (תמונה 3) | Priority field | DB עכשיו | פער | פעולה |
|---|---|---|---|---|
| יח' (עברית) | UOM Hebrew code | ✅ `units_of_measure.code` | אין | — |
| תאור יחידה | Description | ✅ `description_he` | אין | — |
| שם יחידה באנגלית | English name | ✅ `name_en` | אין | — |

**סטטוס**: מבנה תואם. Seed חלקי בלבד.

**Seed קיים**: `LB, L, KG, HR, M, M2, M3, EA, TON, CM, MM, BOX, ROLL` (13).

**Seed נדרש נוסף** (מתבנית תמונה 3):
```
YRD | יארד         | Yard
GL  | גלון         | Gallon
IN  | אינטש        | Inch
FT  | רגל          | Foot
PT  | פיינט        | Pint
QT  | קוורט        | Quart
OZ  | אונקיה       | Ounce
GM  | גרם          | Gram
LTR | ליטר         | Liter  (נוסף ל-`L` הקיים — aliases)
KM  | ק"מ נסיעה    | Kilometer (travel)
CU  | קוב (מעוקב)  | Cubic
```

**מסך ניהול**: `/marker-ofek/admin/master-data/units`.

---

### 3.5 **מטבעות** (Currencies)

**כפילות מבנית**: קיימות 2 טבלאות שונות:
- `currencies` (לשכבת UI המאוחדת, `id uuid, code varchar(8), name_he text`)
- `erp_currencies` (מסורתית, `code varchar(8), name varchar(128)`)

**החלטה**: לאחד ל-`currencies` (הטבלה עם `id uuid` + `name_he`) ולמחוק את `erp_currencies` כ-DEPRECATED.

| שדה תבנית (תמונה 1) | Priority field | DB עכשיו | פער | פעולה |
|---|---|---|---|---|
| קוד (`CHAR 3`) — ISO 4217 | Currency code | ✅ `currencies.code` | אין | — |
| שם בעברית | Hebrew name | ✅ `currencies.name_he` | אין | — |

**Seed נדרש**: כ-70 קודי ISO מהתמונה. רשימה מלאה ב-[`../ingested-specs/onboarding-master-data-templates.md`](../ingested-specs/onboarding-master-data-templates.md).

**הערה על legacy**: יש שימוש ב-`erp_currencies` בקוד מסוים. המעבר יכלול adapter שיקרא גם מ-`currencies` במהלך תקופת gluing.

**מסך ניהול**: `/marker-ofek/admin/master-data/currencies`.

---

### 3.6 **ספקים וקבלנים** (Suppliers & Contractors)

| שדה תבנית (תמונה 5) | Priority field | DB עכשיו | פער | פעולה |
|---|---|---|---|---|
| מס' ספק | Supplier number | ✅ `supplier_number` | — | — |
| שם ספק | Name | ✅ `name` | — | — |
| שם ספק באנגלית | Foreign name | ✅ `foreign_name` | — | — |
| מס' רהות (ID / ח.פ.) | Tax ID | ✅ `tax_id` | — | — |
| מס' הכנסות (Income tax #) | — | ⚠️ ב-`bank_details` jsonb | לא structured | לשקול column |
| כתובת | Address | ✅ `address` | — | — |
| **עיר** | City | ❌ | חסר | Migration |
| **ת.ד.** | PO Box | ❌ | חסר | Migration |
| **מיקוד** | Postal code | ❌ | חסר | Migration |
| ת' בנק / ס' בנק / חשבון | Bank details | ✅ `erp_supplier_bank_accounts` + sub-level | — | — |
| **נקיון %** | Cleaning % | ❌ | חסר | Migration |
| **% מקוזז** | Deducted % (retention) | ❌ | חסר | Migration |
| סוג הנח"ש | GL group | ❌ | חסר | Migration |
| מטבע | Currency | ✅ `currency_id`/`preferred_currency_code` | — | — |
| סוג קניה | Purchase type | ❌ | חסר | לשקול |
| **תוקף** (אישור ספרים) | Books validity date | ❌ | חסר | Migration |
| **סוף שבוע/חודש** | Week/month end flag | ❌ | חסר | Migration |
| **מס' שוטף** | Floating # days | ❌ | חסר | Migration (מכוסה ע"י `payment_term_code` FK) |
| מס' שוטף אחר | Alt floating # days | ❌ | חסר | לשקול |
| **אישור ספרים תקף** | Books approval valid | ❌ | חסר | Migration (boolean נגזר מ-`books_validity_date`) |
| קוד אישור הסכם | Agreement approval code | ❌ | חסר | Migration |
| **סיווג (FK)** | Supplier classification | ❌ | חסר | Migration (ראו 3.2) |

**Migration מתוכנן**:
```sql
alter table public.erp_md_suppliers
  add column if not exists city text,
  add column if not exists postal_code varchar(10),
  add column if not exists po_box varchar(16),
  add column if not exists discount_pct numeric(5,2) default 0,       -- נקיון
  add column if not exists retention_pct numeric(5,2) default 0,       -- ניכיון/מקוזז
  add column if not exists books_validity_date date,
  add column if not exists is_eom_billing boolean default false,       -- סוף חודש
  add column if not exists hanash_group_code varchar(16),              -- סוג הנח"ש
  add column if not exists agreement_approval_code varchar(16),
  add column if not exists shotef_alt_days integer,                    -- שוטף אחר
  add column if not exists classification_id uuid
    references public.erp_md_supplier_classifications(id) on delete set null;

-- computed boolean
create or replace view public.v_erp_md_suppliers_with_books_status as
select *,
  coalesce(books_validity_date >= current_date, false) as books_approval_valid
from public.erp_md_suppliers;
```

**מסך ניהול**: **קיים חלקית** (`/marker-ofek/supply-chain/suppliers`). יורחב בשלב ה-UI.

---

### 3.7 **מק"טי ספק** (Supplier Items / Parts)

| שדה תבנית (תמונה 6) | Priority field | DB עכשיו (`erp_md_supplier_items`) | פער | פעולה |
|---|---|---|---|---|
| מס' ספק (`CHAR 16`) | Supplier # | ✅ `supplier_id` FK | — | — |
| מק"ט (`CHAR 22`) | Our SKU | ✅ `item_id` FK | — | — |
| מק"ט ספק/יצרן (`CHAR 30`) | Supplier SKU | ✅ `supplier_sku` | — | — |
| **יצרן (`CHAR 10`)** | Manufacturer | ❌ | חסר | Migration |
| שם ספק (`RCHAR 48`) — read-only | Supplier name | ⚠️ join ל-`erp_md_suppliers.name` | OK דרך view | — |
| **תאור מוצר ספק (`RCHAR 32`)** | Supplier description | ❌ | חסר | Migration |
| **תאור יצרן (`RCHAR 32`)** | Manufacturer description | ❌ | חסר | Migration |
| מחיר | Price | ✅ `base_price` | — | — |
| מטבע | Currency | ✅ `currency` CHAR(3) | — | — |
| יחידה | UOM | ✅ `uom` | — | — |
| דגל "מועדף" | Preferred | ✅ `is_preferred` | — | — |
| תקף מ/עד | Valid from/to | ✅ `valid_from`, `valid_to` | — | — |

**Migration מתוכנן**:
```sql
alter table public.erp_md_supplier_items
  add column if not exists manufacturer varchar(10),
  add column if not exists manufacturer_sku varchar(30),        -- מק"ט יצרן נפרד
  add column if not exists description_supplier_32 varchar(32),
  add column if not exists description_manufacturer_32 varchar(32);
```

**הערה על legacy**: קיים `supplier_parts` (טבלה ישנה עם השדות `description_32_chars`, `description_48_chars`, `manufacturer`). **זו ההצדקה למבנה החדש** — נכון לעבוד עם `erp_md_supplier_items` (המודרני, multi-tenant) ולהביא אליו את השדות שחסרו. `supplier_parts` יסומן DEPRECATED ב-`canonical-data-contracts.md`.

**מסך ניהול**: **אין מסך ייעודי** — נטמע כ-**sub-level form** של כרטיס פריט (ראה סעיף 4).

---

### 3.8 **פריטים** (Item Master) — המסך המרכזי

כבר מכוסה ב-[`items-schema-gap-analysis.md`](./items-schema-gap-analysis.md). סיכום רלוונטי:

| שדה Priority SOP (PDF) | DB עכשיו | סטטוס |
|---|---|---|
| מק"ט | `item_number` | ✅ |
| תאור | `description` | ✅ |
| תאור לועזי | `foreign_description` | ✅ |
| משפחת מוצר | `product_family_id` FK | ✅ |
| טיפוס (R/P/S/K) | `item_type` | ✅ |
| יח' קניה/מכירה | `unit_of_measure` FK | ✅ |
| יח' מפעל + שעור המרה | ❌ חסר שני שדות | Migration: `factory_uom`, `conversion_factor` |
| סטטוס (פעיל/לא) | `status` | ✅ |
| מנוהל מלאי | `is_inventory_managed` | ✅ |
| מחיר מחירון בסיס | `legacy_default_price` | ⚠️ שם legacy — לשנות |
| ספק מועדף (FK) | ❌ חסר | Migration: `preferred_supplier_id` |
| תקציב: תת-פרק + משאב (ל"טמן) | `budget_sub_chapter`, `resource_id` | ✅ ייחודי-לנו |

**Sub-levels נדרשים** (מ-Priority SOP):
1. מוצרים – טקסט (טקסט לתעודות) — ❌ צריך טבלה `erp_md_item_print_text`
2. הודעה בהקלדת מק"ט — ❌ צריך טבלה `erp_md_item_entry_messages`
3. מק"טי ספק — ✅ `erp_md_supplier_items` (ראו 3.7)
4. היסטוריית מחירים — ❌ (view נגזרת מ-PO history)

**Stage B — הגדרות כספים** (Priority SOP): קבוצת מע"מ, משפחת הנח"ש, משקלים, נפחים — ❌ חסרים. Migration נפרד.

**Stages C+D** (הנדסי, מאפיינים נוספים): דחייה לשלב מאוחר — **לא חוסם** את v1 של כרטיס פריט.

---

## 4. תוכנית Migrations — 3 גלים

### **גל 1** — יסוד חסר (1-2 ימי עבודה)

**Migration `20260427_supplier_classifications.sql`**:
```
+ CREATE TABLE erp_md_supplier_classifications
+ ALTER erp_md_suppliers ADD classification_id FK
+ RLS + indexes
+ Seed: 5 שורות דוגמה של ל"טמן
```

**Migration `20260427_master_data_seeds_complete.sql`**:
```
+ INSERT erp_payment_terms (03-09, 9 rows)
+ INSERT units_of_measure (YRD, GL, IN, FT, PT, QT, OZ, GM, LTR, KM, CU)
+ INSERT currencies (70 קודי ISO)
+ INSERT erp_md_product_families GENERAL (fallback)
```

### **גל 2** — השלמת שדות ספק/פריט (יום עבודה)

**Migration `20260428_suppliers_full_profile.sql`**:
```
+ ALTER erp_md_suppliers ADD city, postal_code, po_box, 
                              discount_pct, retention_pct,
                              books_validity_date, is_eom_billing,
                              hanash_group_code, agreement_approval_code,
                              shotef_alt_days
+ CREATE VIEW v_erp_md_suppliers_with_books_status
```

**Migration `20260428_supplier_items_full_profile.sql`**:
```
+ ALTER erp_md_supplier_items ADD manufacturer, manufacturer_sku,
                                   description_supplier_32, 
                                   description_manufacturer_32
```

**Migration `20260428_items_full_profile.sql`**:
```
+ ALTER erp_md_items ADD factory_uom, conversion_factor,
                          preferred_supplier_id FK,
                          vat_group_code, gl_family_code,
                          weight_kg, volume_m3
+ CREATE TABLE erp_md_item_print_text (item_id PK/FK, text)
+ CREATE TABLE erp_md_item_entry_messages (item_id PK/FK, message)
+ Rename legacy_default_price → default_price (maintain alias view for legacy readers)
```

### **גל 3** — ניקוי כפילויות (אופציונלי, חצי יום)

**Migration `20260429_deprecate_erp_currencies.sql`**:
```
+ Data migration: currencies ← erp_currencies (איחוד)
+ Legacy adapter VIEW v_legacy_erp_currencies
+ Mark erp_currencies as DEPRECATED ב-canonical-data-contracts.md
```

---

## 5. APIs שייבנו (כולם קנוניים)

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/master-data/supplier-classifications` | GET, POST | רשימה + יצירה |
| `/api/master-data/supplier-classifications/[id]` | GET, PUT, DELETE | CRUD יחיד |
| `/api/master-data/payment-terms` | GET, POST | — |
| `/api/master-data/payment-terms/[code]` | GET, PUT, DELETE | — |
| `/api/master-data/units` | GET, POST | — |
| `/api/master-data/units/[id]` | GET, PUT, DELETE | — |
| `/api/master-data/currencies` | GET, POST | — |
| `/api/master-data/currencies/[id]` | GET, PUT, DELETE | — |
| `/api/master-data/suppliers` | **קיים** — יורחב | — |
| `/api/master-data/items` | **קיים** — יורחב לכל השדות החדשים | — |
| `/api/master-data/supplier-items` | **קיים** — יורחב | — |

כולם עוטפים אחרי הסטנדרט: Zod validation, `user_has_company_access`, תגובה עקבית.

---

## 6. מסכי ניהול (Admin UI) — כולם באותו Pattern

נתיב שורש: `/marker-ofek/admin/master-data/`

| מסך | URL | מבוסס על |
|---|---|---|
| משפחות מוצר | `/families` | Form Engine + table view |
| סיווגי ספקים (**Pilot!**) | `/supplier-classifications` | Form Engine + table view |
| תנאי תשלום | `/payment-terms` | Form Engine + table view |
| יחידות מידה | `/units` | Form Engine + table view |
| מטבעות | `/currencies` | Form Engine + table view |

**כל המסכים שותפים**: אותו layout, אותו table component, אותו form component — שכבת DSL יחידה (ה-Form Engine). זו בדיוק המטרה: מסך חדש = `defineForm()` + route בלבד.

**הרשאות**: קריאה לכל המחוברים, כתיבה ל-`admin` / `finance_admin` / `procurement_admin` (פירוט ב-`permissions-matrix.md`, עתיד להיבנות).

---

## 7. האינטגרציה בכרטיס פריט — איך כל דומיין מתחבר

```
┌──────────────── כרטיס פריט ────────────────┐
│                                               │
│  [שלב א] פרטים כלליים                        │
│   ├─ מק"ט                                    │
│   ├─ תיאור                                    │
│   ├─ משפחת מוצר ◄─── erp_md_product_families │
│   ├─ יח' קניה   ◄─── units_of_measure        │
│   ├─ יח' מפעל   ◄─── units_of_measure        │
│   ├─ שעור המרה                               │
│   ├─ ספק מועדף ◄─── erp_md_suppliers         │
│   │                   └─ מסונן לפי           │
│   │                      classification_id    │
│   └─ מטבע       ◄─── currencies               │
│                                               │
│  [שלב ב] הגדרות כספים                         │
│   ├─ קבוצת מע"מ                               │
│   ├─ משפחת הנח"ש                              │
│   ├─ מחיר מחירון בסיס                         │
│   └─ תנאי תשלום ◄─── erp_payment_terms        │
│                                               │
│  [sub-level] מק"טי ספק       ◄─── erp_md_supplier_items │
│   ├─ מס' ספק                                 │
│   ├─ מק"ט ספק                                │
│   ├─ יצרן + מק"ט יצרן                        │
│   └─ תיאורים ומחירים                         │
│                                               │
│  [sub-level] טקסט להדפסה     ◄─── erp_md_item_print_text│
│  [sub-level] הודעה בהקלדה    ◄─── erp_md_item_entry_messages│
└───────────────────────────────────────────────┘
```

---

## 8. העיקרון ההרמוני — "Priority Comfort + Fighter Jet"

### 🏠 Comfort (מה שומרים 1:1 מ-Priority SOP)
- סדר 4 השלבים (א' → ב' → ג' → ד') זהה
- שמות שדות בעברית זהים (מק"ט, תאור, משפחת מוצר, יח' קניה/מכירה, יח' מפעל, שעור המרה, מנוהל מלאי, מחיר מחירון בסיס)
- ברירות מחדל זהות (`טיפוס=R`, `מנוהל מלאי=כן`, `סטטוס=פעיל`, `משפחה=GENERAL`)
- sub-screens באותם שמות ("מוצרים - טקסט", "הודעה בהקלדת מק"ט")
- Keyboard shortcuts מקבילים: F6 = פתיחת sub-screen, F4 = list lookup, F11 = save, F12 = audit/history

### 🛩️ Fighter Jet (הערך המוסף)
- AI Copilot לכל שדה (classify, translate, suggest price)
- Realtime co-editing (Supabase channels)
- Live Preview panel
- Voice + Image input (STT + OCR)
- Command Palette (⌘K)
- Explain Why (⇧ארוך על שדה חובה)
- Auto-cascading מוכפר (family → budget_sub_chapter, resource_id, GL defaults)
- Version history + diff UI
- No per-user licensing friction

---

## 9. סדר עבודה מומלץ

| # | משימה | תלות | חסם |
|---|---|---|---|
| 1 | Migrations גל 1 (supplier_classifications + seeds) | — | לא |
| 2 | API + מסך `supplier-classifications` (Pilot ל-Form Engine) | 1 | לא |
| 3 | Form Engine spec + implementation | 2 (מונחה בפועל) | — |
| 4 | מסכים נוספים (payment-terms, units, currencies) | 3 | לא |
| 5 | Migrations גל 2 (suppliers + items + supplier_items full profile) | — | לא |
| 6 | כרטיס פריט v1 (Comfort Layer) | 3, 5 | לא |
| 7 | Sub-levels של פריט (טקסט, הודעה, מק"טי ספק) | 5, 6 | לא |
| 8 | AI Copilot | 6 | Phase 4c |
| 9 | Migrations גל 3 (ניקוי כפילות currencies) | 4 | לא |

---

## 10. קריטריוני קבלה (Definition of Done)

**עבור כל דומיין Master Data — פחות לא מספיק:**
1. ✅ טבלה קיימת עם company_id + RLS + indexes
2. ✅ Seed ראשוני טעון
3. ✅ API קנוני (`/api/master-data/<domain>`) עם CRUD מלא + Zod
4. ✅ מסך ניהול תחת `/admin/master-data/<domain>` — list + form + delete
5. ✅ Zod schema משותף בין API ל-UI
6. ✅ Unit test לפחות לפעולת write אחת
7. ✅ רשומה ב-`canonical-data-contracts.md`
8. ✅ רשומה ב-`permissions-matrix.md`

**עבור כרטיס פריט — בנוסף:**
9. ✅ כל lookup פעיל (משפחה, יחידה, ספק, מטבע, תנאי תשלום)
10. ✅ cascades פועלים (משפחה → budget_sub_chapter)
11. ✅ הרשאות: reader יכול לראות, editor יכול לערוך, admin יכול ליצור
12. ✅ עובד ב-RTL עברית + dir=ltr לשדות מספריים

---

## 11. סיכונים ומיטיגציה

| סיכון | השפעה | מיטיגציה |
|---|---|---|
| אי-התאמה בין קוד קיים (`supplier_parts`) לחדש (`erp_md_supplier_items`) | בלבול developers | Deprecation tag ברור ב-canonical-data-contracts + migration adapter |
| Seed של מטבעות שקריא (70 רשומות) | גודל migration | שימוש ב-`COPY FROM` במקום INSERTs ארוכים |
| RLS breaks כש-classification_id מוסף | נתוני בדיקה לא נטענים | Default `null` + policy מאפשר `is null` |
| ספקים קיימים ללא classification_id | UI מציג "לא מסווג" | ✅ מקובל — UI מסמן warning רך בלבד |
| כרטיס פריט Comfort vs Fighter Jet — יותר מדי טכנולוגיה בבת אחת | המשתמש אובד | שלבים: Comfort תחילה (פחות ספק), Fighter Jet כ-opt-in |

---

## 12. Decision Log — רשימת החלטות שצריכות תיעוד ב-`decisions/`

רשומות אלה יעברו למסמכי החלטה נפרדים:

1. **DEC-001**: Form Engine כ-pattern משותף לכל 6 מסכי ה-Master Data + כרטיס פריט
2. **DEC-002**: Supplier Classifications בחור כ-Pilot ל-Form Engine (הכי קטן, הכי חסר)
3. **DEC-003**: `erp_md_supplier_items` כקנוני; `supplier_parts` כ-DEPRECATED
4. **DEC-004**: `currencies` כקנוני; `erp_currencies` להסרה בגל 3
5. **DEC-005**: `erp_md_supplier_classifications` טבלה חדשה (לא הרחבה של `erp_md_supplier_type` enum)

---

*עודכן: 2026-04-26 — מסמך חי. עדכנו אחרי כל merge שמשפיע על Master Data.*
