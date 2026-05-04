# Supplier Card — Implementation Spec

> **Translation of Priority SOP LB22000321 to our system.**
> Source: `docs/ingested-specs/priority-opening-supplier-sop.md` (read-only).
> Status: living document. Updated per phase.

---

## 1. תרגום רעיוני: Priority ↔ שלנו

| Priority | אצלנו | הערות |
|---|---|---|
| מסך "ספקים" | `SuppliersListScaffold` בדף `/marker-ofek/procurement/suppliers` | Master/Detail Priority-style — Done |
| "שם ספק" + "שם לועזי" | `erp_md_suppliers.name` + `foreign_name` | קיים |
| "מס. ספק" אוטומטי | `erp_md_suppliers.supplier_number` (manual כרגע) | **gap — auto-numbering via sequence, deferred to Phase ≥D** |
| "סטטוס פעיל" אוטומטי | חסר עמודת `status` | **Phase A** |
| "חשבון בהנה"ח" = מס' ספק | חסר עמודת `ledger_account` | **Phase C** |
| לשונית "כתובת וטלפון" | שדות: `address`, `phone`, `email` (flat על הטבלה) | אצלנו flat, לא תת-טבלה |
| לשונית "פרטים נוספים" | חסרות עמודות דגלים+enrichment | **Phase A** (ראה schema delta) |
| לשונית "כספים" = תנאי תשלום + מטבע | `payment_terms` + `currency_code` | קיים. חסר: `general_discount_pct`, `price_rounding_mode` — **Phase C** |
| מסך-בן "הגדרות כספים לספקים" → לשונית "ניכוי מס במקור" | `withholding_tax_pct`, `withholding_tax_valid_until` (קיים), חסר: `tax_file_number`, `business_classification` | **Phase C** |
| מסך-בן "פרטי חשבון הבנק" | `erp_md_supplier_bank_accounts` (קיים) | UI חסר — **Phase D** |
| "לוג שינויים" (generic) | אין | **Phase F** |
| "לוג שינויים לפרטי חש. בנק" | טבלה `erp_supplier_bank_account_change_log` קיימת (fk company_id ב-schema) | UI חסר — **Phase D** |
| "ספק מזדמן" + "שינוי שם" | חסרים דגלים `is_casual`, `allow_name_override` | **Phase E** |
| "ספק חסוי" | חסר דגל `is_confidential` | **Phase A** |
| "הדפסות באנגלית" | חסר דגל `prints_in_english` | **Phase A** |
| "סוג ספק" enum | `supplier_type` (enum קיים: STANDARD + …) | קיים — אולי להרחיב |
| "סניף" (branch) | חסר `branch_id` | **Phase A — nullable FK ל-`erp_md_branches` אם קיים, אחרת text זמני** |
| "תחום עיסוק" / "שנת הקמה" / "מס' עובדים" | חסר `industry`, `founding_year`, `employee_count` | **Phase A** |
| מסך-בן "אנשי קשר" + דגלי quote/invoice | `erp_md_supplier_contacts` קיים; דגלים חסרים | **Phase B** |
| "ספק שהוא גם לקוח" (העתקת אנשי קשר) | חסר `linked_customer_id` + העתקת contacts | **Phase A (column) + Phase B (copy logic)** |
| תבניות מספור / `IdentCustAcc` / ניהול תהליכים | — | מעבר ל-scope של Phase A-D. **לא מתוכנן כרגע**. |

---

## 2. Schema Delta (Phase A — additive, non-breaking)

מיגרציה יחידה: `supabase/migrations/YYYYMMDDHHMMSS_supplier_card_priority_parity.sql`.

### `erp_md_suppliers` — עמודות חדשות

```sql
alter table public.erp_md_suppliers
  -- סטטוס ברירת מחדל "פעיל" (SOP §1)
  add column if not exists status text not null default 'ACTIVE',
  -- דגלים בלשונית "פרטים נוספים"
  add column if not exists prints_in_english boolean not null default false,
  add column if not exists is_confidential    boolean not null default false,
  add column if not exists is_casual          boolean not null default false,
  add column if not exists allow_name_override boolean not null default false,
  -- enrichment
  add column if not exists industry text,
  add column if not exists founding_year integer,
  add column if not exists employee_count integer,
  -- branch (שלב A — text זמני; אם תיווצר טבלת branches נעבור ל-FK)
  add column if not exists branch_code text,
  -- linkage "ספק שהוא גם לקוח"
  add column if not exists linked_customer_id uuid,
  -- status check
  add constraint if not exists erp_md_suppliers_status_chk
    check (status in ('ACTIVE','INACTIVE','BLOCKED','PENDING'));
```

### בעיה חוצה: NOT NULLs חסרים ב-POST
העמודות `tax_id`, `vat_code` מוגדרות `NOT NULL` ללא `DEFAULT`. ה-POST
handler הקיים לא שולח אותן → כל יצירת ספק נכשלת. שתי אופציות:

1. **ריכוך (מומלץ למיגרציה זו)**: הוספת `DEFAULT ''` + הרפיית ה-check
   `_nonempty` לכדי `(length(trim(coalesce(x,'')))>=0)` לא — זה שובר את
   התפיסה. עדיף:
2. **מילוי ב-API**: ה-POST תמיד ישלח ערכי ברירת מחדל תקינים
   (`tax_id='לא הוזן'`, `vat_code='STANDARD'`) כאשר הטופס לא מספק
   אותם. זה משקף את זרימת Priority שבה הערכים האלה "ניתנים להשלמה
   מאוחר יותר".

→ **מאומץ**: אופציה 2 (API-side defaulting). אין שינוי סכמה נוסף.

### `erp_md_supplier_contacts` — דגלים (Phase B)

```sql
alter table public.erp_md_supplier_contacts
  add column if not exists is_quote_contact   boolean not null default false,
  add column if not exists is_invoice_contact boolean not null default false;
```

### דחייה ל-Phase C

```sql
alter table public.erp_md_suppliers
  add column if not exists general_discount_pct numeric(6,3),
  add column if not exists price_rounding_mode  text,   -- 'NONE'|'UP'|'DOWN'|'NEAREST'
  add column if not exists credit_account       text,
  add column if not exists purchases_account    text,
  add column if not exists tax_file_number      text,
  add column if not exists business_classification text;
```

### דחייה ל-Phase D

UI בלבד על `erp_md_supplier_bank_accounts` + `erp_supplier_bank_account_change_log`.

### דחייה ל-Phase F

טבלת audit log גנרית (ייתכן וכבר קיימת כ-`erp_ai_audit_log` או אחרת).

---

## 3. API Delta

### Phase A
- `POST /api/master-data/suppliers` (קיים — `suppliers-logic.ts`) —
  מרחיב body schema לקלוט:
  - `foreignName`, `address`, `phone`, `email` (קיים)
  - `supplierType`, `branchCode`, `status`, `industry`,
    `foundingYear`, `employeeCount`, `printsInEnglish`, `isConfidential`,
    `isCasual`, `allowNameOverride`, `linkedCustomerId` — **חדש**
  - Zod v4 schema מלא (לא sanitizeOptionalString manual).
  - ממלא `tax_id`, `vat_code` ב-defaults אם לא סופקו.
- `PUT /api/master-data/suppliers/[id]` (קיים) — מרחיב כנ"ל.

### Phase B+
- `PATCH /api/master-data/suppliers/[id]/contacts/[contactId]` — flags.
- `POST /api/master-data/suppliers/[id]/copy-from-customer` — Phase A/B.

---

## 4. UI Delta

### Phase A — יצירת ספק
- `/marker-ofek/procurement/suppliers/new/page.tsx` — Server Component wrapper.
- `NewSupplierForm` (client) — RHF + zod, 4 טאבים תואמי SOP:
  1. **פרטי זיהוי** — שם / שם לועזי / מס' ספק / סוג ספק / status / קישור ללקוח.
  2. **כתובת וטלפון** — address / phone / email.
  3. **פרטים נוספים** — branch / industry / founding_year / employee_count + 4 checkboxes.
  4. **כספים** — payment_terms + currency + tax_vat_id.
- Submit → `POST /api/master-data/suppliers` → redirect ל-`/procurement/suppliers?selected=<id>`.
- `SuppliersListScaffold`: 2 הכפתורים הישנים (`"/marker-ofek/entities/new"`) → `"/marker-ofek/procurement/suppliers/new"`.

### Phase B
- `SupplierDetailsTab` — הצגת השדות החדשים (flags + enrichment).
- `SupplierContactsTab` — דגלי quote/invoice עם checkboxes אדיטביליים.
- כפתור "העתקה מלקוח" (אם קיים `linked_customer_id`).

### Phase C
- טאב חדש: **כספים / ניכוי מס** (או קיפול לטאב פרטים).

### Phase D
- טאב חדש: **חשבונות בנק** (CRUD + history).

### Phase E
- honoring `allow_name_override` ב-UI של PO / invoice creation.

### Phase F
- טאב חדש: **לוג שינויים** (read-only).

---

## 5. פאזות — סדר ביצוע

- **Phase A** (עכשיו): הסרת 404 על יצירת ספק + schema delta + API delta + UI form. ערך עסקי: *אפשר ליצור ספקים שוב*.
- **Phase B**: contact flags + העתקה מלקוח + הצגת שדות חדשים בטאב פרטים.
- **Phase C**: הגדרות כספים מלאות (הנחה כללית, עיגול, חשבונות). ניכוי מס מלא.
- **Phase D**: UI לחשבונות בנק + change log של בנק.
- **Phase E**: ספק מזדמן — כיבוד `allow_name_override` ב-PO/invoice.
- **Phase F**: audit log כללי לספק.

---

## 6. Deferred / לא מתוכנן

- תבניות מספור (`VE3-00001-03`) + `IdentCustAcc` — דורש schema של sequence-per-pattern. דחייה ל-Phase הרבה אחרי Phase F.
- ניהול תהליכים לספקים (סטטוסים דינמיים + מעברים) — scope של BPM engine. לא לפני רוחב פעולות PO/GR/VI דומה.
- "ספק שהוא גם לקוח" full semantics (קישור דו-כיווני לחשבונות הנה"ח) — Phase C+D.
