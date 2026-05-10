# Lihtman Onboarding Playbook

**Customer:** מרקר אופק / לייטמן (`company_id = 'marker_ofek'`)
**Owner of this doc:** [שמך כאן] · **Last updated:** 2026-05-10
**Sprint:** 0 / Day 3 — produced as part of `docs/production/readiness-audit-2026-05-10.md`.

> **מטרה:** להפוך את לייטמן ללקוח המשלם הראשון של מרקר אופק ERP בתוך 6-10
> שבועות מחתימת ה-DPA. המסמך הזה הוא ה-**checklist המבצעי** — 30 צעדים
> מקובצים ל-5 שלבים. כל צעד עם **תוצר ברור**, **בעלים** (Lihtman / Cascade /
> אנחנו), ו-**קריטריון השלמה**.

---

## Phase Map

| Phase | שם | משך מצטבר | חוסם הבא |
|---|---|---|---|
| **A** | משפט ומסחר (Pre-contract) | יום 0–7 | חתימה על DPA + SLA |
| **B** | Tenant provisioning | יום 8–10 | סביבה חיה של לייטמן באוויר |
| **C** | ייבוא נתונים מ-Priority | יום 11–32 | רקונסיליציה ירוקה |
| **D** | הדרכה ו-UAT | יום 33–53 | חתימה על UAT signoff |
| **E** | Go-live ומעקב | יום 54+ | 90 יום של hyper-care |

**Total estimated effort:** 6-10 שבועות (תלוי איכות ה-export מ-Priority + זמינות
ה-Champion של לייטמן).

---

## Phase A — משפט ומסחר (5 צעדים, יום 0–7)

### Step 1 — DPA חתום
- **בעלים:** [אנחנו] · **תוצר:** PDF חתום בשני הצדדים.
- **תבנית:** §A.DPA-Template בסוף המסמך. מבוסס על חוק הגנת הפרטיות
  התשמ"א-1981 (תיקון 13/2017).
- **קריטריון:** חתימה דיגיטלית של מנכ"ל לייטמן + נציגנו.
- **חוסם:** **כל** העברת נתונים אישיים (מיילים, טלפונים, ת.ז של עובדים) חסומה
  עד שיש DPA.

### Step 2 — הסכם שירות + SLA
- **בעלים:** [אנחנו] · **תוצר:** PDF חתום.
- **תוכן מינימלי:**
  - מודל תשלום (אצלי הצעה: ₪3,500/חודש למשתמש פעיל ראשון, ₪1,200 לכל נוסף;
    seat-based, חודשי, עם הגבלת no-cost-cancellation 12 חודש).
  - SLA: זמינות 99.5%, תגובה ל-P1 בתוך 4 שעות בימי עסקים, P2 בתוך 24 שעות.
  - תקופת on-boarding: 8 שבועות חינם.
- **קריטריון:** חתום + תאריך תחילת חיוב נקבע.

### Step 3 — Champion + 2 Backups
- **בעלים:** [Lihtman] · **תוצר:** רשימת 3 משתמשים עם תפקיד ומייל.
- **המלצות:**
  - 1× Champion ראשי — בכיר עם סמכות ארגונית (CFO / מנהל תפעול).
  - 1× Power user — מי שיודע את Priority הכי טוב (לרוב מהנהלת חשבונות או רכש).
  - 1× IT contact — אדם טכני שיכול להעביר exports / לדבר על credentials.
- **קריטריון:** שלושת המיילים מתועדים ב-`docs/customer/lihtman-contacts.md`.

### Step 4 — אישור גרסת Priority + יצוא
- **בעלים:** [Lihtman IT] · **תוצר:** מסמך קצר עם:
  - גרסת Priority (לרוב 19/20/21).
  - האם ל-Lihtman יש Priority Web Services / iAPI / Tabula מודול ייצוא.
  - האם הם משתמשים בלוגיקה מותאמת (custom forms / triggers) שדורשת mapping
    מיוחד.
- **קריטריון:** התשובה ל-3 השאלות תועדה. **מסוכן ביותר אם אין יצוא חוקי.**

### Step 5 — Kickoff מתוזמן
- **בעלים:** [שותפים] · **תוצר:** פגישת Zoom של 90 דק' ביומן עם:
  - אנחנו (Cascade owner + שותף עסקי).
  - שלושת אנשי הקשר מ-Step 3.
- **אג'נדה:** סיור מערכת חי, הצגת ה-onboarding plan, תיאום ציפיות לוחות זמנים,
  מענה על שאלות.
- **קריטריון:** Notes בפגישה + פעולות (action items) במייל סיכום.

---

## Phase B — Tenant Provisioning (6 צעדים, יום 8–10)

### Step 6 — Supabase Production Project
- **בעלים:** [אנחנו] · **תוצר:** פרויקט Supabase חדש ב-`eu-central-1` (Frankfurt).
- **שם פרויקט:** `marker-ofek-prod`. שונה לחלוטין מ-staging.
- **שמירה:**
  - URL ל-1Password / Vault ארגוני: `MARKER_OFEK_PROD_SUPABASE_URL`
  - service-role + anon keys ב-Vault.
- **קריטריון:** פרויקט פעיל, אזור Frankfurt מאומת ב-Settings → General.

### Step 7 — החלת כל המיגרציות
```powershell
# מחשב מקומי, ענף main מעודכן
$env:SUPABASE_DB_URL = "<production-DB-URL-from-Vault>"
npx supabase db push --db-url $env:SUPABASE_DB_URL --include-all
```
- **תוצר:** כל ~140 המיגרציות מ-`supabase/migrations/` הוחלו.
- **קריטריון:** `npx supabase migration list --db-url $env:SUPABASE_DB_URL` מציג
  את כל הקבצים כ-applied. אין ERROR.

### Step 8 — ניקוי נתוני דמו
**חשוב:** המיגרציה `20260822100000_purge_demo_seed_data.sql` היא **opt-in** —
לא רצה בלי GUC מפורש. הפעלה ידנית:

```sql
-- ב-Supabase SQL Editor של פרויקט הפרודקשן
set local app.purge_demo_data = 'on';

-- העתיקו את גוף ה-DO block מ-supabase/migrations/20260822100000_purge_demo_seed_data.sql
do $$
declare
  v_purge boolean;
  -- … (העתק/הדבק את הגוף המלא)
end
$$;
```

- **תוצר:** הצגת `notice: 'Demo seed data purged ...'` ב-output.
- **אימות:** הריצו ולא יחזיר rows:
  ```sql
  select id from public.erp_subcontractor_contracts
   where id = 'c0700000-0000-4000-8000-cccccccccccc';  -- ↑ צריך 0 rows.
  ```

### Step 9 — ה-Lihtman company row + יוזרים
ה-row של `marker_ofek` נוצר אוטומטית ע"י המיגרציה. נשאר רק:

```sql
-- 9a. עדכון השם החזותי (אם רוצים שיופיע "לייטמן" ולא "מרקר אופק" ב-UI)
update public.erp_companies
   set name_he = 'לייטמן',
       name_en = 'Lihtman'
 where id = 'marker_ofek';

-- 9b. הזמנת המשתמשים — דרך Supabase Auth (UI או admin API)
--     נוצרים rows ב-auth.users. שיטה מועדפת: Magic-Link דרך
--     https://supabase.com/dashboard/project/<ref>/auth/users → "Invite user"
--     (3 הזמנות: Champion, Power user, IT contact)

-- 9c. אחרי שהם השלימו signup, מחברים אותם לחברה:
insert into public.erp_user_company_memberships (user_id, company_id, role, is_active)
values
  ('<champion-uuid-from-auth.users>',  'marker_ofek', 'admin',   true),
  ('<power-user-uuid>',                'marker_ofek', 'finance', true),
  ('<it-contact-uuid>',                'marker_ofek', 'admin',   true)
on conflict (user_id, company_id) do update
   set role = excluded.role,
       is_active = excluded.is_active;
```

- **תוצר:** 3 שורות ב-`erp_user_company_memberships` עם `is_active = true`.
- **קריטריון:** כל אחד מה-3 יכול להיכנס ולראות `/marker-ofek/dashboard` ללא 403.

### Step 10 — משתני סביבה לפרודקשן
- **תוצר:** `.env.production` (לא ב-git!) מבוסס על `@/.env.example`.
- **חובה למלא:**
  - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
    `SUPABASE_SERVICE_ROLE_KEY` — מ-Step 6.
  - `NEXT_PUBLIC_SITE_URL` = ה-domain (לדוגמה `https://app.lihtman.co.il`).
  - `NEXT_PUBLIC_DEMO_MODE` — **השאירו ריק או "false"** (אסור "true"!).
  - `NEXT_PUBLIC_SENTRY_DSN` — אחרי יצירת פרויקט Sentry בשם
    `marker-ofek-prod` (`SENTRY_PROJECT=marker-ofek-prod`).
  - `RESEND_API_KEY` או `POSTMARK_SERVER_TOKEN` — אחד מהם, לפי בחירת הספק.
- **קריטריון:** רשימת 23 משתני env ב-`.env.example` סוקרה אחת-אחת ולכל אחד יש
  או ערך או הסבר מפורש למה לא רלוונטי.

### Step 11 — Deploy ל-Vercel/Render
- **המלצה:** Vercel — פלטפורמה מקורית של Next.js, source-maps של Sentry
  אוטומטיים, edge runtime עובד מיידי.
- **תהליך:**
  1. צרו פרויקט Vercel חדש בשם `marker-ofek-prod`.
  2. חברו ל-repo ב-GitHub, branch `main`.
  3. הזינו את כל משתני env מ-Step 10 (`Settings → Environment Variables`,
     scope = "Production").
  4. הגדירו domain מותאם (לרוב לייטמן יספקו subdomain כמו
     `erp.lihtman.co.il`).
  5. בצעו deploy ידני ראשון, וודאו ירוק.
- **קריטריון:** `https://erp.lihtman.co.il/login` נטען, ה-Champion מצליח
  להיכנס ולראות dashboard ריק.

---

## Phase C — ייבוא נתונים מ-Priority (8 צעדים, יום 11–32)

> **חוסם #1 מה-audit.** ⚠️ לפני Step 12, **חובה** לבנות את ה-importer הגנרי
> (`@app/(dashboard)/admin/import/`) — Sprint 1, 2-3 שבועות. הצעדים למטה
> מניחים שה-importer קיים. אם הוא לא קיים בעת הקריאה, חזרו ל-Sprint 1
> תחילה.

### Step 12 — מיפוי שדות (Data-Mapping Spec)
- **בעלים:** [אנחנו] · **תוצר:**
  `docs/customer/lihtman-data-mapping.md` — טבלה לכל אחת מ-8 הישויות.
- **סטטוס Sprint 1 (10/05/2026):** 6 מתוך 8 ה-importers נבנו ב-Sprint 1 Steps 1-2
  ופעילים ב-`@app/(dashboard)/admin/import/`. 2 ישויות חסומות בהמתנה לסכימת DB.

| # | Priority Source | Marker-Ofek Target | סטטוס Importer |
|---|---|---|---|
| 1 | `SUPPLIERS` | `public.erp_md_suppliers` | ✅ Sprint 1 / Step 1 |
| 2 | (משפחות מוצר — נגזר מ-LOGPART) | `public.erp_md_product_families` | ✅ Sprint 1 / Step 2 |
| 3 | `LOGPART` (פריטים) | `public.erp_md_items` | ✅ Sprint 1 / Step 2 |
| 4 | `PROJECTS` | `public.erp_proj_projects` | ✅ Sprint 1 / Step 2 |
| 5 | חוזי קבלן משנה (תיק נייר) | `public.erp_subcontractor_contracts` | ✅ Sprint 1 / Step 2 (header) |
| 6 | `ORDERS` (POs פתוחים) | `public.erp_purchase_orders` | ✅ Sprint 1 / Step 2 (header) |
| 7 | `ACCOUNTS` (חשבונות) | `public.erp_gl_accounts` | ✅ Sprint 1 / Step 4 (היררכי) |
| 8 | יתרות פתיחה | `public.erp_gl_journal_entries` + `_lines` | ✅ Sprint 1 / Step 4 (auto D/C, balance check) |

**Note on lines:** ה-importers של חוזים ו-POs מטפלים רק ב-header. שורות BOQ
ושורות PO ייובאו בסבבי ייבוא נפרדים ב-Sprint 2 (תלויים ב-importer של resource
catalog שעדיין לא קיים).

### Step 13 — ייצוא Master Suppliers
- **בעלים:** [Lihtman IT] · **תוצר:** `lihtman-suppliers-export.xlsx`.
- **שיטה:** Priority → SUPPLIERS form → Tabula export → Excel.
  (אם אין Tabula, סקריפט iAPI שלייטמן מריצים ושולחים לנו את ה-CSV.)
- **קריטריון:** קובץ עם לפחות `SUPNAME`, `SUPDES`, `VATNUM`, `BANKACCOUNT`,
  `PHONE`, `EMAIL`, `ADDRESS`. ספירת שורות = ספירת ספקים פעילים בלייטמן.

### Step 14 — ייבוא Suppliers
- **שיטה:** העלאה ל-`/admin/import` → entity = "suppliers" → mapping wizard
  → dry-run → import.
- **תוצר:** N שורות ב-`erp_md_suppliers` עם `company_id = 'marker_ofek'`.
- **קריטריון:** דוח רקונסיליציה (`X imported / Y errored / Z skipped`) ירוק
  ב-≥98%. בודקים ידנית 5 ספקים אקראיים.

### Steps 15–18 — חזרה על אותו דפוס לכל אחד מ:
- **15.** Items / מק"טים (~אלפי שורות, צופה כי החריגה הגדולה).
- **16.** Chart of Accounts (~200-500 שורות).
- **17.** פרויקטים פעילים (~10-50 שורות).
- **18.** POs פתוחים (~20-200 שורות, רק לא-סגורים).
- **בעלים:** [אנחנו + Lihtman IT].
- **תוצר לכל ישות:** דוח רקונסיליציה.
- **קריטריון לכולם:** ≥98% הצלחה. הניתן ל-error יורד ל-issue tracker עם תיקון
  ידני בקובץ ה-import.

### Step 19 — Reconciliation Report סופי
- **בעלים:** [אנחנו] · **תוצר:**
  `docs/customer/lihtman-import-reconciliation-<date>.md`.
- **תוכן:**
  - לכל 8 הישויות: שורה אחת עם count_priority / count_imported / delta /
    notes.
  - סיכום עם סך-כל ה-deltas ובקשת signoff מה-Champion.
- **קריטריון:** Champion חתם מייל "ראיתי, מאושר".

---

## Phase D — הדרכה ו-UAT (6 צעדים, יום 33–53)

### Step 20 — הדרכה: צוות רכש
- **בעלים:** [אנחנו] · **משך:** סדנא של 3 שעות + הקלטה.
- **תוכן:**
  - יצירת PO חדש (RFQ → quotation → PO approval).
  - Goods Receipt + Vendor Invoice + 3-Way Match.
  - תרחיש "סטיית מחיר" (override + alert ל-`PRICE_OVERRIDE_ALERT_WEBHOOK_URL`).
- **תוצר:** Recording + 1-pager של 5 הקיצורים החשובים.
- **קריטריון:** 2 מרשי הצוות מצליחים בעצמם לעשות PO end-to-end ללא עזרה.

### Step 21 — הדרכה: צוות הנהלת חשבונות
- **בעלים:** [אנחנו] · **משך:** סדנא של 3 שעות.
- **תוכן:**
  - חשבונות חלקיים של קבלני משנה (חוזה → חשבון → אישור → תשלום).
  - Journal entries (double-entry, מיפוי לחשבון GL).
  - Receipts + bank reconciliation.
- **תוצר:** Recording + cheat-sheet.
- **קריטריון:** רואה החשבון של לייטמן מצליח לבצע "סוף חודש לדוגמה" על נתוני
  ה-import ב-≤30 דק'.

### Step 22 — הדרכה: מנהלי פרויקט
- **בעלים:** [אנחנו] · **משך:** 2 שעות.
- **תוכן:** Gantt (CPM, baselines, dependencies), DMS (העלאת תכניות), דוחות
  שטח (Daily logs / Manpower).
- **תוצר:** Recording.
- **קריטריון:** מנהל פרויקט פעיל מצליח לפתוח Gantt חדש לפרויקט אמיתי שלו
  ולשייך משימות לקבלנים.

### Step 23 — UAT מקביל (Parallel run, שבועיים)
- **שיטה:** במשך **2 שבועות מלאים**, לייטמן מבצעים **כפול** — גם ב-Priority
  כרגיל, **וגם** ב-Marker-Ofek במקביל. כל יום בסוף יום השוואה.
- **בעלים:** [Lihtman + אנחנו].
- **תוצר:** טבלת השוואה יומית של 5 KPIs:
  1. סה"כ POs שנכנסו ב-2 המערכות.
  2. סה"כ חשבוניות ספק שאושרו.
  3. יתרת בנק בסוף יום.
  4. חריגות 3-way match.
  5. כל יום שיש פער > ₪0 → root cause + תיקון.
- **קריטריון:** 5 ימי עסקים רצופים עם פער = ₪0 בכל KPI.

### Step 24 — UAT Signoff
- **בעלים:** [Lihtman Champion] · **תוצר:** מייל חתום:

  > "אנו, לייטמן בע"מ, מאשרים בזאת כי ה-UAT שבוצע בתאריכים [X..Y] עבר
  > בהצלחה. אנו מוכנים ל-Cut-over בתאריך [Z]."

- **קריטריון:** המייל מתויק ב-Vault + תאריך Cut-over מקובע.

### Step 25 — Cut-over Plan
- **בעלים:** [אנחנו + Lihtman] · **תוצר:** `cutover-runbook.md` עם:
  - שעת freeze של Priority (מומלץ: יום ה' 17:00).
  - יצוא final delta (מה שנוסף ל-Priority בין Step 14 ל-cut-over).
  - Import של ה-delta ל-Marker-Ofek.
  - אימות: 0-pending POs, 0-unposted journals.
  - Go-live: יום א' 06:00 — לייטמן עוברים לעבודה במערכת.
- **קריטריון:** Runbook מאושר ע"י שני הצדדים, with rollback plan לכל צעד.

---

## Phase E — Go-live ו-Hyper-Care (5 צעדים, יום 54+)

### Step 26 — Cut-over
- **בעלים:** [אנחנו] · **משך:** סוף שבוע אחד.
- **קריטריון:** ב-יום א' 09:00 — Champion דיווח ש"הצוות מקליד POs במערכת
  החדשה, נראה חלק".

### Step 27 — Daily Standup (שבועיים)
- **משך:** 15 דק', יומי, בשבועיים הראשונים.
- **תוכן:** מה עבד, מה נתקע, P1 issues.
- **בעלים:** [אנחנו] (driving) + Champion.
- **קריטריון:** 0 P1 פתוחים יותר מ-24 שעות.

### Step 28 — Weekly Review (6 שבועות)
- **משך:** 30 דק' שבועי, אחרי השבועיים הראשונים.
- **תוכן:** דוחות שימוש (DAU, transactions/day, error rate ב-Sentry).
- **בעלים:** [אנחנו].
- **קריטריון:** trend חיובי (DAU עולה, error rate יורד).

### Step 29 — מעבר ל-Steady-State Support
- **תאריך:** יום 90 מ-Cut-over.
- **תוצר:** הסכם תמיכה רגיל (לפי ה-SLA מ-Step 2).
- **קריטריון:** Champion מאשר במייל "אפשר להוריד הילוך".

### Step 30 — Post-mortem ב-90 יום
- **בעלים:** [אנחנו] · **תוצר:** `docs/customer/lihtman-90day-postmortem.md`.
- **תוכן:**
  - מה עבד, מה כשל, מה שיפצנו במהלך.
  - 3 הלקחים החשובים לקראת הלקוח הבא.
  - גובה ה-MRR בפועל אחרי 90 יום מול תחזית.
- **קריטריון:** המסמך פורסם פנימית. שני הלקחים החשובים נכנסים ל-roadmap של
  Sprint 2.

---

## §A.DPA-Template

> **הסכם עיבוד נתונים (Data Processing Agreement)**
>
> **בין:** לייטמן בע"מ (להלן "בעל הנתונים").
> **לבין:** [שם החברה שלנו] בע"מ (להלן "המעבד").
> **תאריך:** [DD/MM/YYYY].

### 1. הגדרות
- **"נתונים אישיים"** — כהגדרתם בחוק הגנת הפרטיות התשמ"א-1981.
- **"עיבוד"** — כל פעולה הנעשית בנתונים, לרבות איסוף, אחסון, שינוי, מסירה,
  ומחיקה.

### 2. היקף השירות
המעבד יספק לבעל הנתונים שירותי SaaS לניהול ERP (רכש, פיננסים, פרויקטים).
לצורך מתן השירות, המעבד יעבד נתונים אישיים של עובדי ובאי-כוח בעל הנתונים
(שם, מייל, טלפון, ת.ז במקרים מסוימים).

### 3. סודיות ואבטחת מידע
- המעבד מתחייב לאבטח את הנתונים ברמת הצפנה ב-TLS 1.3 ב-transit וב-AES-256
  ב-rest.
- גישה לנתונים מוגבלת לעובדי המעבד שחייבים אותה לצורך השירות, תחת התחייבות
  לסודיות.
- המעבד מנהל RLS (Row-Level Security) ב-DB כך שכל שאילתה של משתמש נחסמת
  אוטומטית לחברה שאליה הוא משויך.

### 4. מיקום הנתונים
הנתונים יאוחסנו בשרתי Supabase ב-`eu-central-1` (פרנקפורט, גרמניה). העברת
הנתונים מחוץ לישראל מתבצעת על בסיס Adequacy decision של רשות הגנת הפרטיות
הישראלית בנוגע לאיחוד האירופי.

### 5. תקופה ומחיקה
עם סיום ההסכם, המעבד מתחייב למחוק את כל הנתונים בתוך 30 יום, או להעביר אותם
לבעל הנתונים בפורמט בחירתו (CSV/Excel/SQL dump). אישור המחיקה יישלח בכתב.

### 6. אירועי אבטחה
המעבד יודיע לבעל הנתונים בתוך **24 שעות** מהזיהוי של כל אירוע אבטחה שיש לו
פוטנציאל לפגוע בנתונים.

### 7. עיבוד-משנה
המעבד מעסיק את ספקי המשנה הבאים: Supabase Inc. (אחסון), Vercel Inc. (hosting),
Sentry (error monitoring). שינוי ברשימה יעודכן בכתב מראש.

### 8. דיני המקום ושיפוט
ההסכם כפוף לחוקי מדינת ישראל. סמכות שיפוט: בית המשפט המוסמך בתל-אביב.

**חתימה צד 1 (לייטמן):** _________________ **תאריך:** _______
**חתימה צד 2 (אנחנו):**     _________________ **תאריך:** _______

---

## §B.Quick-Reference SQL — Lihtman provisioning

עותק מלא של ה-SQL מ-Step 9, ל-paste מהיר ב-Supabase SQL Editor:

```sql
-- 1) ודא שהחברה רשומה (היא רשומה אוטומטית ע"י המיגרציה — זה idempotent)
insert into public.erp_companies (id, name_he, name_en)
values ('marker_ofek', 'לייטמן', 'Lihtman')
on conflict (id) do update
   set name_he    = excluded.name_he,
       name_en    = excluded.name_en,
       updated_at = now();

-- 2) הזמן את 3 המשתמשים דרך ה-Auth dashboard (מחוץ ל-SQL).
--    כשהם השלימו signup, הריצו את הבא עם ה-UUIDs שלהם:
insert into public.erp_user_company_memberships
       (user_id,                                company_id,    role,      is_active)
values ('00000000-0000-0000-0000-000000000001', 'marker_ofek', 'admin',   true),  -- Champion
       ('00000000-0000-0000-0000-000000000002', 'marker_ofek', 'finance', true),  -- Power user
       ('00000000-0000-0000-0000-000000000003', 'marker_ofek', 'admin',   true)   -- IT contact
on conflict (user_id, company_id) do update
   set role      = excluded.role,
       is_active = excluded.is_active,
       updated_at = now();

-- 3) אימות גישה (להריץ אחרי שה-Champion עשה login):
select user_id, role, is_active
  from public.erp_user_company_memberships
 where company_id = 'marker_ofek';
-- צריך להחזיר 3 שורות, כולן is_active=true.
```

---

## §C.Open Decisions

| # | שאלה | מי מחליט | Deadline |
|---|---|---|---|
| 1 | מודל תשלום סופי (₪/seat/חודש) | שותפים | Step 2 |
| 2 | האם משאירים `company_id = 'marker_ofek'` או משנים ל-`'lihtman'` | שותפים + Lihtman | Step 9 |
| 3 | Resend או Postmark לטרנזקציונל | DevOps | Step 10 |
| 4 | Domain סופי (`erp.lihtman.co.il`?) | Lihtman IT | Step 11 |
| 5 | מי בונה את ה-importer הגנרי (Sprint 1) | אנחנו | לפני Step 12 |

---

## Sprint 1 — מה לעבוד עליו אחרי Day 3

לפי ה-audit `@docs/production/readiness-audit-2026-05-10.md`, אחרי השלמת
Sprint 0:

1. **Generic CSV importer at `app/(dashboard)/admin/import/`** — חוסם את Phase C.
   ETA: 2-3 שבועות.
2. **Auth/onboarding polish** — Step 9c לא קיים כ-flow ב-UI. דורש דף
   `/admin/users` לניהול חברי חברה.
3. **Production observability stack** — pg_cron jobs יומיים (backup verify,
   stale jobs sweep), 5 alerts ב-Sentry, runbook.
4. **`docs/customer/lihtman-data-mapping.md`** — לא נכתב ב-Day 3 כי דורש
   דוגמת-export אמיתית מלייטמן (Step 4 בגוף הplaybook).
5. **Legal docs**: Privacy Policy + ToS פומביים בעברית.
