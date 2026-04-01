# חוברת הדרכה — מרקר אופק (Marker Ofek) ו-Smart Building OS

מסמך זה מרכז את מה שצוות הפיתוח והתפעול צריכים לדעת: התקנה, מסד נתונים, בדיקות, CI, רכש וקליטת AI, וקיצורי דרך תפעוליים.

---

## 1. מבוא

- **האפליקציה**: Next.js (App Router) + Supabase + מודול עסקי «מרקר אופק» (חוזים, רכש, פיננסים, קליטת מסמכים).
- **מיקום קוד ה-SQL**: קבצי `marker_ofek*.sql` בשורש הפרויקט `smart-building-os` — יש להריץ ב-Supabase (SQL Editor / מיגרציות) לפי הסדר המומלץ בסעיף 4.

---

## 2. דרישות והתקנה מקומית

| דרישה | הערות |
|--------|--------|
| Node.js | מומלץ 20+ או 22 (תואם ל-CI) |
| npm | `npm ci` אחרי שיבוט |

```bash
cd smart-building-os
npm ci
npm run dev
```

פקודות נוספות:

| פקודה | משמעות |
|--------|---------|
| `npm run build` | בניית production |
| `npm run lint` | ESLint |
| `npm run test` | בדיקות יחידה (Vitest) |
| `npm run test:watch` | בדיקות במצב watch |

---

## 3. משתני סביבה

צרו קובץ `.env.local` (לא ב-Git) לפחות עם:

- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` — מ-Supabase Project Settings.
- `GEMINI_API_KEY` — לנתיב `/api/ocr-invoice` (קליטת מסמכים ב-AI).

אל תעלו סודות למאגר. ב-GitHub Actions הגדירו Secrets והתאימו את `.github/workflows/ci.yml` במידת הצורך.

---

## 4. סדר מומלץ להרצת קבצי SQL

ההיגיון: סכימות יסוד → רכש → קליטות ספק → Shadow Catalog → הרחבות ושלמות נתונים.

**שכבה א — ליבה וחוזים**

1. `marker_ofek_contracts_schema.sql` — ישויות, פרויקטים, חוזים (דורש `profiles` / משתמשים מהסכימה הבסיסית של האפליקציה).

**שכבה ב — רכש ומבנה עסקי**

2. `marker_ofek_procurement.sql` — הזמנות, קטלוג פריטים וכו' (אחרי חוזים).

**שכבה ג — חשבונות חלקיים**

3. `marker_ofek_partial_accounts_schema.sql` — תלוי ב-`contracts`.

**שכבה ד — קליטת חשבוניות ספק (AI / OCR)**

4. `marker_ofek_supplier_invoice_imports.sql` — טבלאות כותרת ושורות קליטה.  
5. `marker_ofek_supplier_invoice_import_lines_procurement_intel.sql` — עמודות מק״ט, שמות, יחידת מידה.  
6. `marker_ofek_shadow_catalog.sql` — `mo_categories`, קטלוג מאסטר/ספק, מטא-דאטה לקליטה.  
7. `marker_ofek_supplier_invoice_needs_admin_classification.sql` — סימון שורות לסיווג אדמין + RLS לפי הצורך.

**שכבה ה — שלמות, הערות, מודולים נוספים**

8. `marker_ofek_data_integrity.sql` — מחיקה רכה, רצפים (אחרי חוזים, רכש, partial accounts).  
9. `marker_ofek_comments.sql` — הערות הקשר (`project_comments`).  
10. `marker_ofek_ai_invoices.sql` — שדות דינמיים / חשבוניות מרכזות (לפי הערות הקובץ: תלות ברכש וב־finance/data_integrity).  
11. שאר הקבצים לפי הצורך העסקי: `marker_ofek_finance.sql`, `marker_ofek_smart_billing.sql`, `marker_ofek_tax_compliance.sql`, `marker_ofek_schedule.sql`, `marker_ofek_goods_receipt_items.sql`, `marker_ofek_supplier_items.sql`, `marker_ofek_contract_line_kinds.sql`, `marker_ofek_procurement_logistics_aging.sql`, `marker_ofek_quality_sprint.sql`.

> **חשוב:** קראו את כותרת כל קובץ (`Depends on` / `Apply after`) לפני הרצה בסביבה קיימת. אם טבלה כבר קיימת בגרסה אחרת, ייתכן צורך בהתאמה ידנית (ראו הערות ב-`marker_ofek_ai_invoices.sql`).

---

## 5. קליטת מסמכי ספק (AI)

- **מסך**: `/marker-ofek/procurement/ai-import`
- **API**: `POST /api/ocr-invoice` (multipart, שדה `file`) — דורש `GEMINI_API_KEY`.
- **קטגוריות בקוד**: `lib/marker-ofek/procurement-categories.ts` — חייבות להתאים ל-seed ב-`mo_categories` ב-SQL.

### הרשאות (תקציר)

- **אדמין**: שמירה מלאה כולל יצירת מאסטר וקטלוג ספק.
- **מנהל נכס (`property_manager`)**: שמירת קליטה; שורות שדורשות מאסטר חדש עשויות להיסמן `needs_admin_classification` ומק״ט זמני — לפי לוגיקת `actions.ts`.

---

## 6. מפת המערכת (Roadmap חי)

- **מסך:** `/marker-ofek/system-map` — עץ WBS 0–7, סטטוסים (פעיל / בפיתוח / מתוכנן) ואחוז השלמה.
- **נתונים:** `lib/marker-ofek/system-map-data.ts` — עדכון סטטוסים וצמתים במקום אחד.

## 7. קיצור F2 (Drill-Down / הקמת מאסטר)

- במסכי קליטה ובמודאל Copilot: **F2** פותח מסך עזר ב**לשונית חדשה** (לא מאבדים טיוטת OCR).
- נתיבים:
  - `/marker-ofek/projects/setup` — הקמת פרויקט (מסך עזר; ניתן להרחיב).
  - `/marker-ofek/procurement/categories-setup` — הסבר והפניה לניהול קטגוריות.
- לוגיקה ורשימת כתובות מורשות: `lib/marker-ofek/drill-down-f2.ts` (מניעת פתיחת URL שרירותי).

---

## 8. בדיקות אוטומטיות

פרויקט Vitest עם קבצי `*.test.ts` (למשל `lib/format-error.test.ts`, `lib/marker-ofek/drill-down-f2.test.ts`).

```bash
npm run test
```

מומלץ להרחיב בדיקות לפונקציות עזר קריטיות ולפarsers לפני שינויי סכימה גדולים.

---

## 9. CI (GitHub Actions)

קובץ: `.github/workflows/ci.yml`

שלבים: `npm ci` → `lint` → `tsc` → `test` → `build`.

- אם **שורש המאגר** הוא תיקייה אחת מעל `smart-building-os`, יש להעתיק/להתאים את ה-workflow עם `defaults.run.working-directory: smart-building-os` או להריץ CI מתוך מאגר ששורשו הוא `smart-building-os`.
- אם הבנייה נכשלת בגלל משתני סביבה — הוסיפו Secrets ב-GitHub (Supabase, וכו') והגדירו אותם בצעד `Build`.

---

## 10. גיבוי ותיעוד

- **קוד**: גיבוי ZIP/ענף Git; אופציונלי `git bundle` לשמירת היסטוריה.
- **מסד**: גיבוי דרך Supabase (לפי תוכנית הפרויקט).

---

## 11. פתרון תקלות נפוצות

| תסמין | כיוון בדיקה |
|--------|-------------|
| שמירת קליטה נכשלת עם הודעה על Shadow Catalog | הורצה `marker_ofek_shadow_catalog.sql`? |
| חסרות עמודות בשורות קליטה | הורצו `marker_ofek_supplier_invoice_import_lines_procurement_intel.sql` ו-`needs_admin_classification` לפי הצורך |
| OCR מחזיר 503 | חסר `GEMINI_API_KEY` בשרת |
| מסך פיננס מרכזי / centralized | הודעות שגיאה מפנות ל-`marker_ofek_ai_invoices.sql` כשחסרות טבלאות |
| ESLint אזהרות TanStack Table | ידועות עם React Compiler; לא חוסמות build |

---

## 12. קישורים פנימיים בקוד

| נושא | מיקום |
|------|--------|
| תובנות ארכיטקטורה ERP | `lib/marker-ofek/erp-evolution-insights.ts` |
| נירמול שגיאות UI | `lib/format-error.ts` |
| קטגוריות רכש | `lib/marker-ofek/procurement-categories.ts` |

---

*עודכן כחלק מיישום המלצות: בדיקות, CI, ניקוי lint, דפי F2, ותיעוד מרוכז.*
