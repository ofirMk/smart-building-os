# Smart Building OS — Deep System Briefing for Gemini

> **מטרת המסמך.** אתה (ג'מיני) מקבל כאן תמונת-עומק של פרויקט "Smart Building OS / מרקר אופק". המשתמש נעזר בך כדי **לחדד דרישות לפני שהוא מעביר אותן ל-Cascade (Claude)** שכותב את הקוד. אל תכתוב קוד — עזור לנסח, לזהות חוסרים, ולשבור משימות גדולות לצעדים קונקרטיים שתואמים את הארכיטקטורה הקיימת.
>
> מקור: עודכן 2026-06-01 על-בסיס `docs/SYSTEM_BOOK.md`, `docs/SYSTEM_INDEX.md`, מצב הקוד ב-`main`, וזיכרון Cascade.

---

## 1. מה זה Smart Building OS (TL;DR)

ERP אנכי לחברות **יזמות, בנייה, וניהול מבנים** בישראל, עם פריטי-מטרה מקבילים ל-Priority (חברת Medatech) אך מודרני, multi-tenant, ועם שכבת AI כראשונה-במחלקה. השם המסחרי הוא **"מרקר אופק" (Marker Ofek)**; המוצר חי תחת `/marker-ofek/*`. אורח-המוצר הוא **CEO/מנכ"ל של חברת בנייה** (לא רואה-חשבון, לא איש IT).

### דומיינים פעילים
1. **שרשרת רכש (Procurement)** — פריטים, ספקים, הזמנות רכש (PO), קבלות (GR), חשבוניות ספק (VI), RFQ/מכרזים.
2. **מכרזים (Tenders)** — מודול T1 + T12 Bid Leveling.
3. **חוזים וחשבונות (Contracts & Billing)** — חוזי מזמין/קבלן, חשבונות חלקיים, קיזוז חומר-גלם, change-orders (ת10ת).
4. **פרויקטים וביצוע (Execution)** — גנט, WBS, בקרה תקציבית, field execution.
5. **כספים (Finance)** — AR/AP, חשבוניות מס (T7), תקבולים, ניכוי במקור, מס"ב, התאמות בנקאיות, דוחות (PnL, תזרים, מע"מ, Aging), דשבורד T8.
6. **פורטפוליו הנהלה (Executive)** — God-View מרובה-פרויקטים (T10).
7. **Holden AI Copilot** — צ'אט-בוט פיננסי + סוכני CrewAI ברקע (T15).

---

## 2. סטאק טכנולוגי (חתימה מדויקת)

| שכבה | טכנולוגיה | גרסה (ב-`package.json`) |
|---|---|---|
| Framework | **Next.js 16.2.1** (App Router) | `=16.2.1` |
| UI | React 19.2.4 + TypeScript 5 + Tailwind v4 + shadcn + Base-UI + Radix | `react=19.2.4` |
| Form Engine | `react-hook-form` 7.72 + `zod` 4.3 (resolvers v5) | — |
| Tables | `@tanstack/react-table` 8.21 | — |
| Charts | `recharts` 3.8 | — |
| Drag/Drop | `@dnd-kit/*` 6/10 | — |
| Animation | `framer-motion` 12.38 | — |
| Gantt | `gantt-task-react` 0.3.9 (עם patch מקומי) | `patches/gantt-task-react+0.3.9.patch` |
| PDF | `@react-pdf/renderer` 4.3, `jspdf` 4.2, `pdf-parse` 2.4 | — |
| BE / DB | **Supabase** (Postgres 15 + RLS) | `@supabase/ssr` 0.9 |
| AI (TS) | `@google/generative-ai`, `@ai-sdk/openai`, `ai` 6.0 | — |
| AI (Python) | **FastAPI + CrewAI** (תיקייה `ai-worker/`) | — |
| Mobile | Capacitor 8 (Android/iOS) | — |
| Auth | Supabase Auth + Google SSO | — |
| Hosting | Vercel (Next.js) + Supabase Cloud | — |
| Testing | Vitest + Playwright | — |
| Monitoring | Sentry | — |

> **חוק קריטי** — קיים כלל גלובלי באגנט: *"This is NOT the Next.js you know — קרא מ-`node_modules/next/dist/docs/` לפני שכותבים קוד שתואם לגרסה 16"*. Server Actions חייבים `'use server'` רק על async exports.

### Repo metrics
- 6,340 קבצים מנוהלים ב-git
- 1,373 קבצי `.ts/.tsx`
- 284 מיגרציות SQL (`supabase/migrations/`)
- 4,338 קבצי `.md` (תיעוד כבד)
- 10 קבצי Python (תחת `ai-worker/`)

---

## 3. ארכיטקטורה (תרשים מילולי)

```
Browser
  │
  ▼
Next.js App Router  ←→  Supabase (Postgres + RLS + Storage + Auth)
  │  app/(dashboard)/marker-ofek/*  (172+ נתיבים)
  │  app/api/*                       (route handlers — canonical writes)
  │
  └─► HMAC POST ──► ai-worker (FastAPI)
                      │
                      ├─ CrewAI crews (gantt_risk, procurement, ...)
                      └─ Gemini / OpenAI tool-calls back to Supabase
```

### עטיפת ה-Shell
- `app/(dashboard)/layout.tsx` — Auth gate + `DashboardProviders` + `DashboardShell`.
- `components/dashboard-shell.tsx` — Workspace providers, top-nav actions slot, sidekick.
- `components/layout/top-navigation.tsx` — סרגל ניווט אופקי בסגנון Salient, RTL, mega-menu, כולל `CommandPaletteSearchTrigger` (⌘K).
- `app/(public)/*` — נתיבים ללא Auth (pitch למשקיעים, פורטל ספקים T14).

### Layout Invariants (חוקי-ברזל)
- אין גלילה גלובלית — רק `min-h-0` + `overflow-hidden` ב-shell, גלילה רק בתוך panes.
- Top-nav `h-16 shrink-0`.
- `data-layout-region` attributes לאיתור באגים ב-DevTools.
- מתועדים ב-`docs/architecture/layout-invariants.md`.

---

## 4. חוזי נתונים (Data Contracts) — קריטי

### 4.1 שני שמות-עולמות לטבלאות
| Prefix | מה זה | סטטוס |
|---|---|---|
| `erp_md_*` | **Master Data קנוני** (items, suppliers, supplier_items, payment_terms, ...) | ✅ קנוני |
| `erp_*` | **טרנזקציות עסקיות** (purchase_orders, goods_receipts, vendor_invoices, po_approvals, ...) | ✅ קנוני |
| `mo_*` | טבלאות specific ל-Marker Ofek (audit, comments) | ✅ קנוני |
| `ai_jobs`, `erp_ai_audit_log` | תור עבודות AI + לוג החלטות | ✅ קנוני |
| `items_catalog`, `supplier_items`, `supplier_item_prices`, `proc_*` | **DEPRECATED** | ⚠️ קריאה רק דרך adapter |

### 4.2 קונבנציה קריטית (multi-tenant)
- **`company_id text`** (NOT uuid) ב-`erp_*` — מצביע על `public.erp_companies(id)`.
- **לא** להחליף ל-uuid או ל-`public.companies`.
- RLS helper: `public.user_has_company_access(target_company_id text)` — מקבל text.
- **כל request חייב לשלוח** header `x-active-company-id` (אכיפה בצד ה-API).

### 4.3 ששת ה-Rules (`R1`–`R6`) מ-`canonical-data-contracts.md`
1. **R1 — Tenant isolation**: כל רשומה עם `company_id`.
2. **R2 — Canonical writes only**: UI כותב רק דרך APIs קנוניים.
3. **R3 — Legacy via adapter**: קריאה מ-DEPRECATED רק דרך adapter שממפה ל-canonical DTO.
4. **R4 — No duplication**: אסור ליצור טבלה/API כפול אם יש קנוני.
5. **R5 — RLS always**: כל טבלה חדשה מקבלת policy של `user_has_company_access`.
6. **R6 — Audit immutable**: כל שינוי עסקי משמעותי ל-`mo_audit_logs` (טריגר).

### 4.4 דפוסי קוד שחזיים על-עצמם
- **אין transactions ב-supabase-js רב-טבלאיים** → דפוס **"compensating delete"**: לדוגמה ב-`POST /api/procurement/orders` — insert header → insert lines → אם lines נכשלו, delete header.
- **חישובים פיננסיים = server-only**: `net = Σ(qty × unit_price)`, `vat = net × 0.17`, `gross = net + vat`. UI לא מחשב.
- **Project governance NOT NULL**: ב-`erp_purchase_orders` ו-`erp_purchase_order_lines` שדות `project_id`, `budget_sub_chapter`, `resource_id` הם **NOT NULL** — לא להרפות.
- **Zod v4**: אין יותר `invalid_type_error`; להשתמש ב-`message`.
- **Base UI Select**: `onValueChange` מחזיר `string | null` — תמיד null-guard.

---

## 5. מצב מודולים (יוני 2026)

### ✅ Live in production
| מודול | URL | קבצים מרכזיים |
|---|---|---|
| Command Center | `/marker-ofek/command-center` | — |
| Holden AI Copilot | `/marker-ofek/holden` | T15 |
| Portfolio (CEO God-View) | `/marker-ofek/portfolio` | T10 |
| Procurement Orders | `/marker-ofek/procurement/orders` | Phases 7.1–7.10 |
| Items Master | `/marker-ofek/items` (data grid + heavy editor) | Phase 6 |
| Tenders (Bid Leveling) | `/marker-ofek/procurement/tenders/compare` | T1 + T12 |
| Contracts Engine | `/marker-ofek/contracts-engine` | T2–T5 |
| Finance Dashboard | `/marker-ofek/finance/dashboard` | T8 |
| Tax Invoices (חשבוניות מס) | `/marker-ofek/finance/tax-invoices` | T7a/b/c |
| Cash-flow Forecast | `/marker-ofek/finance/cash-flow` | T6 (13-week) |
| Bank Reconciliation | `/marker-ofek/finance/bank-reconciliation` | — |
| Gantt (Execution) | `/marker-ofek/execution/gantt` + `/gantt/[id]` | — |
| WBS Planning | `/marker-ofek/projects/[id]/planning` | — |
| Cost Control Cockpit | `/marker-ofek/projects/[id]/cost-control` | T13 |
| Public Vendor Portal | `/public/...` magic-link | T14 |
| Investor Pitch | `/pitch` (public) | T17 |
| Command Palette ⌘K | global | T16 |

### 🟡 בעבודה / חלקי
- 8 טבלאות Onboarding (Priority alignment) — `docs/architecture/master-data-onboarding-plan.md`
- Form Engine generic (Pilot: Supplier Classifications)
- כרטיס פריט v2 — 4 שלבים בסגנון Priority
- Goods Receipt + 3-Way Match (Phase 7.9)
- Supplier Portal full (Phase 7.11)
- Approval engine UI (RPCs קיימים — חסר UI)

### 🔴 Backlog / חסום
- AI Copilot לכרטיס פריט (classify, translate, suggest)
- DMS owners-resolver מלא (תלוי ב-§3 חוזים)
- W2 subcontractor module (`pbc_*` tables)

---

## 6. שכבת AI

### TS side
- `app/api/chat/route.ts` — Vercel AI SDK 6.0, multi-model.
- `lib/marker-ofek/ai/marker-ofek-finance-chat-tools.ts` — Oracle פיננסי (tool-calls מנותבים ל-server actions פיננסיים: `getHoldingExecutiveDashboard`, `getMoVatSummaryByProject`, `computeWithholdingOnPayment`).
- `app/api/erp/ai/jobs` — POST עבודה לתור (HMAC-protected).

### Python side (`ai-worker/`)
- FastAPI + HMAC auth.
- CrewAI crews: `gantt_risk_crew.py` ועוד.
- `tools/supabase_gantt_tool.py` — קריאות חזרה ל-Supabase.
- מאגד `pgvector` (מיגרציה `20260801130000_ai_platform_foundations.sql`).

### Smart Pricing & Approvals (Phase 7.5–7.7)
- `erp_md_company_settings` — thresholds דינמיים פר-חברה (3% Rule, 5% Rule, urgency, feature-flags).
- RPCs: `erp_compute_price_suggestions`, `erp_compute_line_deviation`, `erp_resolve_approval_chain`, `erp_decide_approval`, `erp_evaluate_trigger_expr` (DSL evaluator לחוקי-אישור).
- `erp_ai_audit_log` — tokens/cost/reasoning/decision-tier.
- `erp_po_revisions` + `erp_po_change_log` — snapshot + field-level diff.

---

## 7. תיעוד מערכת (איפה לחפש)

| מסמך | מה בו |
|---|---|
| `docs/SYSTEM_BOOK.md` | **אינדקס-על** — קריאת חובה בכל סשן חדש |
| `docs/SYSTEM_INDEX.md` | מפת דומיינים + נתיבי UI + קונבנציות |
| `docs/architecture/canonical-data-contracts.md` | **ה-Data Bible** — מקור-אמת לטבלאות, APIs, deprecations |
| `docs/architecture/layout-invariants.md` | חוקי הפריסה (no global scroll, h-16, וכו') |
| `docs/architecture/master-data-onboarding-plan.md` | תוכנית 8 טבלאות Onboarding |
| `docs/architecture/items-schema-gap-analysis.md` | פערי schema ישן→חדש |
| `docs/procurement/po-module-spec.md` | מפרט מודול הזמנות רכש (חי) |
| `docs/procurement/po-field-reference.md` | רישום כל העמודות/RPCs/endpoints |
| `docs/MARKER_OFEK_HANDBOOK.md` | התקנה, env vars, סדר הרצת SQL, troubleshooting |
| `docs/ingested-specs/medatech-contracts-module.md` | פרק §3 של DOCX ל"טמן (חוזים) |
| `docs/ingested-specs/medatech-priority-project-module.md` | פרקים §5+§6 (פרויקטים + בקרה תקציבית) |
| `docs/ingested-specs/priority-defining-a-part-sop.md` | Priority SOP — הגדרת פריט |
| `docs/decisions/<YYYY-MM-DD>-<name>.md` | יומן החלטות append-only |

---

## 8. סטייל-עבודה מצופה (חוקי Cascade)

כאשר אתה (ג'מיני) עוזר לנסח דרישה ל-Cascade, התאם לחוקים הבאים שהמשתמש כפה עליו:

1. **Minimal upstream fixes** — לא over-engineering. שינוי שורה אחת אם מספיק.
2. **Root cause first** — לאתר את הבאג במעלה הזרם, לא לעטוף ב-workaround.
3. **Tests before major impl** — לעצב/לעדכן בדיקות לפני שינוי משמעותי.
4. **Never weaken tests** — בלי הוראה מפורשת.
5. **Comments only if asked** — Cascade לא מוסיף הערות מיוזמתו.
6. **Direct, terse responses** — בלי "great idea!" / "you're right!".
7. **No new files unless necessary** — לא ליצור `.md` חדשים סתם.
8. **Verify before assert** — אסור הצהרות לא-מבוססות (פונקציות שלא קיימות).

---

## 9. חוב טכני ידוע

| חוב | היכן | חומרה |
|---|---|---|
| שתי מערכות Command Palette מקבילות (`components/dashboard/command-palette` + `components/layout/command-palette`) | dashboard-shell + dashboard layout | בינוני — לאחד |
| `currencies` + `erp_currencies` כפילות | DB | בינוני — לאחד |
| `items_catalog` legacy עדיין חי לצד `erp_md_items` | DB | נמוך — adapter קיים |
| `app/(dashboard)/marker-ofek/customers/`, `suppliers/` ריקים | FS | מבלבל — לנקות |
| `procurement-v2/` קיים לצד `procurement/` | FS | לבדוק אם רלוונטי |
| `holden/` ו-`holden-erp/` חיים במקביל | FS | לבדוק consolidation |
| חוסר Form Engine generic — כל מסך מאסטר-דאטה כותב את הטופס ידנית | רוחב | גבוה — pilot מתוכנן |
| כפל פיצ'ר בין `decisions/` ל-`SYSTEM_BOOK.md` (status drift) | docs | נמוך |

---

## 10. איך לעזור לי לנסח דרישה ל-Cascade

כשאתה (ג'מיני) מקבל ממני תיאור פיצ'ר חדש, **תמיד** הוסף לפני שתשלח לי בחזרה:

### Checklist לדרישה מוכנה ל-Cascade
- [ ] **לאיזה דומיין** שייך? (Procurement / Tenders / Contracts / Finance / Projects / Executive / Holden / Admin)
- [ ] **נתיב UI מדויק** — `/marker-ofek/<path>` (ולוודא שאין כפילות לדף קיים)
- [ ] **טבלאות מעורבות** — חייבות להיות מ-`erp_md_*` / `erp_*` / `mo_*`. אם חסרה טבלה — מיגרציה אדיטיבית חדשה.
- [ ] **`company_id text` ו-`x-active-company-id`** — נכללו?
- [ ] **RLS policy** — האם הטבלאות החדשות מקבלות `user_has_company_access`?
- [ ] **חישובי כסף** — שרת בלבד? מע"מ 17%?
- [ ] **Audit** — האם השינוי עסקי-משמעותי וצריך `mo_audit_logs`?
- [ ] **API קנוני** — האם הנתיב הוא `/api/master-data/*` או `/api/erp/*` או `/api/procurement/*` (לא להמציא חדש)?
- [ ] **Form?** — `react-hook-form` + `zod` (גרסה 4, `message` לא `invalid_type_error`).
- [ ] **Top-nav exposure** — האם הפיצ'ר נחשף ב-`components/layout/top-navigation.tsx` (Transparent Navigation Rule — אין מודולים URL-only).
- [ ] **תלות במודולים אחרים** — האם תלוי במשהו ב-Backlog/חסום?
- [ ] **AI?** — אם כן: דרך תור `ai_jobs` או דרך `app/api/chat/route.ts` (Vercel AI SDK)?
- [ ] **בדיקות** — Vitest unit ו/או Playwright e2e? איזה תרחיש?
- [ ] **מסמכים לעדכן** — `SYSTEM_INDEX.md` / `canonical-data-contracts.md` / `docs/decisions/`?

### דוגמה לדרישה "מוכנה"
> **לא טוב**: "תוסיף מסך לשלוח מייל לספק"
>
> **טוב**: "ב-`/marker-ofek/procurement/orders/[id]` הוסף כפתור 'שלח לספק'. הכפתור יוצר רשומה ב-`erp_po_outbound_emails` (טבלה חדשה — מיגרציה אדיטיבית, `company_id text`, RLS, FK ל-`erp_purchase_orders.id`), קורא ל-API חדש `POST /api/procurement/orders/[id]/send` שמייצר PDF דרך `@react-pdf/renderer` (כמו ב-T7b), שולח דרך `googleapis` (כבר ב-deps), מתעד `mo_audit_logs`, ומחזיר 201. השתמש ב-`react-hook-form` + `zod` לטופס הקדם-שליחה (To/Cc/Subject/Body). חשוף את הכפתור גם ב-mega-menu של 'בנייה → שרשרת רכש'. בדיקת Playwright: שליחת מייל עבור PO סטטוס APPROVED."

---

## 11. דברים שהמערכת *לא* עושה (כדי לא להמציא לי משהו לא רלוונטי)

- ❌ **לא** מודול מלאי (Inventory) — מחוץ ל-scope (פרק §4 של ל"טמן נדחה).
- ❌ **לא** HR מלא — יש שלד בלבד (`hr/`).
- ❌ **לא** CRM/Sales — `sales-orders/`, `customers/` ריקים.
- ❌ **לא** Mobile-first עדיין — Capacitor מותקן אבל המסכים desktop-first; יוצא מן הכלל: פורטל ספקים T14.
- ❌ **אין** Server Actions בלי `'use server'` על async exports (Next 16 strict spec).
- ❌ **אין** כפילות של command palette (יש שתיים בקוד — לאיחוד).
- ❌ **לא** מודול הנהלת חשבונות מלא (חיבור ל-`Priority`/`Hashavshevet` הוא future work).

---

## 12. שפה ומונחים

- **חברה** (לא "קבלן") — שפה ניטרלית/white-label.
- **חברות ביצוע** (לא "קבלני משנה").
- **כרטיס פריט** (לא "פריט") — מסך master של `erp_md_items`.
- **קוקפיט פרויקט** = Cost Control Cockpit.
- **Bid Leveling** = השוואת הצעות מקבלני משנה.
- **3% Rule** = סף סטיית מחיר שמדליק escalation אוטומטי.
- **Holden AI** = שם הקופיילוט (לא "AI Assistant").
- **Diamond Sidekick** = פאנל-יד-ימין המוטבע ב-shell.

---

## 13. תכלית — איך תעזור לי באמת

1. **כשאני זורק לך רעיון** — שאל אותי את ה-Checklist בסעיף 10 לפני שתכתוב לי תיאור גמור.
2. **כשאני מבולבל איפה משהו נמצא** — הצלב את המידע מסעיף 5 + 7.
3. **כשאני שואל "האם זה כבר קיים?"** — חפש בסעיפים 5+11 לפני שתגיד "כן/לא".
4. **כשאני רוצה לשבור פיצ'ר גדול לפאזות** — דמה את הפאזות 7.1→7.10 של Procurement כתבנית: מיגרציות אדיטיביות → API קנוני → UI מינימלי → AI/automation layer מעליו.
5. **אל תציע** ל-Cascade ליצור קבצי `.md` חדשים אלא אם זה מסמך החלטה (`docs/decisions/`).
6. **אל תציע** ל-Cascade להריץ פקודות הרסניות (`DROP`, `DELETE FROM` בלי WHERE, `rm -rf`).
7. **תזכיר לי** שאם המשימה נוגעת ב-Next.js 16 — Cascade צריך לקרוא קודם ב-`node_modules/next/dist/docs/`.

---

*מסמך זה מסונכרן ל-2026-06-01. עדכן בכל merge משמעותי לארכיטקטורה.*
