# Marker Ofek — System Index (Engineering Bible)

מסמך פנימי למיפוי דומיינים, נתיבים, ותלות מרכזית.  
**נתיבי אפליקציה קנוניים:** תחת `app/(dashboard)/marker-ofek/...` (עטיפת `DashboardLayout` + ספקים).

לרישום UX גלובלי (קיצורי מקלדת, חיפוש, תפריט הקשר) ראו גם `lib/marker-ofek/ux/marker-ofek-ux-registry.ts`.

---

## 1. מפת דומיינים (DDD לוגי)

| דומיין | נתיבי UI (Next) | רכיבי UI עיקריים | לוגיקה (`lib/marker-ofek/`) |
|--------|-----------------|------------------|-----------------------------|
| **Procurement** | `procurement/*`, `items/*`, `supply-chain/suppliers` | `components/marker-ofek/procurement/*` | `procurement/*`, `reconciliation-actions` (אם קיים), פורמטים |
| **Tenders** | `tenders/*`, `pre-construction/tender-pricing` | `components/marker-ofek/tenders/*`, `tenders-subnav` | `tenders/*` |
| **Projects / Execution** | `projects/*`, `execution/*`, `field-execution` | `components/marker-ofek/projects/*`, `execution/*` | `gantt-actions`, `project-execution-actions`, `wbs-*` |
| **Contracts & Billing** | `contracts/*`, `finance/contracts*`, `finance/partials`, `finance/contract-vault` | דפים + קליינטים תחת אותם נתיבים | `contract-*`, `partial-account-*`, `billing-*` |
| **Finance (זרימה)** | `finance/*` (חיוב, מרכזת, וכו׳) | דפים תחת `finance/` | `partner-metrics-actions`, חישובי חשבוניות |
| **Executive / שותפים** | `executive`, `partner-finance`, `partner-metrics` | `holding-executive-dashboard-client`, `partner-*-client` | `partner-metrics/*`, `access`, `effective-managing-partner-scope` |
| **Settings / מודולים** | `settings/*` | `module-manager-client`, `diamond-onboarding` | `module-registry`, `user-dashboard-config-actions` |
| **Meetings** | (אין מודול ייעודי מלא בקוד נכון לעכשיו) | — | הוספה עתידית: `app/(dashboard)/marker-ofek/meetings/` + `lib/marker-ofek/meetings/` |

**הערת ארכיטקטורה:** לא מעבירים את הנתיבים ל־`app/marker-ofek` מחוץ ל־`(dashboard)` בלי להעתיק את עטיפת ה־shell — הקבוצה `(dashboard)` נשארת נקודת העיגון ל־RBAC, סיידבר, וספקים.

---

## 2. שכבת Shell וגלובל

| קובץ | תפקיד |
|------|--------|
| `app/(dashboard)/layout.tsx` | אימות, `DashboardProviders`, `DashboardShell`, ספירת פרויקטים לסקופ |
| `components/dashboard-shell.tsx` | כותרת, `GlobalProjectSearch`, `MarkerOfekModuleHeaderActions`, Theme |
| `lib/marker-ofek/concierge-host.ts` | ברכת מארח (שעון ירושלים), שם פרטי מ־`profiles` / SSO |
| `components/dashboard-last-visit-tracker.tsx` | שמירת `last_visited_path` לכרטיס «ברוך שובך» במרכז הפיקוד |
| `components/dashboard-providers.tsx` | `MarkerOfekGlobalShortcuts`, Diamond, מודולים, גייטים |
| `components/app-sidebar.tsx` | אקורדיון מרקר אופק (סדר קבוצות מ־`MARKER_OFEK_CONTRACTING_NAV_SECTIONS`) |
| `app/(dashboard)/_components/sidebar.tsx` | סדר זהב: רכש → מכרזים → פרויקטים → חוזה וחשבונות → כספים → **מערכת** (מרכז מודולים / הנהלה) + שותפים |

**מינוח ארגוני (חברה / לא «קבלן»):** בממשק משתמש מעדיפים *חברה*, *חברות ביצוע* (במקום «קבלן» / «קבלן משנה») — white-label ושפה נייטרלית.

---

## 3. סכימה ורכש (PO / CEO)

| נושא | מיקום |
|------|--------|
| סטטוס `pending_ceo_approval`, עמודות `ceo_approval_required` | מיגרציה `20260401130000_po_ceo_approval_and_violations.sql` |
| יצירת PO עם דגל מנכ״ל | `procurement/purchase-orders/new/actions.ts` |
| **`is_ceo_approved` (generated)** | מיגרציה `20260404191000_purchase_orders_is_ceo_approved.sql` — true כשאין דרישת מנכ״ל או כש־`ceo_signed_at` מוגדר |
| **עלות פרויקט — מה נספר ברכש** | `po-cost-policy.ts` → `poRowCountsTowardCommittedSpend` (סטטוס + `is_ceo_approved`); `buildPartnerProjectRows`, תקציב, מגירת פרויקט, `billing-master-hub-data.ts` |
| סכום PO ממתין למנכ״ל (תצוגת הנהלה) | שאילתה נפרדת ב־`getHoldingExecutiveDashboard` — `pendingProcurementApprovalNis` |
| FK `supplier_items.supplier_id` → `entities.id` | `supabase/migrations/20260418143000_supplier_items_supplier_fk_entities.sql` + `NOTIFY pgrst` |
| רמז TypeScript ל־PostgREST | `types/supabase.ts` |

---

## 3ב. ביקורת (Audit)

| נושא | מיקום |
|------|--------|
| טבלה `mo_audit_logs` + טריגרים (PO, שורות PO, חשבוניות, חשבונות חלקיים) | `supabase/migrations/20260404190000_immutable_audit_logs.sql` |
| רישום ידני עם IP (משלים לטריגר) | `lib/marker-ofek/audit-log.ts` → `logMoAuditEvent` |

---

## 4. תפריט הקשר וחיפוש

רשימת משטחים מעודכנת ב־`MARKER_OFEK_UX_REGISTRY.contextMenu.tableSurfaces`.

פעולות טיפוסיות: שכפול / עריכה / מחיקה / קישור לקטלוג / היסטוריה (טוסט עתידי) / **סנכרון AI** (`contextMenuIcons.aiSync`).

---

## 5. סיור Diamond (360)

| קובץ | תפקיד |
|------|--------|
| `components/marker-ofek/diamond-onboarding.tsx` | דיאלוג, `prevStep` / `nextStep`, תוכן לפי תחנה |
| `lib/marker-ofek/diamond-path.ts` | מיפוי תחנה ↔ אינדקס סיידבר |

---

## 6 שמות קבצים (קונבנציה)

רכיבים ב־kebab-case: לדוגמה `asset-card.tsx` (לשעבר `AssetCard.tsx`). ייבוא: `@/components/marker-ofek/procurement/asset-card`.

---

## 7 הרחבות AI ללא שבירת זרימה

- כלי צ'אט: `app/api/chat/route.ts` + כלים תחת `lib/marker-ofek/ai/`.
- **Oracle פיננסי (עוזר AI):** `lib/marker-ofek/ai/marker-ofek-finance-chat-tools.ts` — עוטף `getHoldingExecutiveDashboard`, `getMoVatSummaryByProject`, תובנות עומס (`finance_project_overhead_insight`), והערכת ניכוי במקור (`computeWithholdingOnPayment` + `supplier_finance_profile` / `entities.default_withholding_tax_percent`). פעולות שרת מקור: `lib/marker-ofek/finance-reporting-actions.ts`, `lib/marker-ofek/partner-metrics-actions.ts`, `lib/marker-ofek/israeli-tax-helpers.ts`.
- מודולים חדשים: הוסיפו ענף ב־`lib/marker-ofek/module-registry.ts` + נתיב ב־`sidebar.tsx` + עמוד תחת `marker-ofek/<domain>/`.
- אל תסמכו על נתיבים קשיחים בלי קידומת `/marker-ofek` או בלי `pillar-registry` / סיידבר.

---

*עודכן אוטומטית במסגרת מעבר ארכיטקטורה — לעדכן בעת הוספת דומיין חדש.*
