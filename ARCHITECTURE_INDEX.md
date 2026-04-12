# 🏗️ SYSTEM ARCHITECTURE & INDEX

## 📂 Directory Map
* `/app/(dashboard)/`: Main authenticated application space. This MUST contain its own `layout.tsx` utilizing `<TopNavBar>`.
* `/app/(external)/`: Standalone portals (no ERP sidebar) — e.g. subcontractor mobile portal.
* **Edge RBAC:** root `proxy.ts` → `lib/supabase/middleware.ts` — `/marker-ofek/*` requires session (internal ERP); `/subcontractor-portal` is a separate surface (`X-Marker-Ofek-Surface`); sensitive `/api/*` prefixes require auth at the edge.
* `/app/(dashboard)/marker-ofek/...`: Domain-specific business modules (Procurement, Execution, Finance).
* `/components/layout/`: Structural wrappers (e.g., `TopNavBar.tsx`, `DenseMasterDetailTemplate.tsx`).
* `/components/ui/`: Base Shadcn/Radix primitive components.
* `/supabase/migrations/`: Database schema and seed scripts.
* `/app/error.tsx` + `/app/global-error.tsx`: App Router error boundaries (RTL, enterprise-safe fallback UX).
* `/lib/marker-ofek/DATA_LAYER_INDEXING.md`: Suggested DB indexes and query patterns for large datasets (maps Zod/domain shapes to Prisma-style `@@index` notes before ORM migrations).

## 🧱 Phase 10 — Backend Integration (Supabase / PostgreSQL)
- **Decision:** `localStorage` is rejected for ERP business data; source of truth is PostgreSQL (Supabase).
- **Client infrastructure:** `lib/supabase/client.ts` (browser) + `lib/supabase/server.ts` (App Router server with `@supabase/ssr` cookies pattern).
- **Transition strategy:** Keep existing mock-data modules active and migrate feature-by-feature (Procurement, Finance, HR) to real DB fetches.
- **Environment contract:** project root `.env.example` defines required public Supabase variables (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`).

## 🤖 Phase 11 — AI OCR Document Automation (Magic Extract)
- **Mock OCR API:** `app/api/ocr/route.ts` — `POST` endpoint with simulated 2s AI latency; returns structured Delivery Note extraction (`supplierName`, `documentNumber`, `documentDate`, `lines[]` with matched `poNumber` and `quantity`).
- **Goods Receipt UX:** `components/marker-ofek/procurement/goods-receipt-workspace.tsx` — prominent RTL dropzone for PDF/Image upload, "AI Analyzing..." state with scan/bot visual feedback.
- **Auto-fill + verification:** OCR response populates PO/document/date/received quantities; AI-populated fields are tinted with "Needs Verification" cues before approval.

## 🛠️ The "Dense Master-Detail" Standard
All business screens must utilize the Master/Detail pattern:
1. **Master Panel (Top):** Key contextual data (Project, Supplier, Entity). Usually 3-4 columns wide, dense height.
2. **Tabs (Middle):** If a screen has multiple modes (e.g., Order Header vs. Order Lines), use `Tabs` to switch contexts without leaving the page.
3. **Detail Panel (Bottom):** Dense data grids (`Table`), highly interactive, full width.

### Interactive Master–Detail (mandatory)
Tables and grids are **not** decorative summaries. Every **data row** must be actionable:
- **Navigate:** Row click (or primary cell) must move the user to the **detail route** for that entity **or** set **shareable URL state** on the same page (`router.replace` / `<Link>`) so the row is the *master* selection for an editable detail panel.
- **Edit:** The detail view must bind to the real form model (RHF + Zod / server actions), not a read-only mock snapshot—unless the business rule is explicitly view-only (e.g. locked document), and even then the row must still **select** and **scroll** to that line.
- **Inputs inside rows:** Use `stopPropagation` on cells that contain inputs/buttons so typing does not trigger row navigation.
- **Shared query keys:** Use `lib/marker-ofek/master-detail-nav.ts` (`MD_QUERY`) for consistent `?e=`, `?line=`, `?worker=`, `?sku=`, etc., across modules.
- **Next.js:** Client components that call `useSearchParams()` must be rendered under a **`Suspense`** boundary in the parent `page.tsx` (see analytics and finance billing pages).

## 🧾 Marker Ofek — הזמנת רכש (PO Workspace)
- **Default create PO (Phase 2.1 engine):** `components/marker-ofek/procurement/purchase-order-engine-form.tsx` — ribbon, dual header cards (supplier/project + mock budget insights), line grid with notes and row actions, footer with subtotal / מע״מ / grand total.
- **Legacy BoQ flow:** `app/(dashboard)/marker-ofek/procurement/purchase-orders/from-boq/page.tsx` — full tender/BoQ integration; server actions remain under `purchase-orders/new/actions.ts`.

## 📇 Marker Ofek — קטלוג פריטים טכני (Master-Detail)
- **Workspace:** `components/marker-ofek/catalog/technical-catalog-workspace.tsx` — פיצול 40%/60% (רשת מאסטר / כרטיס פרטים), בחירת שורה, טאבים: זיהוי, ספקים מקושרים, MRP, תמחיר.
- **Mock data:** `lib/marker-ofek/technical-catalog-workspace-data.ts` — רשימת מאסטר + `getCatalogWorkspaceDetail(sku)` לפרטי ERP דמה.

## 📦 Marker Ofek — קליטת סחורה (GR) · Phase 2.2
- **Workspace:** `components/marker-ofek/procurement/goods-receipt-workspace.tsx` — סרט פעולות (טיוטה / אשר קליטה / צירוף תעודה), כרטיס הקשר (PO + תעודת משלוח + תאריך), רשת קליטה עם `useFieldArray` וולידציה חיה לשורה (תגיות סטטוס).
- **Route:** `app/(dashboard)/marker-ofek/procurement/goods-receipt/new/page.tsx`
- **Schema + mock POs:** `lib/marker-ofek/goods-receipt-schema.ts` (ייבוא תאימות: `lib/marker-ofek/goods-receipt-mock-data.ts`)

## 🦺 Marker Ofek — יומן עבודה יומי (Daily Log) · Phase 3.1
- **Workspace:** `components/marker-ofek/execution/daily-log-workspace.tsx` — סרט פעולות (טיוטה / שדר יומן למשרד / הוסף תמונות שטח), כרטיס הקשר (`bg-slate-50`: פרויקט + תאריך + מזג אוויר + הערות כלליות), טאבים: **כוח אדם** (`manpower`) / **הספקים ותפוקות** (`tasks`) עם `useFieldArray`.
- **Route:** `app/(dashboard)/marker-ofek/execution/daily-logs/new/page.tsx`
- **Schema + פרויקטים לדמה:** `lib/marker-ofek/daily-log-schema.ts`

## ⚠️ Marker Ofek — ניהול ליקויים (QA / Snag List) · Phase 3.2
- **Workspace:** `components/marker-ofek/execution/qa-defect-workspace.tsx` — סרט פעולות (טיוטה / פתח קריאה ושלח לקבלן — כפתור destructive / הוסף תמונות נזק), כרטיס הקשר (`bg-slate-50`: פרויקט, סוג ליקוי, חומרה + תג חומרה אדום ב־**קריטי** / **עוצר עבודה**), כרטיס פרטים: מיקום, קבלן משנה, תיאור.
- **Route:** `app/(dashboard)/marker-ofek/execution/qa-defects/new/page.tsx`
- **Schema + דמה:** `lib/marker-ofek/qa-defect-schema.ts` — פרויקטים וקבלני משנה לדמה.

## 💳 Marker Ofek — אישור חשבונות קבלנים (Three-way / QA) · Phase 4.1
- **Workspace:** `components/marker-ofek/finance/subcontractor-billing-workspace.tsx` — סרט פעולות (טיוטה / אשר חשבון לתשלום), כרטיס הקשר (`bg-slate-50`), באנר אזהרה כש־`hasOpenDefects(subcontractorId)` (דמה: **כהן חשמל**), רשת שורות עם סכום נדרש (קריאה בלבד) / סכום מאושר / הערות, שורת סיכום Claimed מול Approved.
- **Route:** `app/(dashboard)/marker-ofek/finance/subcontractor-billing/new/page.tsx` — טעינה עצלה (`next/dynamic`) + אותו skeleton; `useMemo` / `useCallback` במרחב העבודה.
- **Schema:** `lib/marker-ofek/subcontractor-billing-schema.ts` — `totalClaimedAmount` / `totalApprovedAmount` מחושבים ב־`transform`.
- **Phase 8.1 (ניכויים והוראות שינוי):** שדות בסיס: `retentionPercent` (ברירת 5%), `insurancePercent` (למשל 0.65%), `indexationAmount`, מערך `changeOrders` (`description`, `approvedAmount`). חישוב אוטומטי דרך `computeBillingDeductions` ב־`lib/marker-ofek/client-billing-schema.ts` → `retentionDeduction`, `insuranceDeduction`, `finalAmountToPay`. במרחב העבודה: בלוק «ניכויים והוספות» תחת הרשת (עיכבון/ביטוח באדום, סכום לתשלום בולט).

## 🏛️ Marker Ofek — חשבון יזם מצטבר (Client billing) · Phase 4.2 / 8.4
- **Workspace:** `components/marker-ofek/finance/client-billing-workspace.tsx` — סרט פעולות (טיוטה / **הפק חשבון סופי**), כרטיס הקשר (`bg-slate-50`) כולל עיכבון/ביטוח/התייקרויות, רשת BOQ (שורות אינטראקטיביות — `?line=` + גלילה ל־`cb-bill-line-*`), טבלת `changeOrders` (`useFieldArray`), בלוק «ניכויים והוספות» (פריטי 8.1), נעילת מסמך + מספר רשמי (`MB…‎`), כפתור **הדפס / ייצא ל-PDF** (`window.print()`).
- **Route:** `app/(dashboard)/marker-ofek/finance/client-billing/new/page.tsx` — טעינה עצלה (`next/dynamic`) + `billing-workspace-skeleton.tsx`; ב־RHF — `useMemo` / `useCallback` לטיוטה, הדפסה, הפקה והוספת הוראת שינוי.
- **Schema:** `lib/marker-ofek/client-billing-schema.ts` — `totalPeriodBillAmount`, `lineComputed`, `documentStatus` / `formalSerial`, `finalAmountToBill` ב־`transform`; `generateMockClientFormalSerialNumber` לדמה.
- **הדפסה A4:** `components/marker-ofek/finance/printable-client-billing-view.tsx` — «אופק מרקר יזמות בע״מ», סיכום BOQ / הוראות שינוי / ניכויים.

## 📈 Marker Ofek — אנליטיקה והנהלה (Executive BI) · Phase 9.1 / 9.3
- **Workspace:** `components/marker-ofek/analytics/executive-dashboard.tsx` — סרט פעולות («ייצא דוח חודשי כולל» — דמה), ארבעה KPI חברתיים (הכנסות / הוצאות / תזרים צפוי / ליקויים קריטיים), **תחזית תזרים 3 חודשים** (Recharts — צפי הכנסות / צפי הוצאות), **סטטוס פיננסי לפי פרויקט** עם Drill-Down (שורה נפתחת — פירוח חומרים / קבלני משנה / כוח אדם מול **תקציב בסיס פרויקט** ונתח תקציבי, חריגה באדום) | **התראות מנכ״ל** (חמש שורות דמה).
- **Mock data:** `lib/marker-ofek/executive-analytics-mock-data.ts` — פרויקטים עם `baselineBudget` + `costBreakdown[]`; `EXECUTIVE_MOCK_CASH_FLOW_FORECAST_3M` (צפי In/Out לחודש); פונקציות `computeExecutiveCompanyKpis`, `grossMarginPercentOnBilled`, `categoryBudgetUtilizationPercent`.
- **ביצועים (lazy + memo):** `next/dynamic` בדף האנליטיקה ובדפי כספים; גרף Recharts ב־`executive-cash-flow-chart.tsx` (מנותק מהדשבורד הראשי); skeletons — `executive-dashboard-skeleton.tsx`, `billing-workspace-skeleton.tsx`; בשורות הטבלה — `React.memo` + `useCallback` ל־Drill-Down.
- **Route:** `app/(dashboard)/marker-ofek/analytics/page.tsx`
- **ניווט:** בראש סעיף **לוח בקרה** ב־`marker-ofek-sidebar-nav-config.ts` — «אנליטיקה והנהלה (BI)» (אייקון `LineChart`).

## 🎛️ Marker Ofek — קוקפיט מנהל פרויקט (Control Room) · Phase 5.1
- **Workspace:** `components/marker-ofek/dashboard/project-control-room.tsx` — סרט עליון, ארבעה כרטיסי KPI (דמה), פיצול תחתון: ליקויים אחרונים / פעילות יומן בשטח.
- **Route:** `app/(dashboard)/marker-ofek/dashboard/page.tsx`
- **ניווט:** `lib/marker-ofek/marker-ofek-sidebar-nav-config.ts` — מקור אמת; `components/marker-ofek/marker-ofek-dual-pane-sidebar.tsx` מרנדר דינמית את כל הסעיפים; `MARKER_OFEK_CONTRACTING_NAV_SECTIONS` ב־`marker-ofek-sidebar-sections.tsx` נגזר מהקונפיג.

## 📋 Marker Ofek — הקמת פרויקט והצעת מחיר (Project + Tender) · Phase 8.3
- **Schema:** `lib/marker-ofek/project-schema.ts` — `projectSetupFormSchema` (קוד ‎PR…‎, לקוח, מנהל, סוג חוזה, תאריכים, סטטוס) + `tenderQuoteLineSchema` (סעיף, תיאור, יחידה, כמות, מחיר יחידה) ו־`totalQuoteAmount` ב־`transform`.
- **Workspace:** `components/marker-ofek/projects/project-setup-workspace.tsx` — פיצול דו-עמודתי (פרטי פרויקט | טבלת הצעת מחיר `useFieldArray`), סיכום **סה״כ הצעת מחיר**, שמירה דרך `createProject` (שם, לקוח, קוד פנימי, מכרז זוכה אופציונלי).
- **Route:** `app/(dashboard)/marker-ofek/projects/new/page.tsx`
- **ניווט:** סעיף **ניהול פרויקטים** ב־`marker-ofek-sidebar-nav-config.ts` — «הקמת פרויקט / מכרז» (אייקון `FolderKanban`).

## 📤 Marker Ofek — ניפוק ציוד לשטח (Material Issue) · Phase 5.2
- **Workspace:** `components/marker-ofek/execution/material-issue-workspace.tsx` — **אשר ניפוק**, כרטיס הקשר (`bg-slate-50`), רשת `useFieldArray` (מק״ט, תיאור, כמות, מיקום יעד).
- **Route:** `app/(dashboard)/marker-ofek/execution/material-issue/new/page.tsx`
- **Schema:** `lib/marker-ofek/material-issue-schema.ts`

## ⏱️ Marker Ofek — שעון נוכחות (Geo-mock) · Phase 7.2
- **Workspace:** `components/marker-ofek/execution/attendance-workspace.tsx` — כפתורי **כניסה** (ירוק) / **יציאה** (אדום), באנר מיקום דמה (עיר היין), טבלת פעילים: שם, כניסה, סטטוס מיקום, שעות, יציאה ידנית.
- **Route:** `app/(dashboard)/marker-ofek/execution/attendance/page.tsx`
- **Schema:** `lib/marker-ofek/attendance-schema.ts` — `attendanceClockSchema`, עובדים מ־`MOCK_WORKER_OPTIONS` (Phase 6.2), `LOCATION_STATUS_LABELS`.
- **ניווט:** תחת **ניהול ביצוע** ב־`marker-ofek-sidebar-nav-config.ts` (אייקון `Clock`).

## 📊 Marker Ofek — בקרת תקציב ורווחיות · Phase 6.1
- **Workspace:** `components/marker-ofek/finance/budget-control-workspace.tsx` — סרט פעולות (יצוא אקסל — דמה), בורר פרויקט, שלושה KPI (תקציב / עלות / תחזית רווח), טבלה צפופה: קטגוריה, תקציב, עלות, אחוז ניצול, חריגה.
- **Route:** `app/(dashboard)/marker-ofek/finance/budget-control/page.tsx`
- **Schema + דמה:** `lib/marker-ofek/budget-control-schema.ts` — קטגוריות: חומרים, קבלני משנה, כוח אדם, שונות; שדות: `budgetedAmount`, `actualCost`, `billedRevenue`.
- **ניווט:** פריט תחת «כספים וחשבונות» ב־`marker-ofek-sidebar-nav-config.ts`; המגירה (`marker-ofek-dual-pane-sidebar.tsx`) נטענת מהקונפיג.

## 🌐 Marker Ofek — פורטל קבלנים חיצוני (Subcontractor Portal) · Phase 7.1
- **Schema + דמה:** `lib/marker-ofek/portal-schema.ts` — קבלן דמה **כהן חשמל** (`sc-kohen-elec`), מערכי `PORTAL_OPEN_DEFECTS` (תואם Phase 3.2) ו־`PORTAL_RECENT_INVOICES` (תואם Phase 4.1), טופס `portalPaymentRequestSchema` (הערות אימות צד-שרת בקובץ — Zod בלקוח אינו מספיק).
- **Workspace:** `components/marker-ofek/portal/subcontractor-dashboard.tsx` — כותרת, שורת KPI (ליקויים פתוחים / חשבונות ממתינים), רשימת ליקויים עם «סמן כתוקן + העלה תמונה», טופס הגשת סכום לחודש.
- **Route:** `app/(external)/subcontractor-portal/page.tsx` — פריסה ב־`app/(external)/layout.tsx` (רקע לבן, ללא סרגל ERP / `DashboardShell`).
- **בידוד:** לא תחת `(dashboard)`; גישה ל־API פנימיים (Holden, רכש, צ'אט ERP וכו') חסומה ללא סשן ב־middleware; הרחבת RBAC לפי תפקיד — בשרת בלבד.

## 🔧 Marker Ofek — ניהול כלי עבודה (Asset Tracking) · Phase 6.2
- **Workspace:** `components/marker-ofek/logistics/asset-tracking-workspace.tsx` — סרט פעולות (**נפק כלי עבודה**), פיצול דו-עמודתי (RTL): טופס ניפוק (כלי זמין בלבד, עובד, תאריכים) / רשת כלים **בשימוש**, החזרה למחסן, איחור קל (amber) / איחור חמור ≥7 יום (red).
- **Route:** `app/(dashboard)/marker-ofek/logistics/asset-tracking/page.tsx`
- **Schema + דמה:** `lib/marker-ofek/asset-tracking-schema.ts` — `MOCK_ASSET_DEFINITIONS` (סטטוס `זמין`/`בשימוש`), `assetCheckoutFormSchema`, `seedActiveCheckouts`, `getEffectiveAssetStatus`, `daysPastDue`.
- **ניווט:** סעיף **לוגיסטיקה** ב־`lib/marker-ofek/marker-ofek-sidebar-nav-config.ts` (אייקון `Wrench`); המגירה נטענת מ־`MARKER_OFEK_SIDEBAR_SECTIONS`.

## 📄 Marker Ofek — מנוע הדפסה PDF ונעילת מסמך · Phase 8.2
- **Workspace:** `components/marker-ofek/finance/subcontractor-billing-workspace.tsx` — מצב **טיוטא** / **סופי**; **אשר חשבון לתשלום** מעביר ל־**סופי**, מפיק מספר רשמי דמה (`generateMockFormalSerialNumber`, לדוגמה `PC80000044`), ונועל את הטופס (`disabled` לכל השדות והוספת/מחיקת שורות); סרט **הדפס / ייצא ל-PDF** עם `Printer` → `window.print()`.
- **תצוגת הדפסה A4:** `components/marker-ofek/finance/printable-subcontractor-billing-view.tsx` — `PrintableSubcontractorBillingView` (alias `PrintableInvoiceView`): כותרת «לייטמן מערכות חשמל בע״מ», ח.פ ‎514638055, טבלאות גבולות בלבד (שורות חיוב, הזמנות שינוי, ניכויים); `hidden print:block` לעומת `print:hidden` על מרחב העבודה.
- **Schema:** `lib/marker-ofek/subcontractor-billing-schema.ts` — `generateMockFormalSerialNumber`, `statusLabelHe`, `SubcontractorBillingDocumentStatus`.

## 👥 Marker Ofek — ניהול שעות ושכר (HR / Payroll) · Phase 9.2
- **Workspace:** `components/marker-ofek/hr/timesheet-workspace.tsx` — סרט פעולות (אשר כל השעות / ייצוא CSV להנה״ח), כרטיס הקשר (בחירת חודש), רשת צפופה: שעות רגילות ונוספות, סך חודשי, סטטוס, אשר עובד; אזהרת ענבר/אדום מעל סף שעות חודשי.
- **Route:** `app/(dashboard)/marker-ofek/hr/timesheets/page.tsx`
- **Schema + דמה:** `lib/marker-ofek/hr-schema.ts` — עובדים מסונכרנים עם Phase 7.2 (`ATTENDANCE_MOCK_WORKERS`).

## 🔔 Marker Ofek — מרכז התראות (Global) · Phase 7.3
- **Component:** `components/marker-ofek/layout/notification-bell.tsx` — פעמון עם תג אדום (מונה לא נקרא), פאנל נפתח (אנימציה), רשימת התראות; לא נקרא — רקע `bg-sky-50/90`, נקרא — `bg-white`; לחיצה על שורה מסמנת כנקרא (דמה לוקאלי).
- **Schema + דמה:** `lib/marker-ofek/notification-schema.ts` — `Notification` (`type`: QA | BUDGET | LOGISTICS), `MOCK_NOTIFICATIONS`.
- **שילוב:** `NotificationBell` ב־`components/layout/TopNavBar.tsx` (שורת הכותרת הראשית; גם ב־`DashboardShell` דרך אותו `TopNavBar`).

## 🧭 Core navigation (Marker Ofek drawer)
- **Config (single source of truth):** `lib/marker-ofek/marker-ofek-sidebar-nav-config.ts` — כל הסעיפים (לוח בקרה, רכש, ביצוע, לוגיסטיקה, כספים, נתונים, מערכת).
- **Renderer:** `components/marker-ofek/marker-ofek-dual-pane-sidebar.tsx` (`MarkerOfekDrawerNavContent`) — ממפה `MARKER_OFEK_SIDEBAR_SECTIONS` ל־UI; נטען מ־`components/dashboard/dashboard-nav-drawer-panel.tsx` כש־`isMarkerOfekExecutiveContext(pathname)`.
- **Top header sync:** `components/marker-ofek/layout/header.tsx` — תפריטי עליונים (Dropdown) מבוססי אותו קונפיג (ללא השמטת סעיפים); מרונדר גלובלית מתוך `components/marker-ofek/workspace/marker-ofek-workspace-layout.tsx` כדי להבטיח חוויית ניווט אחידה בכל נתיבי `/marker-ofek/*`.
- **Active link:** `isSidebarNavItemActive` ב־`lib/infrastructure/navigation/sidebar-routes.ts` (התאמה לפי נתיב ללא query).
- **Empty portfolio:** `navItemHiddenWhenNoManagedProjects` ב־`lib/marker-ofek/project-scope.ts` — מסתיר רק נתיבים שתלויים בפרויקט (לא את כל המודולים לפי kill-switch).

## 🚨 AI Work Protocol
Before generating new features:
1. Check this index and `.cursorrules`.
2. Locate the existing module folder.
3. Apply the `DenseMasterDetailTemplate`.
