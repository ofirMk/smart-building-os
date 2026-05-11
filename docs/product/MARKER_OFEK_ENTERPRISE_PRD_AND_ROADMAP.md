# Marker-Ofek — Enterprise ERP PRD & Roadmap

> **Status:** Draft v1.0 · 2026-05-09
> **Owner:** Product & Engineering Leadership
> **Audience:** Board / VC Deep-Dive · Engineering Leads · First Enterprise Customer
> **Document type:** Product Requirements Document + Gap Analysis + Go-To-Market Roadmap
> **Companion artifacts:**
> - `@c:\Users\user\Desktop\smart-building-os\docs\architecture\project-dms-architecture-2026-05-07.md` — DMS HLD (approved)
> - `@c:\Users\user\Desktop\smart-building-os\docs\integrations\pdf-intelligence-engine-plan.md` — PDF Intelligence pipeline
> - Supabase migrations at `@c:\Users\user\Desktop\smart-building-os\supabase\migrations\` (ground truth)

---

## תוכן עניינים

1. **Executive Summary**
2. **פרק 1 — תמונת מצב: The Baseline & Moat**
3. **פרק 2 — Gap Analysis לתשעה תחומי ליבה**
4. **פרק 3 — UX/UI רוחבי וארכיטקטורה גלובלית**
5. **פרק 4 — Go-To-Market Roadmap (Phases 1-3) ו-MVP boundary**
6. **נספח — אבני בוחן (Acceptance Criteria) ל-MVP**

---

## Executive Summary

Marker-Ofek נבנית להיות ה-ERP הראשון ש-**AI-native** מקצה לקצה לתעשיית הבנייה — תחליף ל-stack המפוצל (Priority + Excels + Procore + WhatsApp) במערכת אחת דטרמיניסטית שכל החלטה בה ניתנת לביקורת. המערכת נמצאת כיום ב-**שלב של ליבה טכנולוגית מוכחת**: ה-moats העמוקים ביותר — מנוע רכש דטרמיניסטי מבוסס AI, 3-Way Match עובד, DMS multi-tenant עם immutability קריפטוגרפי, ו-Command Center הנהלתי — כולם committed, deployed ו-demonstrable. העבודה שנותרה היא **רוחב** ולא עומק: סגירת הלולאה התפעולית עם workflow שטח, סגירה פיננסית (תשלומים / GL / Bank Recon / Cash Flow), ו-edge cases שהופכים demo מרשים למערכת רישום יומיומית של חברת בנייה בת 500 עובדים.

המסמך הזה מכמת את הפער במדויק. **פרק 1** ממפה את החפיר הקיים ("מה שכבר יש שלמתחרים ייקח שנים לשחזר"). **פרק 2** מנתח 9 דומיינים עסקיים עם דיוק כירורגי — ברמת DB, לוגיקה, אינטגרציות ו-UX. **פרק 3** עוסק ב-cross-cutting concerns. **פרק 4** מתרגם הכל ל-Roadmap מדורג עם MVP boundary ברור ללקוח הראשון המשלם.

**שלושת הפערים הקריטיים** שחוסמים enterprise production מוצגים מראש (ומפורטים ב-§4):

1. **סגירה פיננסית מקצה לקצה** — היעדר תשלומים (מס"ב/צ'קים), פקודות יומן, כרטסות והתאמות בנק. בלי זה ה-3-Way Match הוא מבוי סתום: מאתר variances אבל לא יכול "לסגור" חודש פיננסי. **חוסם CFO buy-in.**
2. **חוזי קבלן משנה ואישור חשבונות חלקיים** — עמוד שדרה של ביצוע פרויקט בנייה. קיימים tender→contract pipeline בסיסי + progress_reports schema, חסר: תוספות/חריגים מובנים, עיכבונות (retention), קיזוזים, ו-UI לאישור מצטבר. **חוסם project execution buy-in.**
3. **חווית שטח (Field App) בעברית RTL** — כל ה-flows הקיימים אינם mobile-first. מנהל עבודה אינו יכול ליצור דרישת רכש, לקלוט תעודת משלוח, או לפתוח ליקוי בדק מהשטח. **חוסם adoption ב-day-1**, כי בלי שטח אין נתונים — ובלי נתונים ה-AI לא חי.

נקודת המוצא לפיתוח ב-12 שבועות הקרובים מתואר בפרק 4 כ-"Phase 1 — Enterprise MVP".

---

## פרק 1 — The Baseline & Moat

### 1.1 העקרונות המנחים שעיצבו את הליבה

ארבעה עקרונות מנחים — שאומצו במודע מההתחלה — מסבירים מדוע ה-baseline שווה הרבה מהר ממוצרים שנראים דומים:

**P1 — Multi-tenant by construction.** כל טבלה (`erp_*`, `proc_*`, `pbc_*`, `dms_*`, `mo_*`) מחזיקה `company_id`. כל שאילתה עוברת דרך `requireMasterDataApiContext` שאוכף membership ב-`erp_user_company_memberships`, או דרך RLS policy שמאומתת על `user_has_company_access(company_id)`. ה-cookie `x-active-company-id` הוא ה-source-of-truth לסשן הנוכחי. **המשמעות:** SaaS שלוקח לקוח שני אינו דורש fork — רק הקצאה.

**P2 — AI proposes, human approves, audit log records.** אין החלטה אוטונומית של AI שמשנה state פיננסי. ה-CEO Approval Gate על PO (ראה `@c:\Users\user\Desktop\smart-building-os\supabase\migrations\20260401130000_po_ceo_approval_and_violations.sql` ו-`20260801180000_po_approval_engine.sql`) מאלץ אישור אנושי על חריגות תקציב, וכל פעולה (כולל של agents) נרשמת ב-audit log. **המשמעות:** auditor חיצוני יכול לשחזר כל החלטה — דרישת compliance בסיסית בלקוח Enterprise.

**P3 — Deterministic primitives, AI חוטף-חלום.** AI מציע (vision על שרטוט → BOQ draft, OCR על חשבונית → match ל-PO), אבל ה-state נשמר בטבלאות עם constraints, FKs ו-RLS. ה-AI יכול לחזור אחורה (ל-snapshot ישן), לשחזר, להחליף proposal — ה-state עצמו immutable. **המשמעות:** מתחרה שעושה "AI ERP" עם state ב-vector store בלבד — מאבד audit trail, RBAC ו-deterministic queries. אנחנו לא.

**P4 — Defense in depth.** API route → Postgres RLS → Storage policy. כל שכבה מחזיקה את אותה החלטת אבטחה (לדוגמה, ה-DMS מחשב `dms_effective_permissions(document_id, user_id)` ב-3 השכבות). **המשמעות:** אין single point of failure שמטה את כל המערכת.

### 1.2 ה-Moats הקיימים — what's already shipped

#### M1 — Procurement Engine (Deterministic + AI-Augmented)

**הוכחת קיום (file references):**
- `@c:\Users\user\Desktop\smart-building-os\app\actions\procurement.ts` — Server Action ליצירת PO עם validation מלא (Zod, FK בודק BOQ↔project↔company), כתיבה אטומית של header + lines.
- `@c:\Users\user\Desktop\smart-building-os\app\api\procurement\purchase-orders\route.ts` — API REST.
- `@c:\Users\user\Desktop\smart-building-os\app\api\procurement\goods-receipt\route.ts` — קליטת סחורה עם RPC אטומי `erp_complete_goods_receipt` שמחשב rollup על quantity received ו-status PO (PARTIALLY/FULLY).
- `@c:\Users\user\Desktop\smart-building-os\app\api\procurement\autonomous-po\chat\route.ts` — AI Copilot שמייצר PO drafts מתוך grounding context (פרויקטים, ספקים, BOQ assemblies, locations) + tool-calling דטרמיניסטי.
- `@c:\Users\user\Desktop\smart-building-os\supabase\migrations\20260330120000_po_from_tender.sql` — pipeline להפיכת מכרז זוכה ל-PO.
- `@c:\Users\user\Desktop\smart-building-os\supabase\migrations\20260801180000_po_approval_engine.sql` — מנוע אישורי PO עם רמות, כפי שהוגדר ב-`po_approval_skeleton`.
- `@c:\Users\user\Desktop\smart-building-os\supabase\migrations\20260807120000_po_payment_terms_priority_seed.sql` — תנאי תשלום ו-priority.

**מה זה אומר עסקית:** אנשי רכש מייצרים PO — ידנית, או דרך copilot שמסביר את עצמו ("הצעתי 50 שקי מלט לפי החלוקה ב-shop drawing P-04, ב-₪34/שק לפי המחירון של דקל"). אין PO שעוקף תקציב בלי אישור CEO. כל variation בכמות בקליטה מתועדת.

**Moat strength: ⭐⭐⭐⭐⭐.** מתחרה ישראלי (Priority/Hashavshevet) מציע PO מודול אבל ללא AI grounding ובוודאי ללא vision-to-BOQ. מתחרה אמריקאי (Procore) מציע vision חלקי אך לא בעברית, לא עם BOQ ישראלי וללא דקל.

#### M2 — Vision & Drawing Intelligence (Autodesk APS preparation)

**הוכחת קיום:**
- `@c:\Users\user\Desktop\smart-building-os\app\api\procurement\autonomous-po\chat\route.ts` כבר מקבל uploads של PDFs ו-images ומריץ vision (gpt-4o) לזיהוי שורות PO מ-shop drawings.
- `@c:\Users\user\Desktop\smart-building-os\docs\integrations\pdf-intelligence-engine-plan.md` — תוכנית מקיפה ל-pipeline אחיד של "PDF → ERP entity" שתואמת doc-types רבים (drawings, GR notes, invoices, contracts).
- `@c:\Users\user\Desktop\smart-building-os\lib\marker-ofek\contract-vault\gemini-contract-ingest.ts` (מוזכר ב-`vault-actions.ts`) — extraction + embedding של חוזי PDF.
- `@c:\Users\user\Desktop\smart-building-os\supabase\migrations\20260815100000_user_integrations_schema.sql` — schema ל-OAuth tokens (כולל הכנה ל-Autodesk APS).

**הכנה ל-Autodesk APS:** הסכימה תומכת בקבלת tokens חיצוניים, ויש מודל data שמפריד "מקור החיצוני" מ-"ה-state הפנימי" (entity_links polymorphic). חיבור לאמת לאינדקסים של APS דורש 2-3 שבועות עבודה — לא 6 חודשים.

**מה זה אומר עסקית:** מהנדס מעלה shop drawing → AI מציג אילו פריטים זוהו, באילו שורות, וההתאמה ל-BOQ לפני יצירת PO. הזמן מ-"קיבלתי שרטוט מאדריכל" ל-"PO מאושר" קצר ב-80%.

**Moat strength: ⭐⭐⭐⭐.** ה-pipeline המוצע במסמך PDF Intelligence הוא **הוליסטי** (לא pipeline-per-document-type), וזה היתרון. מתחרים בונים פיצ'רים נקודתיים; אנחנו בונים תשתית אחת.

#### M3 — 3-Way Match (Financial Reconciliation)

**הוכחת קיום:**
- `@c:\Users\user\Desktop\smart-building-os\supabase\migrations\20260805120000_3way_match_foundation.sql` — הפונקציה `erp_perform_3way_match(p_invoice_id)` מבצעת אטומית: אימות הרשאה (`user_has_company_access`), ניקוי matches קיימים (idempotency), בנייה מחדש של match-by-line דרך JOIN על `erp_purchase_order_lines` + `erp_goods_receipt_lines`, סיווג לכל שורה (`PERFECT` / `QTY_VARIANCE` / `PRICE_VARIANCE` / `MIXED_VARIANCE`), ועדכון סטטוס header ל-`MATCHED` או `HAS_VARIANCES`. **כיבוד מצבי SOX:** לא נוגע ב-`APPROVED` או `READY_FOR_PAYMENT`.
- `@c:\Users\user\Desktop\smart-building-os\app\api\finance\invoices\pending-match\route.ts` — UI workbench ל-AP עם aggregations.
- `@c:\Users\user\Desktop\smart-building-os\app\api\procurement\orders\[id]\invoices\route.ts` — Master/Detail על PO ↔ חשבוניות.

**ספי סובלנות מוגדרים:** 0.001 לכמות, 0.005 (חצי אגורה) למחיר יחידה. לא משחקים — קוד fixed-point arithmetic.

**מה זה אומר עסקית:** AP יושב מול workbench אחד שמראה כל החשבוניות הפתוחות, מסווגות אוטומטית: "5 PERFECT (לאישור click)", "3 QTY_VARIANCE (Δ ₪12,400 — ספק חייב להוציא חשבונית זיכוי)", "2 PRICE_VARIANCE (Δ ₪880 — דרוש אישור CFO)". במקום שעות בדיקה ידנית — 15 דקות של החלטות.

**Moat strength: ⭐⭐⭐⭐⭐.** זה שילוב של אטומיות DB-grade, שכבה עסקית מדויקת, ו-UI מותאם. בנייה מאפס דורשת 6-12 חודשים. **זהו אחד מ-3 ה-moats הכי עמוקים.**

#### M4 — CEO Command Center

**הוכחת קיום:**
- `@c:\Users\user\Desktop\smart-building-os\app\(dashboard)\marker-ofek\pitch\page.tsx` + `@c:\Users\user\Desktop\smart-building-os\components\marker-ofek\pitch\investor-command-center.tsx` — מסך executive עם live audio visualizer, AI Copilot drawer (file uploads, image/PDF previews), ו-system-themed UI.
- `@c:\Users\user\Desktop\smart-building-os\components\marker-ofek\pitch\investor-pitch-lobby.tsx` — lobby שמרכז אינדיקטורים אסטרטגיים.
- `@c:\Users\user\Desktop\smart-building-os\components\marker-ofek\pitch\monetization-showcase.tsx` — תצוגת KPIs פיננסיים מותאמת theme tokens.
- `@c:\Users\user\Desktop\smart-building-os\app\(dashboard)\marker-ofek\my-day\page.tsx` — דף "My Day" עם Agenda, Smart Inbox ו-AI Assistant.
- `@c:\Users\user\Desktop\smart-building-os\lib\audio-sfx.ts` — Web Audio API synthesizer ל-feedback קולי בלי קבצי wav.

**מה זה אומר עסקית:** המנכ"ל פותח ב-7:30 AM את ה-app, רואה: 7 PO ממתינים לאישורו (כולם מעל סף תקציב), 2 חריגות יומיות, 3 פגישות חשובות (כשיהיה Microsoft Graph integration), AI Copilot שמסכם את הלילה. **הוא לא צריך לפתוח Excel.**

**Moat strength: ⭐⭐⭐.** UX-driven — קל יחסית לשחזר אבל קשה ל-Tier 1 ERP מסורתי כי ה-data model שלהם לא תומך בזה.

#### M5 — DMS / Document Vaults (Phase C)

**הוכחת קיום:**
- `@c:\Users\user\Desktop\smart-building-os\supabase\migrations\20260815120000_dms_phase_c1_foundations.sql` — 8 טבלאות, 11 enums, RLS policies מלא, הפונקציה `dms_effective_permissions` כ-single source of truth.
- `@c:\Users\user\Desktop\smart-building-os\supabase\migrations\20260815140000_dms_phase_c1c_storage_policies.sql` — Storage policies שתואמות בדיוק את ה-DB ACL (defense in depth).
- `@c:\Users\user\Desktop\smart-building-os\app\(dashboard)\marker-ofek\dms\[projectId]\page.tsx` + `@c:\Users\user\Desktop\smart-building-os\components\marker-ofek\dms\dms-browser.tsx` + `@c:\Users\user\Desktop\smart-building-os\components\marker-ofek\dms\upload-dialog.tsx` — UI מלא: folder tree, document list, upload עם hash client-side, signed URLs להורדה, audit log על כל פעולה.
- `@c:\Users\user\Desktop\smart-building-os\docs\architecture\project-dms-architecture-2026-05-07.md` — HLD מאושר עם 8 החלטות (D1-D8).

**Cryptographic immutability:** triggers חוסמים UPDATE/DELETE על `dms_audit_log`; חוסמים שינוי על immutable columns של `dms_document_versions`. מונה גרסה monotonic מובטח דרך `pg_advisory_xact_lock`.

**מה זה אומר עסקית:** עו"ד הלקוח שואל "מי הוריד את החוזה הזה ב-15 בנובמבר?" — תשובה ב-2 שניות מ-`dms_audit_log` עם actor, timestamp, IP. עומד בדרישות GDPR לפי design.

**Moat strength: ⭐⭐⭐⭐.** ה-immutability + audit + ACL hybrid (RBAC + ABAC + templates) הם enterprise-grade שלא קיים ב-Procore/Buildertrend.

#### M6 — Tendering Platform (חיים אבל ב-Phase 1)

**הוכחת קיום:**
- `@c:\Users\user\Desktop\smart-building-os\supabase\migrations\20260327120000_marker_ofek_tender_intake.sql` — קבלת מכרזים (vendor side).
- `@c:\Users\user\Desktop\smart-building-os\supabase\migrations\20260412120000_tender_module.sql` — ליבה.
- `@c:\Users\user\Desktop\smart-building-os\supabase\migrations\20260413120000_tender_win_contract_pipeline.sql` — pipeline מ-tender win לחוזה.
- `@c:\Users\user\Desktop\smart-building-os\supabase\migrations\20260415120000_dekel_search_priority_and_tender_multiplier.sql` — חיפוש דקל לתמחור מכרזים.
- `@c:\Users\user\Desktop\smart-building-os\supabase\migrations\20260328160000_tender_documents_storage_bucket.sql` — bucket ייעודי.

**מה זה אומר עסקית:** מנהל מכרזים יכול ליצור מכרז, להעלות BOQ, לתמחר עם דקל. **חסר:** הפצה לקבלני משנה דרך magic-link, רישום הצעות חוזרות, Bid Leveling אוטומטי. ראה §2.6.

**Moat strength: ⭐⭐⭐.** הבסיס שווה — תמחור דקל הוא moat ישראלי-ספציפי שמתחרה אמריקאי לעולם לא יבנה.

#### M7 — Project Hub & Gantt Enterprise

**הוכחת קיום:**
- 8+ migrations של Gantt: `gantt_tasks_foundation`, `gantt_tasks_enterprise_upgrade`, `gantt_tasks_resources_cost_baseline_tracking`, `gantt_task_notes_and_snapshots`, `multi_gantt_gantts_table`, `gantt_resource_engine`, `gantt_backend_infra_alignment`, `tasks_derivative_gantt`.
- `@c:\Users\user\Desktop\smart-building-os\supabase\migrations\20260513130000_mo_field_ops_floor_gantt_grouping.sql` — grouping per floor (ייחודי לבנייה).
- `@c:\Users\user\Desktop\smart-building-os\supabase\migrations\20260327190000_daily_logs.sql` — יומני עבודה.
- `@c:\Users\user\Desktop\smart-building-os\supabase\migrations\20260327200000_project_progress_reports.sql` + 3 migrations נוספות (financials, baseline, submitted_report_date) — דוחות התקדמות עם פיננסים.

**מה זה אומר עסקית:** Gantt ברמת enterprise (resources, costs, baseline tracking, snapshots, multi-gantt) — לא חלק מ-MVP פשטני. **חסר UI:** drag-and-drop אינטראקטיבי, חיבור פעיל בין task → PO → progress report. ראה §2.3.

**Moat strength: ⭐⭐⭐⭐.** ה-data model הוא אחד הכי מתוחכמים שראיתי לבנייה. ה-UI הוא הפער.

#### M8 — Resident Change Orders (Foundation)

**הוכחת קיום:**
- `@c:\Users\user\Desktop\smart-building-os\supabase\migrations\20260627163000_change_orders_ui_engine.sql`
- `@c:\Users\user\Desktop\smart-building-os\supabase\migrations\20260627180000_change_order_bpm_lock_policy.sql`
- `@c:\Users\user\Desktop\smart-building-os\supabase\migrations\20260627193000_change_orders_price_ceiling_manager_gate.sql`
- `@c:\Users\user\Desktop\smart-building-os\supabase\migrations\20260628120100_price_ceiling_approval_workflow.sql`

**מה זה אומר עסקית:** השינויים מנוהלים עם BPM lock + ceiling approval. **חסר:** מחירוני דייר, סנכרון אוטומטי לרכש/ביצוע. ראה §2.7.

#### M9 — Cashflow Forecast (Foundation)

**הוכחת קיום:**
- `@c:\Users\user\Desktop\smart-building-os\supabase\migrations\20260630110000_erp_cashflow_forecast_and_bill_dates.sql`

**מה זה אומר עסקית:** יש model לתחזיות תזרים. **חסר:** בנק (התאמות), GL, פקודות יומן, כרטסות. ראה §2.4 — הפער הקריטי.

### 1.3 חפיר טכנולוגי vs ERP מסורתי

| ממד | Marker-Ofek | ERP מסורתי (Priority/Hashavshevet) | Procore / Buildertrend |
|---|---|---|---|
| **AI Native** | grounding context + tool-calling דטרמיניסטי, vision על drawings/invoices | bolt-on chatbot מאוחר | חלקי, לא RTL |
| **Audit Trail** | immutable audit log פר ישות, RLS-aware, GDPR-ready | מוגבל לטרנזקציות פיננסיות | לוקלי, לא DB-grade |
| **Multi-Tenant** | RLS + cookie + memberships + audit per company | תלוי deployment | SaaS אבל schema אחיד |
| **Hebrew/RTL** | ברירת מחדל, מבנה תיקיות SYSTEM בעברית | חלקי (Priority) | אין |
| **Construction-Specific** | BOQ, דקל, change orders עם ceiling, gantt-per-floor | generic ERP מותאם | construction native |
| **Open Architecture** | Postgres + RLS + Storage policies — סטנדרטים פתוחים | Oracle/MS-SQL לא ניתן להוצאה | proprietary |
| **Time to First Value** | demo עובד היום | 6-12 חודשים implementation | 3-6 חודשים onboarding |

### 1.4 תרגום ה-moat לדירקטוריון

החפיר העמוק לא בפיצ'ר אחד אלא ב-**שילוב של 5 שכבות:**

1. **שכבת data** — schema רב-טבלאית עם FKs בריאים, RLS פר טבלה, enums מוקפדים, triggers ל-immutability ול-rollups.
2. **שכבת logic** — RPCs אטומיים (3-Way Match, GR completion) שמבטיחים consistency גם תחת concurrency.
3. **שכבת AI** — grounding deterministic + tool-calling שלא משנה state ישירות אלא דרך user approval.
4. **שכבת UX** — RTL Hebrew בנוי מ-day 1, theme tokens, command palette, drawers, recent tabs.
5. **שכבת compliance** — audit log universal, RLS company isolation, signed URLs, MFA-ready.

**Time-to-replicate estimate:** מתחרה שמתחיל היום צריך 18-24 חודשים + צוות של 8-12 מהנדסים כדי להגיע לליבה הזו, ועוד 12 חודשים להגיע ל-feature parity. אנחנו מקדימים אותם ב-30-36 חודשים אפקטיבית, ובכל יום שעובר התקדמות שלהם איטית כי הם בונים על stack לגאסי.

---

## פרק 2 — Gap Analysis לתשעה תחומי ליבה

> **Methodology.** עבור כל דומיין: (א) **מטרה עסקית** — מה הלקוח מצפה לעשות. (ב) **DB / לוגיקה חסרה** — שדות, טבלאות, RPCs, constraints, triggers. (ג) **The Golden Thread** — חיבורים נכנסים/יוצאים למודולים אחרים. (ד) **UX/UI** — מה המשתמש רואה ואיך הוא פועל.

---

### 2.1 ניהול רכש ומלאי (Procurement & Inventory)

**(א) מטרה עסקית.** הזרמה מלאה מ"מנהל עבודה צריך 80 שקי מלט מחר ב-7:00" עד "החשבונית של הספק מאושרת לתשלום", **ללא צאן עזרא של Excel ב-WhatsApp.** לרבות: דרישות רכש מהשטח (PR), מחירונים וקטלוגים מנוהלים, תעודות משלוח (GR) עם חתימה, החזרות (Return-to-Vendor), ומלאי מחסני אתר (site warehouses).

**(ב) DB / לוגיקה חסרה.**

*קיים:* `erp_purchase_orders`, `erp_purchase_order_lines`, `erp_goods_receipts`, `erp_goods_receipt_lines`, `erp_vendor_invoices`, `erp_invoice_po_line_matches`, `procurement_catalog_*` tables (ראה `@c:\Users\user\Desktop\smart-building-os\app\(dashboard)\marker-ofek\procurement\catalog\page.tsx`), payment terms.

*חסר:*

1. **Purchase Requisitions (PR) — דרישת רכש מובנית.**
   - חסרה טבלה: `proc_purchase_requisitions` (id, company_id, project_id, requested_by, urgency, requested_for_date, status `DRAFT|SUBMITTED|APPROVED|CONVERTED|REJECTED`, justification, photos[]).
   - שורות: `proc_purchase_requisition_lines` (description, quantity, unit, boq_node_id?, target_location_id, attached_drawing?).
   - לוגיקה: RPC `proc_convert_pr_to_po(p_pr_ids[], p_supplier_id)` שמאחד מספר PRs ל-PO אחד עם traceability.
   - workflow: PR נדחה → ל-mailbox של מנהל פרויקט; PR מאושר → לרכש; PR converted → 1:N קשר ל-PO lines.

2. **מחירונים / Vendor Catalogs.**
   - קיים `procurement_catalog_*` (קטלוג ספק יחיד / Marker-Ofek?). חסר: קישור per-supplier-per-project עם תוקף תאריכים, תנאי הסכם (rebates, volume discounts), ו-validity period.
   - חסרה טבלה: `proc_supplier_price_lists` (id, company_id, supplier_id, project_id?, valid_from, valid_until, source `MANUAL|DEKEL_API|SCANNED_PDF`, currency, file_id דרך DMS).
   - חסרה: `proc_supplier_price_list_lines` (sku, description, unit, unit_price, min_quantity, lead_time_days, last_updated).
   - לוגיקה: בעת יצירת PO line, lookup ל-active price list לפי (supplier, project, item) — ואזהרה אם המחיר ב-PO סוטה > X% מ-list.

3. **Goods Receipt enhancements.**
   - חסרה: חתימה דיגיטלית של מקבל (`signed_by_user_id`, `signature_image_id` ב-DMS).
   - חסר: photos[] של הסחורה בעת קליטה (חיבור ל-DMS עם kind=`GR_PHOTO`).
   - חסרה: מצבי partial GR מתוחכמים — `over_received_quantity` עם business rule (חסום או דורש אישור).
   - חסר: GR-from-mobile (PWA) עם barcode scanning.

4. **Returns to Vendor (RTV).**
   - חסרה לחלוטין: `proc_returns` + `proc_return_lines`. סטטוסים: `DRAFT|PENDING_VENDOR_APPROVAL|SHIPPED_BACK|CREDITED`.
   - לוגיקה: RTV → יוצר Credit Memo (חשבונית זיכוי צפויה) → 3-Way Match בעת הגעת הזיכוי בפועל.
   - השפעה על מלאי: מקטין `inventory_on_hand`.

5. **Inventory Management — מלאי אתר ומחסנים.**
   - חסרה לחלוטין: `inv_warehouses` (per project, או central), `inv_locations` (within warehouse), `inv_stock_movements` (issue, transfer, adjust, GR-in, RTV-out).
   - חסרה view: `inv_stock_on_hand` (item × warehouse × location → quantity).
   - לוגיקה: GR (`erp_goods_receipt_lines`) → אוטומטית מייצר `inv_stock_movement` של type `GR_IN`. Issue לקבלן → `STOCK_ISSUE`.
   - Cycle count + adjustments עם audit.

**(ג) The Golden Thread.**
- **PR → PO** (1:N consolidation).
- **PO → GR → Vendor Invoice → 3-Way Match → AP Payment → GL** (כבר קיים עד 3-Way Match; חסר מ-AP Payment והלאה — ראה §2.4).
- **PR / PO line → BOQ node** (קיים) → **Project task / Gantt activity** (חסר חיבור פעיל — ראה §2.3).
- **PO → Subcontractor contract** (חסר — ראה §2.2).
- **Site warehouse Inventory ← GR; Inventory → Issue to subcontractor → Progress claim deduction** (חסר לחלוטין).

**(ד) UX/UI.**

1. **Field-side PR creator (mobile-first PWA):**
   - "+ דרישת רכש חדשה" מתוך mobile.
   - בחירת project (auto-selected from project context), description text, attach photo from camera, requested-by-date, urgency (1-5).
   - submit → push לאיש רכש.
   - status tracking: "ממתין לאישור" → "הומר ל-PO #1234" → "ב-GR" → "התקבל".

2. **Procurement Workbench (desktop):**
   - 3-pane: PR queue (lefט) | PO drafts | Active POs.
   - drag PRs → "create PO" צרף לאותו ספק.
   - cell-level edit על PO lines.

3. **Mobile GR App:**
   - "סורק BAR-CODE → מזהה PO line → מחייג כמות → חתימה → תמונה → submit".

4. **Inventory Dashboard:**
   - היטמפ של מחסנים: מה נמצא איפה, איפה shortage, מה stale (>30 ימים).

---

### 2.2 פרויקטים, חוזים וחשבונות קבלן (Subcontractor Contracts & Progress Billing)

**(א) מטרה עסקית.** הליבה התפעולית של חברת בנייה. ניהול חוזים עם קבלני משנה — **פאושלי (lump sum)** או **כתב כמויות (BOQ-based)** — כולל ניהול מצטבר של תוספות, חריגים, **עיכבונות (retention)**, **קיזוזים (back-charges)**, וחשבונות חלקיים מצטברים. זה התחום שבו 90% מסכסוכי החוזים מתרחשים — וכל חברת בנייה זוכרת לקוח ש"איבד 2 מיליון בגלל אקסל לא מעודכן".

**(ב) DB / לוגיקה חסרה.**

*קיים:* `tender_win_contract_pipeline` (יוצר contract object בסיסי), `project_progress_reports` עם `_financials`, `_baseline`, `submitted_report_date` (תכליתם לדיווח התקדמות פנימי).

*חסר (קריטי):*

1. **Subcontractor Contracts — schema מלא.**
   - חסרה: `pbc_subcontractor_contracts` (id, company_id, project_id, subcontractor_id, contract_type `LUMP_SUM|BOQ|UNIT_PRICE|TIME_AND_MATERIAL`, original_value, retention_pct (default 5-10%), retention_release_milestone, currency, signed_date, start_date, planned_end_date, advance_payment_pct, status).
   - חסרה: `pbc_contract_boq_lines` (contract_id, boq_node_id, contracted_quantity, contracted_unit_price, sequence).
   - חסרה: `pbc_contract_amendments` (id, contract_id, type `ADDENDUM|CHANGE_ORDER|EXTRA_WORK|VARIATION`, value, status, justification, approval_chain).

2. **Progress Billing — חשבונות חלקיים מצטברים.**
   - חסרה: `pbc_progress_certificates` (id, contract_id, period_start, period_end, certificate_number sequential, status `DRAFT|SUBMITTED|UNDER_REVIEW|APPROVED|REJECTED|PAID`, submitted_at, approved_at, total_gross, retention_held, retention_released_this_cert, deductions_back_charges, deductions_advance_recovery, vat, net_payable).
   - חסרה: `pbc_progress_certificate_lines` (cert_id, contract_boq_line_id, **cumulative_quantity_completed**, **previous_cumulative_quantity**, **this_period_quantity**, this_period_amount, notes, photos[] via DMS).
   - constraint critical: `this_period_quantity = cumulative - previous_cumulative` נאכף ב-trigger.
   - constraint: `cumulative_quantity_completed <= contracted_quantity * (1 + tolerance_pct)` אחרת חוסם או דורש amendment.

3. **Retention Ledger.**
   - חסרה: `pbc_retention_ledger` per certificate × contract — כמה הוחזק, מתי משוחרר (50% במסירה, 50% בתום בדק לדוגמה).
   - לוגיקה: trigger ב-certificate APPROVED → entry ב-retention ledger.

4. **Back-Charges & Deductions.**
   - חסרה: `pbc_back_charges` (id, contract_id, type `MATERIAL_ISSUED|EQUIPMENT_RENTAL|REWORK|DELAY_PENALTY|UTILITY|OTHER`, amount, source_doc_ref (PO id, GR id), status `PENDING|DEDUCTED|DISPUTED|WAIVED`).
   - לוגיקה: כשמכינים certificate, מערכת מציעה back-charges פתוחים לניכוי.

5. **Lump-Sum Progress Method.**
   - על חוזה lump sum, ההתקדמות לא ב-quantity אלא ב-`percent_complete_per_milestone`. צריך schema של `pbc_lumpsum_milestones` (sequence, description, value, planned_complete_date, actual_complete_date, status).

**(ג) The Golden Thread.**
- **Tender win → Contract creation** (חלקית קיים, צריך הרחבה לכל סוגי החוזה).
- **BOQ → Contract BOQ lines** (חיבור פעיל; שינוי בכמות ב-master BOQ דורש decision: amend contract או לא).
- **Progress Certificate APPROVED → Vendor Invoice creation אוטומטית** (החשבונית של קבלן המשנה היא ה-net_payable של ה-cert).
- **Vendor Invoice → 3-Way Match → AP Payment** (קיים flow).
- **Back-charge from material issued from inventory → automatic deduction proposal**.
- **Resident Change Order accepted → contract amendment proposal** (חיבור לדומיין §2.7).
- **Daily logs / Progress reports → suggested progress quantities** (חיבור לדומיין §2.3 — AI ימליץ "ראינו ביומן עבודה שטחו 230 מ"ר השבוע, האם להוסיף ל-cert?").

**(ד) UX/UI.**

1. **Contract Workspace.**
   - מסך ייעודי per contract: header (subcontractor, value, retention, dates) + tabs: BOQ Lines, Amendments, Progress Certificates, Back-Charges, Documents (DMS-linked), Audit Log.
   - מד התקדמות: "60% completed by value, 12% retention held = ₪240k pending release".

2. **Progress Certificate Builder (CRITICAL UX).**
   - גריד דמוי-Excel: עמודות [BOQ desc | Contracted Qty | Previous Cum | This Period | Cum Now | This Period $].
   - input על "This Period" — או כפתור "AI suggest from daily logs".
   - Validations live (red cells if cumulative > contracted).
   - Footer: gross, retention this period, retention released, back-charges deducted, advance recovery, VAT, **net payable** מודגש.

3. **Subcontractor Portal (Phase 2).**
   - magic-link login לקבלן משנה — submit certificate, view status, attach progress photos.

4. **Contract Dashboard.**
   - per project: list of contracts עם %completed, retention held, paid to date, outstanding.

---

### 2.3 לוחות זמנים ומעקב ביצוע (Schedules & Execution)

**(א) מטרה עסקית.** "לתכנן את הפרויקט ולעקוב שהוא לא יוצא מלוח זמנים — וכשהוא יוצא, לדעת מי, איפה, ולמה." Gantt אינטראקטיבי + יומני עבודה + דוחות התקדמות + קישור לרכש (לדעת אם משלוח התעכב והתעכבה איתה הפעילות).

**(ב) DB / לוגיקה חסרה.**

*קיים (data layer חזק):* 8+ migrations של Gantt — `gantt_tasks_foundation`, `gantt_tasks_enterprise_upgrade`, `gantt_tasks_resources_cost_baseline_tracking`, `multi_gantt_gantts_table`, `gantt_resource_engine`, `gantt_task_notes_and_snapshots`, `mo_field_ops_floor_gantt_grouping`, `daily_logs`, `project_progress_reports*`.

*חסר:*

1. **Drag-and-drop Gantt UI** — קיים data, חסר UI אינטראקטיבי. שינוי תאריך task ב-UI → optimistic update + persistence + rebaseline cascade ל-dependents.

2. **Resource leveling automation.** ה-`gantt_resource_engine` קיים אבל אין UI שמראה conflict (אדם 1 מוקצה ב-200% ב-יום ג'). דרושה view `gantt_resource_overallocations`.

3. **PO ↔ Task linkage (active).**
   - חסרה טבלה: `gantt_task_purchase_links` (task_id, po_line_id, **dependency_type** `MATERIAL_REQUIRED|EQUIPMENT|SERVICE`, blocks_start/blocks_finish).
   - לוגיקה: PO delayed → task at risk → Gantt עדכון אוטומטי + alert.

4. **Daily Logs ↔ Gantt activity active linkage.**
   - חסר: `daily_logs` לא מקושר אופציונלית ל-task. נדרש שדה `task_id` + לוגיקה: יומן → אם מציין quantity completed → AI מציע update ל-task progress + ל-progress certificate (§2.2).

5. **Earned Value Management (EVM).**
   - חסר: PV (Planned Value) / EV (Earned Value) / AC (Actual Cost) views. חישוב SPI (Schedule Performance Index), CPI (Cost Performance Index).
   - חסרה view materialized: `evm_metrics_per_project_per_period`.

6. **Critical Path computation.**
   - חסרה RPC: `gantt_compute_critical_path(project_id)` שמחזיר list of task_ids on critical path. ה-UI יסמן אותם באדום.

**(ג) The Golden Thread.**
- **Gantt task → PO/Material requirement** (חסר חיבור פעיל).
- **Daily log → Task progress → Progress Certificate** (חסר חיבור).
- **Progress Certificate → Project EV** (חסר חיבור).
- **Resident Change Order → New task / extend task** (חסר חיבור).
- **Site weather + photos → Daily log entry** (mobile field app — חסר UI).

**(ד) UX/UI.**

1. **Interactive Gantt** — drag-resize bars, dependency arrows, baseline overlay (ghost bar of original plan), critical path highlighted, resource conflict markers.
2. **Daily Log mobile** — "+ יומן יומי" → אדם, פעילות, כמות, photos, weather auto, tag לפי floor/zone.
3. **Project Cockpit** — מסך single-screen: SPI / CPI gauges, top 5 at-risk tasks, % complete by trade, overdue POs.

---

### 2.4 הנהלת חשבונות מקיפה (Comprehensive Accounting) — **הפער הקריטי**

**(א) מטרה עסקית.** סגירת המעגל הפיננסי. ה-3-Way Match מסיים בנקודה "החשבונית מאושרת לתשלום" — ומשם הלאה: לבצע תשלום (מס"ב / צ'ק / העברה), לרשום פקודת יומן, לעדכן כרטסות (חייבים/זכאים/בנק), לבצע התאמת בנק, ולהפיק דוחות פיננסיים (תזרים, מאזן, רווח-הפסד) **בזמן אמת**, לא בסוף חודש.

**(ב) DB / לוגיקה חסרה.**

*קיים:* `erp_cashflow_forecast_and_bill_dates` — תחזיות בסיסיות. `contracts_progress_reports_gl_account_code` — קישור GL חלקי. payment terms.

*חסר (בעיקר טבלאות חדשות לחלוטין):*

1. **General Ledger (GL) Schema.**
   - חסרה: `gl_accounts` (id, company_id, account_code (chart-of-accounts הישראלי), name_he, name_en, parent_id (hierarchy), type `ASSET|LIABILITY|EQUITY|REVENUE|EXPENSE`, sub_type, is_postable, currency, status).
   - חסרה: `gl_journal_entries` (id, company_id, entry_date, period (YYYY-MM), source `MANUAL|AP|AR|BANK|PAYROLL|PROGRESS_CERT`, reference_doc_type, reference_doc_id, status `DRAFT|POSTED|REVERSED`, posted_by, posted_at).
   - חסרה: `gl_journal_lines` (entry_id, gl_account_id, debit, credit, project_id?, cost_center_id?, description). Constraint: `SUM(debit) = SUM(credit) per entry`.
   - חסרה: `gl_periods` (company_id, period (YYYY-MM), status `OPEN|CLOSED|LOCKED`). Closed period = no posting.

2. **Accounts Payable Payments.**
   - חסרה: `ap_payment_runs` (id, company_id, run_date, payment_method `MASAV|CHECK|WIRE|CREDIT_CARD`, bank_account_id, status `DRAFT|APPROVED|EXECUTED|RECONCILED`, total_amount, reference_number).
   - חסרה: `ap_payments` (run_id?, vendor_invoice_id, amount, payment_date, check_number?, masav_record_id?, status).
   - לוגיקה: APPROVED invoice → eligible for payment run; user/CFO approves run → MASAV file generation (`.001` format ישראלי) → bank confirms → reconciliation.

3. **MASAV (מס"ב) Generation.**
   - שירות שמייצר קובץ TXT/`.001` בפורמט בנק ישראל: header (sender, date, debit account), records (vendor account, amount, reference), trailer (totals).
   - signing + audit trail.

4. **Cheque Management.**
   - חסרה: `bank_cheques` (cheque_book_id, cheque_number sequential, payee_vendor_id, amount, issue_date, due_date, status `ISSUED|CASHED|BOUNCED|VOIDED|STALE`, source_payment_id).
   - cheque book inventory tracking (חסרה: `bank_cheque_books`).

5. **Vendor / Customer Subledgers.**
   - חסרה view: `ap_vendor_open_balance` (vendor × project × aging buckets 0-30 / 31-60 / 61-90 / 90+).
   - חסרה view: `ar_customer_open_balance` (customer × project).
   - חסרה: `ap_vendor_statement` (פירוט חשבוניות, תשלומים, יתרה — לקבלן משנה / ספק).

6. **Bank Reconciliation.**
   - חסרה: `bank_accounts` (company_id, bank_code, branch, account_number, currency, gl_account_id).
   - חסרה: `bank_statements` + `bank_statement_lines` (תאריך, אסמכתא, סכום, תיאור, side `DEBIT|CREDIT`).
   - חסרה: `bank_reconciliations` שמתאימה bank line ↔ AP/AR transaction. AI מציע התאמות (fuzzy match על amount + date + reference).
   - חסרה: import של דפי בנק (CSV/MT940 / Bank API / sweet — שיש בישראל Yodlee-like).

7. **Cash Flow — Real, Not Just Forecast.**
   - קיים `erp_cashflow_forecast`. חסר: actuals view — מה באמת זרם בעבר.
   - חסרה: 13-week rolling cash flow forecast (industry standard). מבוסס על: open AP (paid by due date), open AR (collected by expected date), payroll, progress certificates pending.

**(ג) The Golden Thread.**
- **3-Way Match APPROVED → AP Payment Run candidate** (חסר).
- **AP Payment EXECUTED → GL Journal Entry (Cr Bank, Dr AP) auto-posted** (חסר).
- **Progress Certificate APPROVED → AP Vendor Invoice + GL Entry** (חסר).
- **Bank statement line → matched to AP Payment → Reconciled** (חסר).
- **GL → Project P&L → Project Dashboard** (חסר).
- **Open AR / AP → 13-week Cash Flow** (חסר).
- **Period close → Lock GL → Block edits to historical 3-Way matches** (חסר).

**(ד) UX/UI.**

1. **AP Payment Run Wizard.**
   - "סלק חשבוניות": רשימת invoices APPROVED, group by vendor, total per vendor, choose payment method, generate MASAV file להורדה, mark as EXECUTED.

2. **GL Workbench.**
   - chart of accounts viewer (hierarchy), drill-down to entries → lines → source document.
   - manual JE entry form עם validation balance.

3. **Bank Reconciliation UI.**
   - 2-pane: bank statement (left), system transactions (right). drag-match. AI suggestions עם confidence score.
   - "auto-reconcile" button → reconciles all > 95% confidence matches.

4. **Period Close Checklist.**
   - "סגירת חודש 11/2026": checklist (כל ה-GR נקלטו, כל ה-3-Way משלים, כל ההתאמות סגורות, כל ה-AP שלשלום שולם או מועד) → Lock period button.

5. **Real-time Financial Dashboard.**
   - חודשי: Revenue, COGS, Gross Margin, OpEx, Net Income, Cash Position, AR Aging, AP Aging.

---

### 2.5 תקציב ובקרה (Budget vs. Actual)

**(א) מטרה עסקית.** "האם הפרויקט ירוויח?" בזמן אמת, לא ב-post-mortem. ניהול תקציב מתוכנן (per project / per BOQ chapter / per cost code), השוואה לביצוע מתמשך, תחזית גמר (EAC = Estimate at Completion), והתראות חריגה רוחביות.

**(ב) DB / לוגיקה חסרה.**

*קיים חלקית:* קישור PO → BOQ קיים. CEO approval על PO שחורג מתקציב מובנה (`po_ceo_approval_and_violations`).

*חסר:*

1. **Budget Schema.**
   - חסרה: `budgets` (id, project_id, version_id, type `ORIGINAL|REVISED|FORECAST`, currency, total_value, status `DRAFT|APPROVED|LOCKED`).
   - חסרה: `budget_lines` (budget_id, boq_node_id?, cost_code_id?, planned_quantity, planned_unit_cost, planned_total, contingency_amount).
   - חסרה: `cost_codes` (id, company_id, code, name_he, hierarchy parent — רב פרויקטי).

2. **Actual Cost Tracking.**
   - חסרה view: `project_actuals_by_cost_code` שמסכמת:
     - PO commitments (open POs not yet GR'd)
     - GR receipts (committed cost realized)
     - Vendor invoices approved (true cost)
     - Subcontractor cert approved (subcontract cost)
     - Direct labor (חסר schema לחלוטין)
   - לכל cost_code: planned, committed, actual, variance.

3. **EAC (Estimate at Completion).**
   - לוגיקה: `EAC = Actual to date + (Remaining Budget × CPI⁻¹)` — או scenarios manual.
   - חסר RPC.

4. **Real-time Variance Alerts.**
   - trigger: PO line creation → if cumulative committed > budget × threshold → push notification ל-PM + CEO.

5. **Zero-Based Budget Mode.**
   - חסר: support ל-budget שמתחיל ב-₪0 ויש לאשר כל הוצאה (מצב contracting tight).

**(ג) The Golden Thread.**
- **BOQ → Budget lines** (planning).
- **PO → Committed cost** (real-time consumption).
- **GR/Invoice → Actual cost**.
- **Progress Cert → Subcontract actual**.
- **Variance > threshold → Alert + workflow approval**.
- **EAC → Cash flow forecast** (כי הכסף שיוצא מהפרויקט הוא חלק מתזרים).

**(ד) UX/UI.**

1. **Project Budget Cockpit.**
   - bar chart per cost code: planned (gray) | committed (yellow) | actual (blue/red if over).
   - "תחזית גמר": +12% חריגה צפויה, מסומן אדום.

2. **Drill-down.**
   - click cost code → see all POs, GRs, invoices רלוונטיים.

3. **Cross-Project Portfolio Dashboard.**
   - heatmap: 12 פרויקטים × 8 cost categories → איפה אדום.

---

### 2.6 מכרזים (Tendering)

**(א) מטרה עסקית.** ניהול מכרזים יוצאים — חברת הבנייה שולחת BOQ ל-N קבלני משנה / ספקים, מקבלת הצעות, משווה (Bid Leveling), בוחרת זוכה, ויוצרת חוזה. תהליך שכיום מבוצע ב-Excel + email.

**(ב) DB / לוגיקה חסרה.**

*קיים:* `tender_module`, `tender_win_contract_pipeline`, `marker_ofek_tender_intake`, `tender_documents_storage_bucket`, `dekel_search_priority_and_tender_multiplier`, `mo_tender_document_status_ai_failed`.

*חסר:*

1. **Tender Distribution.**
   - חסרה: `tender_invitations` (tender_id, invitee_subcontractor_id, magic_link_token, sent_at, viewed_at, response_status).
   - חסר: email service ייעודי (דרך Resend) שולח magic link עם expiry.
   - חסרה: portal לקבלן משנה — view tender package, download BOQ + drawings, submit bid.

2. **Bid Submission.**
   - חסרה: `tender_bids` (id, tender_id, subcontractor_id, submitted_at, total_value, validity_period, currency, comments, attachments[] via DMS).
   - חסרה: `tender_bid_lines` (bid_id, boq_node_id, unit_price, total_price, alternate_proposal text).

3. **Bid Leveling (Comparison).**
   - חסרה view: `tender_bid_leveling` — grid: BOQ rows × bidder columns, עם:
     - per-row min / max / avg / median.
     - per-bidder total + ranking.
     - missing items (bidder לא ענה על שורה — חוסר רציני).
     - alternates (הציע פתרון חלופי).
   - לוגיקה: הצעה עם missing items מסומנת אדום.

4. **Award Decision.**
   - workflow: PM ממליץ → procurement מאשר → CEO sign-off (אם > X) → tender_win → contract creation אוטומטית עם הצעת הזוכה כ-baseline.

5. **Audit Trail Critical.**
   - מכרזים הם תחום עם compliance גבוה. חסרה: `tender_audit_log` שמתעד מי ראה איזו הצעה ומתי (sealed bid integrity).

**(ג) The Golden Thread.**
- **BOQ master → Tender package** (קיים בסיס).
- **Tender win → Subcontractor contract** (`pbc_subcontractor_contracts` — חסר schema, ראה §2.2).
- **Tender attachments → DMS** (חיבור).
- **Subcontractor in tender → Subcontractor master** (יש tables קיימים).
- **Dekel pricing → Suggested unit price for evaluation** (קיים `dekel_search_priority`).

**(ד) UX/UI.**

1. **Tender Composer** — wizard: scope → BOQ snapshot → invitees (search + multi-select) → drawings/specs (DMS-link) → schedule (open date, due date, Q&A period) → publish.

2. **Bid Leveling Spreadsheet** — comparison grid עם conditional formatting, "winner per line" highlight, totals + TCO calculator.

3. **Subcontractor Bid Portal** — magic link login, simple bid submission form (Excel-like grid + upload), confirmation email.

---

### 2.7 שינויי דיירים (Resident Change Orders)

**(א) מטרה עסקית.** ב-residential הדייר רוכש דירה ויכול לבקש שינויים: שדרוג ריצוף, הוספת שקעים, החלפת אמבטיה. תהליך שדורש: מחירון דייר רשמי, הצעה ומדידה (זיכוי + חיוב), אישור בכתב חתום, וסנכרון לשטח (קבלן ביצוע יודע שהשתנה) ולרכש (הוזמן חלוף).

**(ב) DB / לוגיקה חסרה.**

*קיים:* `change_orders_ui_engine`, `change_order_bpm_lock_policy`, `change_orders_price_ceiling_manager_gate`, `price_ceiling_approval_workflow`. ה-foundation חזק (BPM, ceiling, locks).

*חסר:*

1. **Resident Pricing Catalog.**
   - חסרה: `resident_pricelist` (id, project_id, version, valid_from, status). פר project כי דירה ב-תל אביב ≠ דירה בבאר שבע.
   - חסרה: `resident_pricelist_items` (catalog_id, sku, name, category `FLOORING|FIXTURES|ELECTRICAL|FINISHES`, base_price (חיוב לדייר), credit_price (זיכוי על המקור), supplier_link, image_id).

2. **Change Order extended fields.**
   - על קיים, חסר: `apartment_id` FK (לדירה הספציפית), `signed_document_id` (חתום ע"י דייר ב-DMS), `payment_status` (שולם / חוב), `delivery_method` (חלק מהמסירה / טרום).

3. **Sync Workflows (קריטי).**
   - חסר: change order APPROVED → אם הוא מצריך פריט שונה → trigger PR אוטומטי לרכש.
   - חסר: change order APPROVED → אם הוא משפיע על subcontract → contract amendment proposal (§2.2).
   - חסר: change order APPROVED → אם הוא משפיע על task → Gantt task addendum.
   - חסר: change order APPROVED → AR invoice לדייר (חיוב).

4. **Apartment Master.**
   - חסר: `apartments` (project_id, building, floor, unit_number, type, area_m2, owner_resident_id, status `AVAILABLE|RESERVED|SOLD|HANDOVER_DONE`).
   - חסר: `residents` (basic CRM של דיירים — שם, טלפון, email, תאריך רכישה).

**(ג) The Golden Thread.**
- **Apartment → Residents → Change Orders → AR + AP**.
- **Change Order → PR → PO → Contract Amendment → Gantt**.
- **DMS holds signed CO document** (compliance).

**(ד) UX/UI.**

1. **Resident Change Order Composer** — מסך עם 3 chunks:
   - Catalog browser (filter by category) — איזה פריטים זמינים.
   - Items selected — quantity, location in apartment.
   - Summary: chargeable amount, credit amount, **net to resident**.
2. **Resident-facing portal (Phase 2)** — דייר נכנס עם link, רואה change orders שלו, מאשר / דוחה דיגיטלית, חתימה אלקטרונית.
3. **Site sync alert** — for each PM: "5 change orders new this week, affecting subcontracts X, Y, Z."

---

### 2.8 בדק ומסירות (Snagging & Handover)

**(א) מטרה עסקית.** ניהול תהליך מסירת הדירה לדייר ותקופת הבדק שאחריה: רישום ליקויים (snags), הקצאתם לקבלן משנה אחראי, מעקב סגירה, וניהול קריאות שירות בתקופת הבדק (1-7 שנים בישראל לפי חוק המכר).

**(ב) DB / לוגיקה חסרה.**

*קיים:* כלום משמעותי. ה-domain הזה הוא **בנייה מאפס**.

*חסר (הכל):*

1. **Snag Management.**
   - `snags` (id, apartment_id, project_id, reported_by_user_id, reported_at, location_in_unit (חדר / רכיב), category, severity `CRITICAL|MAJOR|MINOR|COSMETIC`, description, photos[] via DMS, status `OPEN|ASSIGNED|IN_PROGRESS|RESOLVED|VERIFIED|REOPENED|REJECTED`, assigned_subcontractor_id, target_date, resolved_at, resolved_by, verification_photo_id).

2. **Handover Process.**
   - `apartment_handovers` (apartment_id, scheduled_date, executed_date, performed_by_user_id, resident_id, **handover_protocol_document_id** (DMS), open_snags_at_handover_count, signed_by_resident, signature_image_id, status).

3. **Service Calls (Bedek period).**
   - `service_calls` (apartment_id, opened_by_resident, opened_at, category, description, photos, status `OPEN|TRIAGED|ASSIGNED|CLOSED|ESCALATED`, sla_due_at, assigned_team_id).

4. **Defect Categorization Knowledge Base.**
   - `defect_categories` (taxonomy: חשמל, אינסטלציה, גמר וכד׳) → routing אוטומטי לקבלן משנה אחראי.

**(ג) The Golden Thread.**
- **Apartment → Snags → Subcontractor (back-charge if their fault)**.
- **Snag → Service Call (post-handover)**.
- **Snag closed by photo → Verification by PM → DMS audit**.
- **Snag overdue → Auto-escalation + back-charge** (חיבור ל-§2.2 retention release blocked).

**(ד) UX/UI.**

1. **Resident App (Mobile, RTL).** דייר פותח snag עם תמונה ומיקום בדירה. רואה סטטוס. מקבל push כשטופל.
2. **PM Snag Dashboard.** kanban עם open / assigned / verified columns, filters by apartment / subcontractor / severity.
3. **Handover Wizard.** ביקור שלב-שלב במסירה: 12 checkpoints (מטבח, אמבטיה...), photo capture, snag-on-the-fly, signature → handover protocol PDF generated → DMS.

---

### 2.9 ניהול מסמכים (DMS) — השלמה ל-Production

**(א) מטרה עסקית.** המודול המרכזי ל-source-of-truth של מסמכי פרויקט. כיום ה-foundation (Phase C.1, C.2) מוכן: DB, ACL, RLS, Storage policies, UI בסיסי לעלייה והורדה. נדרש להשלים ל-feature parity של **enterprise DMS** (Procore-equivalent).

**(ב) DB / לוגיקה חסרה.**

*קיים מלא:* `dms_folders`, `dms_documents`, `dms_document_versions`, `dms_acl_entries`, `dms_acl_templates`, `dms_entity_links`, `dms_audit_log`, `dms_folder_subscriptions`. RPC `dms_effective_permissions`. Storage buckets + policies. UI: folder tree, list, upload, signed-URL download.

*חסר:*

1. **Revision Management for Drawings.**
   - מסמך תוכנית הוא לא רק "גרסה X" אלא **מהדורה (revision) A, B, C** עם reason for change. חסר: `dms_drawing_revisions` (document_id, revision_letter, revision_date, drawn_by, checked_by, approved_by, change_description, superseded_at). תוכנית עם revision חדש מסומנת "A → B SUPERSEDED" — אסור להשתמש ב-A לעבודה.

2. **OCR + AI Search.**
   - חסר: pipeline שב-finalize של version מריץ OCR (Tesseract / Google Doc AI) + extraction (Gemini) ושומר ב-`dms_document_text_index` (document_id, version_id, extracted_text, embedding vector(1536)).
   - חסר: search API שמחפש בכל ה-corpus עם semantic similarity ("מצא כל מסמך שמדבר על איטום גג") — ולא רק filename grep.

3. **Polymorphic Linkage Active.**
   - קיים `dms_entity_links` (foundation). חסר: UI flows שעושים auto-link:
     - PO created with attached drawing → drawing linked to PO entity.
     - Vendor invoice uploaded → linked to PO + linked to vendor.
     - Snag with photo → photo linked to snag entity.
   - חסר: "Documents" tab בכל ישות מרכזית (PO, Contract, Apartment, Tender) שמראה את כל המסמכים המקושרים.

4. **Approval Workflows on Documents.**
   - חסר: workflow "submit drawing for approval" → routing למאשר → comment + sign-off → final stamp on PDF.

5. **Email-to-DMS Inbox.**
   - חסר: email address ייעודי per project (proj-xxx@dms.marker-ofek.com) שמסונכרן: כל email נכנס → attachments saved ל-DMS folder "Inbox", body נשמר כ-eml.

6. **External Sharing (Magic Links).**
   - חסר: שיתוף מבוקר חיצוני — "שתף תיקיה זו עם קבלן משנה X" → magic link עם expiry, watermark על preview, audit על כל download.

7. **Bulk Operations.**
   - חסר: ZIP export של תיקיה (יש bucket `dms-zip-exports` מוכן), bulk move/delete עם permission check.

**(ג) The Golden Thread.**
- **כל ישות ERP → DMS entity_links → מסמכים מקושרים**.
- **Drawing revision → PO/Contract amendment trigger** (חסר).
- **DMS search → cross-system retrieval** — search bar גלובלי שמחפש: documents, POs, contracts, snags.

**(ד) UX/UI.**

1. **Search-first DMS** — search bar בולט. תוצאות מצוטטות + thumbnail.
2. **Drawing Viewer** — preview עם markup tools (cloud, redline, comment) — Phase 3.
3. **Revisions Sidebar** — גרסאות עם diff visual.
4. **"Documents" tab** בכל מסך ישות.

---

## פרק 3 — UX/UI רוחבי וארכיטקטורה גלובלית

### 3.1 Design System

**מצב נוכחי.** היום יש design system ברמת component (Storybook) אבל לא ברמת system.

**הדרישה.** design system גלובלי שמגדיר:

1. **Design Tokens.** `@c:\Users\user\Desktop\smart-building-os\docs\design\tokens.md` — table של `--color-primary`, `--color-success`, `--color-warning`, `--space-1...8`, `--radius-sm/md/lg`, `--shadow-1/2/3`, fonts, line heights.
2. **Empty States + Error States + Loading States.** patterns library של skeleton (loading), illustrated empty state עם CTA, error boundary עם retry.
3. **Iconography Library.** Lucide is used — needs a lock on which icons map to which concepts (e.g., 🔒 always = lock state, never decoration). Hebrew-aware icons (where text-direction matters).
4. **Print Styles.** to-print CSS עם header/footer חברה — לדוחות פיננסיים, פרוטוקולי מסירה, certificates.
5. **Accessibility.** WCAG 2.1 AA — audit, screen-reader testing, focus order, color contrast (במיוחד עם light mode החדש).

**יעד Phase 1:** Storybook עם 30 core components, design tokens documented in `@c:\Users\user\Desktop\smart-building-os\docs\design\`, accessibility audit שיחזיר < 10 issues.

### 3.2 Mobile / Field App

**מצב נוכחי.** האפליקציה היא responsive web — עובדת ב-mobile browser אבל לא PWA, לא offline-capable, לא optimized ל-day-on-site.

**הדרישה.** מנהל עבודה / רכז שטח / קבלן משנה משתמש ב-iPhone באתר עם 4G חלש או ללא קליטה. הוא צריך:

1. **PWA installable.** "Add to home screen" עם icon + splash. Service worker לקאש סטטי.
2. **Offline-first עבור flows ספציפיים.**
   - Daily log entry — נשמר local, sync כשיש קליטה.
   - Snag report — אותו דבר.
   - GR confirmation — אותו דבר.
   - מבוסס IndexedDB + sync queue + conflict resolution אופטימיסטית.
3. **Camera-first UI.** photo capture is primary CTA on most flows.
4. **Hebrew-aware keyboard** + voice-to-text (Web Speech API) — קל יותר להכתיב יומן עבודה ב-עברית מאשר להקליד.
5. **Push notifications** דרך Web Push API + FCM (Firebase Cloud Messaging).
6. **Designed for one-handed use** — CTAs in bottom 1/3, large tap targets (44pt+).
7. **Battery-aware** — heavy operations ניתנות עיכוב מתי שאין טעינה.

**יעד Phase 1:** 3 flows mobile-first: PR creator (§2.1), Daily log (§2.3), Snag report (§2.8). PWA installable. Phase 2: GR mobile, Snag verification, Handover wizard.

### 3.3 RBAC (Role-Based Access Control) מתקדם

**מצב נוכחי.** company memberships (`erp_user_company_memberships`) עם role בסיסי. RLS policies בודקות `user_has_company_access(company_id)`. ה-DMS מציג ACL מתקדם (RBAC + ABAC + templates + DENY) שיכול לשמש כ-reference.

**פערים.**

1. **Role taxonomy formalization.** היום אין enum ברמת מערכת של roles. נדרש schema:
   - `roles` (id, name, system_default boolean, description, parent_role_id).
   - דוגמאות default: `CEO`, `CFO`, `PROJECT_MANAGER`, `PROCUREMENT_OFFICER`, `AP_CLERK`, `SITE_FOREMAN`, `SUBCONTRACTOR_PM`, `RESIDENT`, `AUDITOR_READONLY`, `IT_ADMIN`.
2. **Permissions matrix.** `permissions` (id, key like `procurement.po.create`, name, module). `role_permissions` (role_id, permission_id, allow boolean).
3. **Per-project role assignments.** המנכ"ל הוא CEO global, אבל אדם יכול להיות PM על פרויקט A ו-Reader על פרויקט B. נדרש: `user_project_roles` (user_id, project_id, role_id).
4. **Approval thresholds per role.** PO < ₪10k = פרוקיורמנט, ₪10k-₪50k = PM, ₪50k-₪500k = CFO, > ₪500k = CEO. כיום קיים בסיס ב-`po_approval_engine` — צריך להכליל לכל ה-flows (CO, contract amendments, budget revision).
5. **Delegation.** "אני יוצא לחו"ל ב-15.6 — אישור PO שלי ילך ל-Yossi עד 22.6". חסר: `role_delegations` (from_user, to_user, role_id, valid_from, valid_until).
6. **Audit trail of permission changes** — מי נתן ליוסי גישה ומתי.

**Out-of-the-box defaults** — חברה חדשה מקבלת 10 roles מוגדרים מראש שעובדים מ-day 1; admin משדרג מהם.

### 3.4 Approval Workflows (BPM Engine)

**מצב נוכחי.** workflow ייעודי קיים על PO (`po_approval_engine`) ועל change order ceiling (`price_ceiling_approval_workflow`, `change_order_bpm_lock_policy`). אין engine גנרי.

**הדרישה.** מנוע אישורים אחיד שכל flow יכול להגדיר עליו:

1. **Process Definition.**
   - `workflow_definitions` (id, key, version, name, applies_to_entity `PO|CO|PR|PROGRESS_CERT|CONTRACT|BUDGET_REVISION`, json_schema (steps)).
   - JSON schema של steps: `[{ "step": 1, "approver_rule": "role:PROCUREMENT_OFFICER", "auto_approve_under": 10000 }, { "step": 2, "approver_rule": "role:CFO", "skip_if_under": 50000 }, ...]`.

2. **Process Instances.**
   - `workflow_instances` (id, definition_id, entity_type, entity_id, status `PENDING|APPROVED|REJECTED|CANCELLED`, current_step).
   - `workflow_step_actions` (instance_id, step_number, actor_user_id, action `APPROVE|REJECT|REASSIGN|REQUEST_INFO`, comment, performed_at).

3. **Notifications & Reminders.**
   - על כל transition → push + email למאשר.
   - SLA tracker: 24h למאשר → reminder; 48h → escalate to delegate; 72h → escalate to manager.

4. **Mobile-First Approval.**
   - swipe-to-approve UI ב-mobile.
   - quick-approve CTA ב-email (magic link עם short-TTL).

5. **Conditional logic.**
   - PO > 100k AND project_risk_high → both CFO and CEO required.

### 3.5 Notification Center

**מצב נוכחי.** Resend מוגדר ל-emails טרנזקציוניים בסיסיים. אין notification center, אין push.

**הדרישה.**

1. **`notifications` schema** (id, user_id, type, severity `INFO|WARNING|URGENT`, title, body, action_url, source_entity_type, source_entity_id, read_at, dismissed_at, channel `IN_APP|EMAIL|PUSH`, sent_at, sent_status).
2. **User preferences** (`notification_preferences`) per type — channel, daily digest vs. immediate.
3. **In-app notification bell** (header) עם count, dropdown, "mark all read".
4. **Email digests** — daily summary 7AM של "מה קרה אתמול".
5. **Push notifications** דרך Web Push (PWA) + native (Phase 3 if there's React Native).
6. **Slack / Teams integrations** (Phase 2-3).

### 3.6 Observability & Operations

חסר מעטפת:

1. **Audit log unified view** — היום DMS יש log פר עצמו, שאר המודולים מפוזרים. נדרש unified view + search.
2. **Error tracking** — Sentry או חלופה (היום אין).
3. **Performance monitoring** — Vercel Analytics + custom RUM ל-flows קריטיים.
4. **Health dashboard** — ל-admin: AI service uptime, OCR queue depth, MASAV file generation success.
5. **Backups & DR** — Supabase managed, אבל חסר RTO/RPO documented commitment ללקוח.

### 3.7 AI / ML Infrastructure

**מצב נוכחי.** AI ב-procurement חזק (deterministic grounding + tool calling). DMS מתוכנן ל-OCR/embeddings. PDF Intelligence Engine document שווה.

**יעדים cross-cutting:**

1. **Unified AI orchestration layer** — מקום מרכזי ש-routes בין models (Gemini, gpt-4o, Claude), עושה fallback, retries, caching.
2. **Prompt management** — versioned prompts ב-DB, A/B testing.
3. **Evaluation framework** — golden datasets לכל use-case (PO from drawing, invoice OCR, snag categorization). CI runs eval on changes.
4. **Cost tracking** — per company / per project / per user — לחשב margin אמיתי.

---

## פרק 4 — Go-To-Market Roadmap (Phases 1-3) ו-MVP boundary

> **עקרון מנחה:** ה-MVP נבנה סביב **לקוח ראשון משלם** — לא סביב "כל מה שהיינו רוצים". כל פיצ'ר ב-Phase 1 חייב לענות על ביקורת: "האם בלעדיו הלקוח לא יקנה / לא ייעלה ל-production?". פיצ'רים שאינם blocker — לא ב-Phase 1.

### 4.1 הגדרת Beachhead Customer (ה-ICP ל-MVP)

**פרופיל לקוח ראשון:**
- חברת בנייה ישראלית, 80-300 עובדים, 5-15 פרויקטים פעילים בו-זמנית.
- בעיקר residential (בנייה רוויה) — כי שם change orders רגילים והדומיין שלנו חזק.
- היום עובדת עם Priority + Excels + WhatsApp (הזירה הסטנדרטית).
- לפחות אדם אחד ברמת CFO/Controller שמוכן להוביל transition פנימית.
- מוכנה ל-3-month parallel run (ישן עם חדש).

**מודל מסחור Phase 1:**
- design partnership: שנה ראשונה במחיר מופחת + שיתוף פעולה הדוק על feedback.
- after Phase 1 success: contract של 24 חודשים + reference site לפיצ'ול VC הבא.

### 4.2 Phase 1 — Enterprise MVP (12 שבועות)

**יעד:** הלקוח הראשון מנהל את הפרויקט החדש שלו end-to-end ב-Marker-Ofek, **מ-tender ועד תשלום ספק** — בלי Excel ידני בשום שלב קריטי.

**Workstreams במקביל (3 צוותים זוטרים בערך):**

#### W1 — Financial Closure (CFO buy-in) — קריטי

- שבועות 1-2: GL schema + `gl_accounts` + `gl_journal_entries` + period management. עיקר העבודה DB.
- שבועות 3-5: AP Payment Run wizard + MASAV file generation. צ'קים. payment audit.
- שבועות 5-7: Bank Reconciliation UI + AI matching engine.
- שבועות 6-8: Vendor/Customer subledgers + 13-week rolling cash flow.
- שבועות 9-10: Period close checklist + Real-time financial dashboard.
- שבוע 11: integration tests + CFO walk-through.

**Done = CFO can close the November 2026 month in the system, generate MASAV file, reconcile bank statement, and trust the numbers.**

#### W2 — Subcontractor Management (Project Execution buy-in)

- שבועות 1-3: `pbc_subcontractor_contracts` schema + `pbc_contract_boq_lines` + `pbc_contract_amendments`.
- שבועות 4-6: `pbc_progress_certificates` + `pbc_progress_certificate_lines` + cumulative quantity validations.
- שבועות 5-7: Retention ledger + back-charges schema.
- שבועות 7-9: Contract Workspace UI + Progress Certificate Builder (the critical UX).
- שבועות 9-10: Integration: cert APPROVED → vendor invoice → 3-Way Match → AP flow.
- שבוע 11: PM walk-through.

**Done = PM can issue 5 progress certificates this month, system validates, retention tracked, payments flow to AP.**

#### W3 — Field App + Procurement Loop (Adoption + Data buy-in)

- שבועות 1-2: PWA setup, service worker, offline IndexedDB, sync queue.
- שבועות 2-4: PR creator (mobile-first) + PR queue UI for procurement officer.
- שבועות 3-5: Daily Log mobile + linkage to Gantt task.
- שבועות 5-7: Snag report mobile + PM Snag Dashboard.
- שבועות 7-9: GR mobile (camera + signature).
- שבועות 9-10: push notifications + role-aware home screens.
- שבוע 11: site walkaround test with foreman.

**Done = foreman opens 8 snags, 4 PRs and 12 daily logs in a week — without opening a desktop.**

#### W4 (cross-cutting, sequential by 1 senior eng)

- שבועות 1-3: BPM Engine generic (workflow_definitions/instances/step_actions). Migrate PO + CO into it.
- שבועות 4-6: Notification Center + email digests + Resend templates.
- שבועות 7-9: Audit log unified view + Sentry integration.
- שבועות 9-11: Role taxonomy + permissions matrix + delegation.
- שבועות 10-11: Storybook setup + design tokens documented + WCAG audit.

**MVP Boundary — מה לא נכלל ב-Phase 1:**

| תחום | מצב Phase 1 |
|---|---|
| Tendering distribution + Bid Leveling | **Phase 2** |
| Resident Change Order portal לדייר | **Phase 2** |
| Inventory cycle counts + warehouse heatmaps | **Phase 2** (data layer קיים, UI מתקדם later) |
| Apartment Handover wizard | **Phase 2** |
| Service calls (Bedek period) | **Phase 2** |
| Earned Value Management views | **Phase 2** |
| Budget v. Actual cockpit מתקדם | **Phase 2** (basic cost tracking ב-1) |
| DMS — OCR + AI search + drawing revisions | **Phase 2** |
| External sharing magic links | **Phase 2** |
| Subcontractor Portal | **Phase 2** |
| Slack/Teams integration | **Phase 3** |
| Native mobile apps | **Phase 3** |

### 4.3 Phase 2 — Production Hardening + Expansion (12-16 שבועות)

יעד: הלקוח השני, השלישי, הרביעי. הופך את ה-MVP ל-product מצוחצח, וסוגר את הפערים הגדולים.

**Workstreams:**

1. **Tender Platform v2** (§2.6) — distribution magic links, bid leveling, sealed bid integrity, audit.
2. **Resident Module v2** (§2.7, §2.8) — pricing catalogs, signed CO docs, resident portal, apartments master, snag/handover/service-calls.
3. **DMS Phase D** (§2.9) — OCR, AI semantic search, drawing revisions, approval workflows, email-to-DMS.
4. **Inventory + Warehouses** (§2.1) — full schema, cycle counts, heatmaps, RTV.
5. **Budget v. Actual + EVM** (§2.5, §2.3) — budget schema, real-time variance, EAC, EVM views, Project Cockpit.
6. **Mobile Phase 2** — handover wizard, GR mobile mature, snag verification by PM, voice-to-text.
7. **Performance** — CDN tuning, query optimization, materialized views.

### 4.4 Phase 3 — Scale + AI Differentiation (12-20 שבועות)

יעד: 10-25 לקוחות מסונכרנים. AI moat שמרגיש ב-day-to-day. Enterprise-grade observability.

**Workstreams:**

1. **AI Infrastructure** (§3.7) — unified orchestration, prompt management, evaluation framework, cost tracking. **Effect:** כל use-case AI עובר eval ב-CI; קלות בהוספת use-cases חדשים.
2. **Vision/Drawing Intelligence** v2 — Autodesk APS integration, holistic PDF Intelligence Engine pipeline (לפי המסמך הקיים), interactive drawing markup.
3. **Native Mobile** — React Native (לאחר אימות PWA) או PWA-only depending on adoption signals.
4. **Multi-Currency + Multi-Country** — תמיכה ב-USD/EUR לפרויקטים בחו"ל, language packs.
5. **Customer Self-Service** — onboarding wizard, default templates per company size, in-app tours.
6. **Marketplace** — vendor directory, subcontractor marketplace, integration marketplace (Slack, MS-Teams, QuickBooks, Hashavshevet bridge).
7. **Compliance Pack** — SOC 2 Type II, GDPR DSAR flows, ISO 27001 prep.

### 4.5 Risks & Mitigations

| סיכון | סבירות | השפעה | מיטיגציה |
|---|---|---|---|
| לקוח ראשון נסוג מ-parallel run | בינונית | קריטית | bi-weekly check-ins, clear exit criteria, free fallback ל-Excel exports |
| מורכבות GL מעבר לתכנון | גבוהה | גבוהה | hire senior accounting consultant week 1, peer review של schema, integration testing מדורג |
| צוות mobile nuance ב-PWA offline conflicts | בינונית | בינונית | start with simple flows (read-only first), then write, then offline-write |
| MASAV format edge-cases (בנקים שונים) | גבוהה | בינונית | start with bank A only (Hapoalim), expand בהדרגה |
| feature creep מצד הלקוח | גבוהה | גבוהה | clear MVP boundary in contract, "Phase 2 backlog" שקוף לכולם |
| AI hallucinations on POs | בינונית | קריטית | grounding rigor, evaluation set, "AI Suggested" badges everywhere, deterministic state כברירת מחדל |

### 4.6 Hiring Plan ל-Phase 1

- **2 full-stack engineers (Next.js + Postgres + Supabase)** — W2, W3.
- **1 senior backend / DB architect** — W1 (financial schema), part-time W4 (BPM engine).
- **1 mobile / PWA specialist** — W3.
- **1 product designer** — full-time across all workstreams.
- **0.5 accounting consultant** — Israeli CPA, advisor on GL chart of accounts + MASAV.
- **CTO/Founder** — review + integration architecture + customer relationship.

**סה"כ:** ~5 FTE + 2 part-time. ב-burn $80-120k/month.

### 4.7 Success Metrics

**ב-12 שבועות (סוף Phase 1):**

- ✅ לקוח ראשון מבצע month-close בנובמבר 2026.
- ✅ 5+ progress certificates שאושרו במערכת.
- ✅ 30+ POs באישור מלא end-to-end (PR → PO → GR → invoice → 3WM → payment).
- ✅ 100+ field-app actions ביום (PR / GR / daily log / snag).
- ✅ NPS ≥ 40 מצוות הלקוח.
- ✅ 0 data leakage incidents (multi-tenant isolation בדוק).
- ✅ p95 latency על main flows < 800ms.

**ב-6 חודשים (סוף Phase 2):**

- ✅ 4 לקוחות חיים, 100+ active users.
- ✅ ARR ≥ $400k (4 × $100k average).
- ✅ Reference call זמין ל-VC pitch.
- ✅ SOC 2 Type I.

**ב-12 חודשים (סוף Phase 3):**

- ✅ 15-25 לקוחות.
- ✅ ARR ≥ $2M.
- ✅ AI evaluation framework מצוטט ב-marketing.
- ✅ partnership או integration עם Autodesk APS / Procore.

---

## נספח — אבני בוחן (Acceptance Criteria) ל-Phase 1 MVP

> כל acceptance criterion הוא **בינארי** (pass/fail) וניתן לבדיקה אוטומטית או manual demo. אין "כמעט עובד".

### A.1 Financial Closure (W1)

**A.1.1 GL Foundation**
- [ ] `gl_accounts` schema קיים, seed של chart of accounts ישראלי בסיסי (200+ accounts) טעון.
- [ ] `gl_journal_entries` עם constraint debits = credits נכפה ב-trigger.
- [ ] `gl_periods` table; period CLOSED חוסם posting (test: insert into closed period → exception).
- [ ] RLS על כל ה-GL tables בתוקף; user של חברה A לא רואה נתוני חברה B (test: RLS test suite).

**A.1.2 AP Payment Run**
- [ ] User מסוג CFO יוצר Payment Run, בוחר 5 חשבוניות APPROVED של ספק, מקבל קובץ MASAV `.001` להורדה.
- [ ] קובץ ה-MASAV עובר ולידציה של בנק (פורמט header/records/trailer).
- [ ] APP execution → אוטומטית posts GL JE (Cr Bank, Dr AP) → reflected ב-vendor balance.
- [ ] המערכת חוסמת תשלום על חשבונית עם status ≠ APPROVED.

**A.1.3 Bank Reconciliation**
- [ ] Import bank statement (CSV) → 50 שורות נטענות ב-`bank_statement_lines`.
- [ ] AI suggester מציע התאמות ל-95%+ מהשורות עם confidence ≥ 0.7.
- [ ] User מאשר reconciliation; bank balance מתעדכן; דוח reconciliation זמין להורדה.

**A.1.4 Period Close**
- [ ] Checklist UI מוצג עם 8 פריטי בדיקה לחודש.
- [ ] בלחיצה על "Close Period", system מקפיא: עוד posts ל-period assayed → blocked.
- [ ] Audit log רושם actor + timestamp + IP.

**A.1.5 Cash Flow Forecast**
- [ ] 13-week rolling forecast מחושב מ-AP open + AR open + payroll + recurring expenses.
- [ ] CFO רואה גרף עם לפחות 2 scenarios (base / pessimistic).

### A.2 Subcontractor Management (W2)

**A.2.1 Contract Creation**
- [ ] Tender win → אוטומטית יוצר `pbc_subcontractor_contracts` עם BOQ lines ו-retention default 5%.
- [ ] Contract Workspace UI מציג: header, BOQ tab (paginated 100+ lines fluid), Amendments, Progress Certs, Back-Charges, Documents (DMS), Audit.

**A.2.2 Progress Certificate Builder**
- [ ] PM פותח cert חדש; grid טוען עם previous cumulative pre-filled.
- [ ] הזנת "this period quantity" → "cumulative" מתעדכן live; אם cumulative > contracted (+ tolerance) → cell אדום וחסום מ-submit.
- [ ] Footer מחשב: gross, retention this period, retention released, back-charges deducted, advance recovery, VAT, **net payable** — בזמן אמת.
- [ ] "AI suggest from daily logs" כפתור: מציע quantities מבוססות יומני עבודה + photos של השבוע — PM מאשר/דוחה.

**A.2.3 Cert Approval Flow**
- [ ] Submit → goes to BPM workflow (CFO if > ₪500k, otherwise PM only).
- [ ] APPROVED → אוטומטית יוצר `erp_vendor_invoice` בסכום net_payable + JE ב-GL.
- [ ] retention tracked ב-`pbc_retention_ledger`.

**A.2.4 Back-Charges**
- [ ] PM יוצר back-charge ידני (חומר שהונפק לקבלן ש-לא הוחזר); status PENDING.
- [ ] בעת cert חדש → המערכת מציעה את ה-PENDING back-charges לניכוי.
- [ ] אישור הניכוי → status DEDUCTED; net_payable של ה-cert מופחת.

### A.3 Field App + Procurement Loop (W3)

**A.3.1 PWA Installation**
- [ ] iOS Safari + Android Chrome: "Add to Home Screen" עובד עם icon + splash.
- [ ] Service Worker רושם static assets; offline page נטען offline.

**A.3.2 PR Creator (Mobile)**
- [ ] foreman במצב offline יוצר PR עם 3 פריטים + photo; sync כשחוזרת קליטה.
- [ ] procurement officer רואה PR queue; הופך 3 PRs של אותו ספק ל-PO אחד.
- [ ] notification חוזרת ל-foreman: "PR שלך הומר ל-PO #1234, הגעה צפויה 12.6".

**A.3.3 Daily Log Mobile**
- [ ] Log entry עם voice-to-text בעברית עובד (Web Speech API).
- [ ] לוגאוטומטי משייך זמן + project + weather (מ-API).
- [ ] AI extracts task progress: "טיינו 230 מ"ר ריצוף" → suggests update ל-task ב-Gantt + ל-cert relevant.

**A.3.4 Snag Mobile**
- [ ] foreman פותח snag עם תמונה + מיקום בדירה (חדר); שולח.
- [ ] PM רואה ב-kanban dashboard; assigns לקבלן משנה.
- [ ] subcontractor (notification דרך SMS magic link Phase 2 — Phase 1: email) פותר; uploads verification photo.
- [ ] PM verifies → status VERIFIED; audit log מלא.

**A.3.5 GR Mobile**
- [ ] Camera scans barcode of delivery; auto-matches PO line.
- [ ] confirm quantity (auto / override); upload photo + signature; submit.
- [ ] back at office: PO line `quantity_received` updated; status `PARTIALLY_RECEIVED` או `FULLY_RECEIVED` כצפוי.

### A.4 Cross-Cutting (W4)

**A.4.1 BPM Engine**
- [ ] PO approval flow מועבר מ-`po_approval_engine` ל-generic BPM (data preserved).
- [ ] Change Order ceiling flow מועבר ל-BPM.
- [ ] New flow (Progress Cert approval) הוגדר רק דרך JSON config — אפס שורות קוד נוספות.
- [ ] SLA reminders עובדים: 24h → email; 48h → escalation.

**A.4.2 Notification Center**
- [ ] User mock receives 5 notifications של types שונים; bell icon מציג count.
- [ ] daily digest email נשלח ב-7AM למשתמש שמינוי ל-digest.
- [ ] preferences UI מאפשר לשנות channel per type.

**A.4.3 Audit Unified View**
- [ ] Admin רואה log אחד מאוחד של 30 ימים אחרונים: actor, action, entity, timestamp, IP.
- [ ] חיפוש על entity_id מחזיר את כל ההיסטוריה.
- [ ] export ל-CSV עובד.

**A.4.4 RBAC**
- [ ] 10 default roles נטענו; admin יכול ליצור role חדש.
- [ ] Per-project assignment עובד: User X = PM on Project A, Reader on Project B.
- [ ] Delegation: User Y מגדיר delegation ל-User Z עד 22.6; PO approvals ב-window הזה הולכים ל-Z.

**A.4.5 Design System & A11y**
- [ ] Storybook deployed ב-staging עם 30 components מתועדים.
- [ ] axe-core scan על 10 main pages → 0 critical issues.
- [ ] keyboard navigation עובד על כל ה-flows הקריטיים.

### A.5 Non-Functional

- [ ] **Latency:** p95 על main API endpoints (PO list, cert builder, PR submit) < 800ms.
- [ ] **Uptime:** 99.5%+ ב-30 ימים אחרונים (Vercel + Supabase combined).
- [ ] **Data isolation:** RLS test suite עובר 100%; ניסיון cross-company access נחסם.
- [ ] **Backup:** PITR מופעל ב-Supabase; restore drill בוצע פעם אחת לפחות.
- [ ] **Documentation:** runbook ל-incident response קיים; CFO/PM/foreman onboarding guides ב-DMS.

---

## נספח B — Phase 2: Dynamic Global System Parameters (Sprint 2026-09-10)

> **Status:** ✅ Migration + Helper + Admin UI + Refactor של hardcode קריטי הושלמו ב-`20260910120000_erp_system_parameters.sql`, `lib/erp/system-parameters.ts`, `app/(dashboard)/marker-ofek/settings/system-parameters/page.tsx`.

### B.1 Rationale & ארכיטקטורת ירידה

עד היום פרמטרים כמו מע"מ (17%), עכבון, תחיליות מספור, ספי AI וכו' היו **קשיחים בקוד** או מפוזרים בין שתי טבלאות (`mo_system_settings` singleton + `company_profile` typed columns). לקוחות בכמה חברות, שינוי דרישות רגולציה (למשל מע"מ עתידי 18%), והוספת פרמטרים תכופה — הצריכו תשתית גמישה.

**Precedence ladder (single source of truth):**

```
read time
   │
   ▼
1. erp_system_parameters       (per-company, key-value, גמיש)
   │ (key not found)
   ▼
2. company_profile.<column>    (per-company, typed)
   │ (column null)
   ▼
3. mo_system_settings.<column> (global singleton)
   │ (still null)
   ▼
4. Hard-coded fallback         (logged warn, last resort)
```

### B.2 Schema

טבלה חדשה `public.erp_system_parameters`:

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `company_id` | text | RLS scope (`user_has_company_access`) |
| `param_key` | text | `^[A-Z][A-Z0-9_]{2,63}$` (UPPER_SNAKE_CASE) |
| `param_value` | text NULL | |
| `data_type` | enum `erp_param_data_type` | STRING / NUMBER / PERCENT / BOOLEAN / JSON / EMAIL / URL / DATE / ENUM |
| `category` | text | `^[a-z][a-z0-9_]{0,31}$` (finance / numbering / branding / banking / ai / cost_control) |
| `is_secret` | bool | redacted ב-RPC ל-non-admin |
| `is_system` | bool | seed-managed — UI חוסם hard-delete |
| `metadata` | jsonb | `{ options[], min, max, regex, group_order, unit }` |
| audit cols | created/updated_at + by | reuses `public.set_updated_at()` |

**RLS:** SELECT לכל company-member. INSERT/UPDATE/DELETE רק לתפקיד `ADMIN`/`OWNER` ב-`erp_user_company_memberships`. RPC `erp_get_system_parameters(p_company_id)` מספק bulk read עם redaction אוטומטי של secrets ל-non-admins.

**Seed:** 16 פרמטרים פר-חברה, מקובצים ב-6 קטגוריות:
- **finance**: `DEFAULT_VAT_PCT=17.0`, `DEFAULT_RETENTION_PCT=5.0`, `CURRENCY_CODE=ILS`, `ROUNDING_GRANULARITY=0.01`
- **numbering**: `INVOICE_NUMBER_PREFIX=INV-`, `PO_NUMBER_PREFIX=PO-`, `PROJECT_CODE_PREFIX=PRJ-`
- **branding**: `EMAIL_FROM_NAME`, `PDF_HEADER_TAGLINE`
- **banking**: `MASAV_INSTITUTION_CODE`, `MASAV_SENDER_NAME`
- **ai**: `AI_AUTOPOST_CONFIDENCE_MIN=0.92`, `AI_THREEWAY_VARIANCE_TOLERANCE_PCT=2.0`
- **cost_control**: `COST_CONTROL_PERIOD_LOCK_DAYS=5`, `BUDGET_OVERRUN_WARN_PCT=85.0`, `BUDGET_OVERRUN_BLOCK_PCT=100.0` (MedaTech §6.5 alignment)

### B.3 Refactors שבוצעו

| מיקום | לפני | אחרי |
|---|---|---|
| `lib/holden-erp/billing-actions.ts:223` | `const VAT_RATE = 0.17` | `await getVatMultiplier(companyId)` עם cache TTL 60s |

### B.4 Refactors דחויים (TODO רשמי)

| מיקום | מה | למה דחוי |
|---|---|---|
| `supabase/migrations/20260809100000_ai_procurement_deterministic_engine.sql:731` | RPC SQL פנימי משתמש ב-`* 0.17` קשיח | דורש migration חדש שעוטף RPC לקרוא מ-`erp_system_parameters`. תכנון נדרש (טריגרים על PO totals — אם קוראים DB כל insert זה ביצועי-יקר). מסלול: רפק'ר עצמאי בסשן הבא. |
| `supabase/migrations/20260812100000_seed_mock_invoices.sql` | seed קבוע 0.17 בשורות דמו | seed בלבד — לא משפיע על נתוני production. השאר לתאימות אחורה לבדיקות. |

---

## נספח C — Competitive Positioning (vs SAP S/4HANA / Priority / Comax)

> **Audience:** מנכ"ל, ועדת השקעות, כל פגישת sales. הסעיף ממסגר איפה אנחנו מצדיקים שאנחנו מציבים סטנדרט גבוה יותר ולא רק "Priority עם UI מודרני".

### C.1 השוואה ברמת מודול (9 פרקי MedaTech)

| # | פרק | SAP S/4HANA | Priority (MedaTech impl) | Comax | **Marker-Ofek (יעד MVP+)** |
|---|---|---|---|---|---|
| 1 | **כללי / Setup** | קונפיגורציה מאוד מורכבת, ABAP/Fiori. דורש 6+ חודשי SI. | ינואי setup ב-Priority Express. תפעולי תוך 2-3 חודשים. | Wizard מהיר אבל מודולים שטחיים. | **One-click bootstrap** של 9 ברירת-מחדל folders, חברה חדשה פעילה תוך 5 דקות (`loadDmsBrowserBootstrap`). |
| 2 | **רכש** | SAP Ariba (כלי נפרד, אינטגרציה מסובכת). | מודול חזק עם purchase requests, 3-way match ידני. | בסיסי. | **AI-native 3-Way Match** — `BUDGET_OVERRUN_BLOCK_PCT` דינמי, `AI_THREEWAY_VARIANCE_TOLERANCE_PCT` קונפיגרבילי, deterministic engine קיים (`20260809100000_ai_procurement_deterministic_engine.sql`). |
| 3 | **חוזי מזמין/קבלן** | weak. דורש addon (CLM external). | חוזק היסטורי. תיקונים, אמנדמנטים, retention, back-charges. | אין באמת. | **Parity מלאה (יעד)** + Contract Vault DMS עם versioning (`20260815120000_dms_phase_c1_foundations.sql`). Spec MedaTech §3 ingested ב-2026-05-11 (`docs/ingested-specs/medatech-contracts-module.md`) — מימוש W2 בעבודה. יתרון: D3 revert + audit trail משפטי. |
| 4 | **ניהול מלאי** | חזק (MM module). | טוב, חסרון: UI ישן. | בסיסי. | **Out of scope ל-Phase 1.** ארכיטקטורה מוכנה אבל לא ממומש (decision: lean MVP). |
| 5 | **פרויקטים** | PS module — חזק אבל יקר/מורכב. | פרויקטים + BOQ + ניהול ביצוע. ברירת המחדל בקבלני בנייה IL. | חלש. | **Parity + AI**: WBS, BOQ, plan vs actual (`20260828100000_priority_project_planning.sql`). יתרון: PDF Intelligence Engine מאכלס DMS אוטומטית מהשטח. |
| 6 | **בקרה תקציבית** | מורכבת — דורש CO + PS. | **הכוח של MedaTech**: 4-מימדי בקרה, snapshots חודשיים, forecast ידני (§6.3, §6.5). | אין באמת. | **Parity + UX מודרני**: `erp_proj_control_*` מימוש לפי §6.2.4-6.5 (`20260903100000_erp_cost_control.sql`). יתרון: ספי warn/block דינמיים פר חברה (`BUDGET_OVERRUN_*_PCT`), AI ניתוח חריגות. |
| 7 | **מכרזים** | weak בלי addon. | מודול ייעודי — מאפשר tender editions שמזינים קבלן. | חסר. | **Phase 2.** בארכיטקטורה אבל לא ב-MVP. נשען על §5.5 (loading budget plan) ועל מערכת ה-cost control. |
| 8 | **כספים** | מלא, יקר. | מלא — כולל journal, AR/AP, MASAV. | טוב. | **Parity**: GL, journals, MASAV ZNK (`20260826100000_ap_payments_masav.sql`), bank reconciliation (`20260825110000_bank_reconciliation_schema.sql`). יתרון: VAT/retention דינמיים, MASAV codes ב-`erp_system_parameters`. |
| 9 | **הסבות / Onboarding** | מנהל פרויקט SI ממומחה, 6-12 חודשים. | wizard + שירותי MedaTech. | self-service מהיר. | **Self-service templates** ב-`docs/ingested-specs/onboarding-master-data-templates.md`. CSV import. יתרון: AI agent שמסווג נתונים שמיובאים. |

### C.2 איך אנחנו "מעבר" — Strategic moat

ארבעה צירים שמייצרים פער מבני, לא רק UX:

1. **AI-native data plane** — לא bolt-on; PDF Intelligence Engine, deterministic 3-way match, AI-classification של uploads — חלק מליבת ה-DB ו-RLS. Priority/SAP מציעים AI כ-addon חיצוני יקר.
2. **דינמיות בלי SI** — `erp_system_parameters` + `mo_system_settings` + `company_profile` = שינוי VAT/retention/spec עסקי **לא דורש developer**. SAP customization מצריך ABAP. Priority customization מצריך פרוייקט DRC.
3. **Cloud-first multi-tenant ללא לייסנס per-seat** — SaaS, RLS company-scoped, גמישות תמחור. SAP/Priority נמכרים פר משתמש בעלויות ארבע-ספרתי בחודש.
4. **Audit-grade מובנה** — `dms_audit_log` immutable, ZIP export עם רשימת version IDs. Priority audit חלש מטבעו. SAP חזק אבל מורכב.

### C.3 מתי **לא** להציע אותנו (היכרות עם המגבלות)

- **ארגון 500+ עובדים, כמה חברות-בנות בכמה מדינות, ERP גלובלי** → SAP. הם פותרים את זה היום.
- **קבלן עם 30 שנה ב-Priority, רגישות אפס לשינוי, פקידות שלא מסוגלת ללמוד UI חדש** → השאירו אותם ב-Priority עד שדור הבא נכנס.
- **ארגון שדורש module שלא בנינו עדיין** (למשל מלאי מסיבי, ייצור) → לפני שאנחנו ערוכים, לא לקבל את ה-deal כדי לא להיכנס לתחזוקה כרונית.

---

## נספח D — DMS Phase C.2: Notifications & Realtime (Sprint 2026-09-15)

> **Status:** ✅ Notifications service + Realtime broadcast + Folder subscriptions + UI wiring הושלמו.

### D.1 מה נמסר

| רכיב | קובץ | תיאור |
|---|---|---|
| Recipient Resolver | `lib/marker-ofek/dms/dms-notifications.ts` | מאחד ACL viewers + folder subscribers + linked-entity owners (stub). Dedup + opt-out aware. |
| Email Composer | אותו קובץ | Subject/body HTML branded לפי `company_profile`, תרגום עברית, CTA חוזר לעמוד המסמך. |
| Audit Logger | אותו קובץ | כתיבה ל-`dms_audit_log` על כל notification (success/fail) עם `notification_channels_used`. |
| Server Emitter | `lib/marker-ofek/dms/dms-realtime.ts` | Supabase Realtime channel פר פרויקט (`dms:project:<id>`), fire-and-forget עם error-swallow. |
| Client Subscriber | `lib/marker-ofek/dms/dms-realtime-client.ts` | React hook `useDmsRealtime` עם cleanup בטוח, filter לפי folder/document. |
| Shared types | `lib/marker-ofek/dms/dms-realtime-shared.ts` | `DmsRealtimeEvent` union: `version_inserted`, `version_reverted`, `document_deleted`. |
| Action hooks | `lib/marker-ofek/dms/dms-actions.ts` | `dmsFinalizeUpload` + `dmsRevertToVersion` מפעילים notifications+realtime דרך `sideEffect()` בלי לחסום. |
| Subscription actions | אותו קובץ | `dmsToggleFolderSubscription`, `dmsListFolderSubscriptions` — RLS-safe, אופטימיסטיים. |
| Folder Tree UI | `components/marker-ofek/dms/dms-browser.tsx` | Bell toggle פר folder, optimistic state, tooltip עברית, realtime subscription + toast notifications + conditional reload. |

### D.2 מדדי קבלה

- **Latency:** Broadcast מגיע לקליינט < 1.5s מרגע finalize (Supabase Realtime WS).
- **Fire-and-forget:** כשל email/broadcast לא יפיל את פעולת ה-upload/revert. מקומם מדי לוג ב-audit.
- **Dedup:** נמען שמופיע גם כ-ACL וגם כ-subscriber מקבל מייל אחד.
- **Scope:** subscription ברמת folder משפיעה על כל המסמכים בתוך folder (ו-recursive אם `include_descendants=true`).

### D.3 פערים ידועים / Phase C.3

- ~~`linked-entity owners` — stub~~ → ✅ **נסגר** ב-2026-05-11 (`lib/marker-ofek/dms/linked-entities-resolver.ts`). הצינור משלב את `dms_entity_links` של `entity_type='PROJECT'` יחד עם `project_assignments` של פרויקט המסמך. הרחבה ל-`CONTRACT`/`PURCHASE_ORDER` תידרש כש-`erp_subcontractor_contracts` יזכה ל-`created_by`/`account_manager_id` (Sprint W2).
- **Digest mode** — אין עדיין "סיכום יומי" לנמען; כל event = email נפרד. לשקול `notification_digest_mode` ב-`user_preferences`.
- **In-app notification center** — toast בלבד; אין UI היסטוריה של התרעות. מומלץ כ-Phase C.3 או כחלק ממודול `mo_notifications_center` כלל-מערכתי.
- **SMS/WhatsApp channel** — ה-channel field קיים אבל רק `email` ממומש.

### D.4 Next module — Phase C.3 Prompt (מוכן להזנק)

> **Mission:** DMS Phase C.3 — Advanced Collaboration: Comments, Mentions, and In-App Notification Center.
>
> **Scope:**
> 1. `dms_document_comments` migration (thread per document+version, mentions JSONB, resolved_at).
> 2. `@mention` autocomplete UI בתוך comments (resolve מול `mo_users` של החברה).
> 3. Mention → notification דרך הצינור הקיים (`dms-notifications.ts`).
> 4. `mo_notifications_center` — טבלה גלובלית, UI bell ב-header, mark-as-read, filter by type.
> 5. Digest mode ב-user preferences.
> 6. Wire `linked-entity owners` resolver (contracts, POs).
>
> **Definition of Done:** משתמש שעובד על Contract A מקבל in-app bell notification כש-user אחר mentiond אותו ב-comment על version חדש, ויכול לקפוץ ישר ל-doc+version מה-notification.

---

> **End of document.**
> **Next step:** review session עם founders + first customer; lock MVP boundary; start hiring W1 engineer.
