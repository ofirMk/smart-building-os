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

## 2ב. הפצת Master Data (Marker Ofek Rollout)

| נושא | מיקום |
|------|--------|
| **תוכנית הפצה 4-שלבית** (Shadow → Read-Only → Pilot → GA) | `docs/architecture/rollout-plan-master-data.md` |
| Focus Mode (env flag, סינון תפריט בלבד) | `lib/marker-ofek/focus-mode.ts` + `decisions/2026-04-26-focus-mode-launch-strategy.md` |
| **Bulk Import (CSV)** של מק״טים — Stage 1 critical tool | `app/(dashboard)/marker-ofek/items/import/` + `app/api/master-data/items/bulk-import/route.ts` |
| כרטיס פריט מלא (Priority Stage A — 10 שדות) | `app/(dashboard)/marker-ofek/items/new/priority-item-form-client.tsx` |
| FP-safe decimal pipe (conversion_factor, price) | `lib/erp/master-data-api.ts` → `sanitizeDecimalString` |
| Project-scoped flag — דחיה מנומקת | `decisions/2026-04-26-project-scoped-flag-deferred.md` |
| Sunset של `items_catalog` הישן (trigger 1-way → drop) | `decisions/2026-04-26-sunset-legacy-items-catalog.md` |
| Performance indexes (cheapest-supplier, preferred) | `supabase/migrations/20260428_supplier_items_perf_indexes.sql` |
| **F2 Drill-Down (Priority parity)** — hook + LookupField + Sheet + QuickCreate forms | `lib/marker-ofek/hooks/use-f2-listener.ts`, `components/marker-ofek/forms/`, `components/marker-ofek/master-data/quick-create-*.tsx` |
| **Layout Invariants** (אין גלילה גלובלית, Flexbox סטרילי, חוקי-rem) | `docs/architecture/layout-invariants.md` + `data-layout-region` ב-`app/layout.tsx` ו-`components/dashboard-shell.tsx` |
| **Top Navigation** (Salient-style, h-16, RTL, mega-menu לבנייה) | `components/layout/top-navigation.tsx` — מקור-אמת יחיד למבנה התפריט (NAV_ITEMS). בנייה → שרשרת רכש → כרטיס פריט |
| **Vendor Catalog Pricing (Phase 5)** — מחירי ספקים על פריט: API קנוני (`erp_md_suppliers` / `erp_md_supplier_items`, RLS tenant-isolation, אכיפת `x-active-company-id`), טאב "מחירי קניה אפשריים" עם refetch ריאקטיבי, מודל הזנה מהיר עם `react-hook-form` + `zod` + Switch + חישוב נטו ב-`useMemo`. **Render-prop ב-`SelectValue`** של Base UI להצגת `${supplierNum} · ${name}` במקום UUID. שתילת ספקי דמה (PLAS/CHUL/TAMB) למניעת state חסום בענף בנייה. | `app/api/master-data/suppliers/`, `app/api/master-data/supplier-items/`, `components/marker-ofek/items/heavy-item-master-screen.tsx`, `components/marker-ofek/items/add-supplier-price-modal.tsx`, `supabase/migrations/20260729120000_seed_marker_ofek_demo_suppliers.sql` |
| **Items Data Grid — חדר הבקרה (Phase 6)** — עמוד נחיתה Master-Detail במודול הפריטים: טבלה ראשית עם חיפוש client-side, Badge סטטוס צבעוני (5 גוונים), עמודות `סטטוס/מק"ט/תיאור/משפחה/UOM`. Drill-down state-based ל-`HeavyItemMasterScreen` עם `initialSelectedId` / `initialOpenCreate` / `onBack`. ה-API `/api/master-data/items` הורחב להחזיר `productFamily.familyName` + `uomDescription` (lookup ל-`units_of_measure` עם דה-דופ גלובלי↔פרטי). | `app/api/master-data/items/route.ts` (GET enriched), `components/marker-ofek/items/items-data-grid.tsx`, `components/marker-ofek/items/heavy-item-master-screen.tsx` (props), `app/(dashboard)/marker-ofek/items/page.tsx` (state-machine) |
| **Supplier Pricing CRUD (Phase 6.2)** — מודל דו-תכליתי `AddSupplierPriceModal` (POST ליצירה / PUT לעריכה). במצב עריכה השדות `supplierId` + `supplierSku` מוקפאים (uniqueness של `(item, supplier, supplier_sku)`). עמודת Actions בטבלת המחירים: ✏️ Pencil לעריכה, 🗑️ Trash2 למחיקה עם `window.confirm`. ה-API `PUT/DELETE /api/master-data/supplier-items/[id]` קיים מראש עם RLS. סוגר את ה-CRUD המלא של מודול הפריטים. | `app/api/master-data/supplier-items/[id]/route.ts`, `components/marker-ofek/items/add-supplier-price-modal.tsx` (`SupplierPriceEditDto`, `editingItem` prop), `components/marker-ofek/items/heavy-item-master-screen.tsx` (Actions column, `handleDeletePrice`) |
| **Procurement Orders Landing (Phase 7.1)** — מסך נחיתה Data Grid להזמנות רכש. משתמש ב-`erp_purchase_orders` + `erp_purchase_order_lines` הקנוניים מ-`20260627110000_erp_procurement_bpm_engine.sql` (RLS דרך `user_has_company_access`). API חדש `/api/procurement/orders` עם GET שעושה JOIN ל-`erp_md_suppliers` להצגת שם ספק. ניווט: "בנייה → שרשרת רכש → הזמנות רכש". | `app/api/procurement/orders/route.ts`, `app/(dashboard)/marker-ofek/procurement/orders/page.tsx`, `components/layout/top-navigation.tsx` (NAV_ITEMS) |
| **Procurement Orders Create (Phase 7.2)** — זרימת יצירת הזמנת רכש מלאה (Master-Detail). 3 מיגרציות הוסיפו לסכמה: (1) שדות פיננסיים `currency`, `total_amount_net/vat/gross` ב-`erp_purchase_orders`. (2) FK חדש `item_id`→`erp_md_items` ב-`erp_purchase_order_lines` (במקום ה-FK הישן ל-`erp_items` legacy של Holden). (3) שיחזור governance — שמירה על `project_id`/`budget_sub_chapter`/`resource_id` כ-NOT NULL (לא הרפיה). `POST /api/procurement/orders` מחשב נטו/מע"מ 17%/ברוטו בשרת, מייצר `po_number` ייחודי, מבצע compensating-delete של ה-header אם שורות נכשלות. הטופס משתמש ב-`react-hook-form` + `useFieldArray` + `useWatch`. **Auto-pilot**: בחירת פריט → ממלא אוטומטית `budget_sub_chapter`+`resource_id` מהפריט; בחירת ספק+פריט → טוען מחיר מ-`/api/master-data/supplier-items` ומאכלס `unit_price` (cache פנימי למניעת בקשות חוזרות). | `supabase/migrations/20260730120000_po_financial_breakdown_columns.sql`, `supabase/migrations/20260730130000_po_simple_flow_columns.sql`, `supabase/migrations/20260730140000_po_restore_project_governance.sql`, `app/api/procurement/orders/route.ts` (POST), `app/(dashboard)/marker-ofek/procurement/orders/new/page.tsx` |
| **Procurement Smart Pricing + AI Foundations (Phases 7.4–7.10, 2026-08-01)** — 7 מיגרציות אדיטיביות שהעבירו את מודול הרכש מ-MVP לרמת ERP מוסדית עם תשתית AI מלאה. **7.4.0 AI Platform**: `pgvector` + `erp_md_company_settings` (thresholds דינמיים פר-חברה: 3%/5%/urgency/feature-flags) + הרחבת `ai_jobs` (priority/attempts/idempotency/scheduled_at) + `erp_ai_audit_log` (tokens/cost/reasoning/decision-tier). **7.4 Line Enrichment**: header קיבל `urgency_level`/`urgency_justification`/`ai_negotiation_status`/`po_total_deviation_pct`/`requires_po_escalation`; שורות קיבלו `supply_date`/`discount_pct`/`line_currency`/`exchange_rate`/`price_source`/`manufacturer_name`/`requires_escalation`/`escalation_justification`/`escalation_category`/`price_deviation_pct`/`alternative_*`. **7.4.5** `erp_md_supplier_item_mapping` — גשר Supplier-SKU↔Master-SKU עם versioning זמני + review-queue. **7.5 Smart Pricing**: `erp_po_approved_exceptions` (זיכרון חריגות) + RPCs `erp_compute_price_suggestions` / `erp_compute_line_deviation` + endpoint `/api/procurement/pricing/suggestions` + POST `/api/procurement/orders` מורחב — מחשב deviation פר-שורה דרך RPC, אוכף `escalationJustification+Category` כשה-3% Rule נפרץ, מחשב PO-total deviation משוקלל, תומך ב-urgency governance. **7.6**: `erp_po_attachments` + `body_html*` + `erp_md_item_assets` (נכסים גלובליים של Master SKU — datasheets, תמונות, תווי תקן SII — עם authority-chain priority). **7.7 Approval Engine**: enum `PENDING_APPROVAL` + 4 RPCs (`erp_evaluate_trigger_expr` DSL evaluator, `erp_resolve_approval_chain`, `erp_submit_po_for_approval`, `erp_decide_approval`). **7.8 Audit Trail**: `erp_po_revisions` (snapshot header+lines+approvals) + `erp_po_change_log` (field-level) + טריגר גנרי על `erp_purchase_orders` + `erp_create_po_revision_snapshot` RPC. **7.10 Scaffolds**: `AI_JOB_TYPE.SEMANTIC_MATCHER`/`DATA_ENRICHMENT`/`RFQ_AGENT` ב-`lib/ai/jobs/schemas.ts` + README ב-`ai-worker/crews/procurement/`. | `supabase/migrations/20260801130000…20260801190000_*.sql` (7 files), `lib/procurement/pricing.ts`, `app/api/procurement/pricing/suggestions/route.ts`, `app/api/procurement/orders/route.ts` (POST extended), `lib/ai/jobs/schemas.ts`, `ai-worker/crews/procurement/README.md`, `docs/procurement/po-module-spec.md` §7, `docs/procurement/po-field-reference.md` |

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
