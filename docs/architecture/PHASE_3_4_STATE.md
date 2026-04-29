# Architecture Snapshot — Phase 3 & 4 State
> Last updated: 2026-04-26 | `npx tsc --noEmit` → Exit Code 0

---

## 1. Canonical API Routing (`/api/erp/`)

### עקרון המבנה

כל ה-API Routes ציבוריים של ה-ERP חיים **אך ורק** תחת `/api/erp/`. אין route פונקציונלי מחוץ לפרפיקס זה (למעט webhooks מוצהרים כמו `/api/cron` ו-`/api/ocr-invoice`).

```
app/api/
├── erp/
│   ├── master-data/
│   │   ├── suppliers/          ← GET, POST (+ [id]/ GET, PUT, DELETE)
│   │   ├── items/              ← re-export → /api/master-data/items/
│   │   ├── product-families/   ← re-export → /api/master-data/product-families/
│   │   └── supplier-items/     ← re-export → /api/master-data/supplier-items/
│   ├── procurement/
│   │   ├── purchase-orders/
│   │   ├── goods-receipts/
│   │   └── vendor-invoices/
│   ├── projects/               ← re-export → /api/projects/  (+ [id]/, [id]/versions/)
│   ├── contracts/              ← re-export → /api/contracts/ (+ [id]/, lines/, workflow/, report-email/)
│   ├── client-contracts/
│   ├── holden/
│   │   ├── intent/             ← POST: Holden ERP NL intent parsing
│   │   └── import-supplier-catalog/ ← POST: CSV catalog import
│   └── ai/
│       └── jobs/               ← POST: AI Agent Webhook Gateway
├── master-data/                ← SOURCE OF TRUTH (לוגיקה כאן)
├── contracts/                  ← SOURCE OF TRUTH
└── projects/                   ← SOURCE OF TRUTH
```

### כלל ה-Re-Export

Routes ב-`/api/erp/X/` שהם re-exports מממשים תבנית אחידה:

```typescript
// app/api/erp/master-data/items/route.ts
export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export { GET, POST } from "@/app/api/master-data/items/route"
```

מטרה: הפרדת URL namespace קנוני מהמיקום הפיזי של הלוגיקה.

### Route Protection — שכבות

| שכבה | מנגנון | מה מגן |
|---|---|---|
| **Middleware** | `isSensitiveInternalApiPath()` | `/api/erp/holden/*` — redirect לlogin אם אין session |
| **Route Handler** | `requireMasterDataApiContext()` | כל routes של master-data — 401 ישיר |
| **Supabase RLS** | Policy per table | הגנת DB — אי אפשר לקרוא נתוני חברה אחרת |

### Routes שנמחקו (Legacy — Phase 2)

| Route שנמחק | מה החליף אותו |
|---|---|
| `/api/suppliers/` | `/api/erp/master-data/suppliers/` |
| `/api/purchase-orders/submit/` | `/api/erp/procurement/purchase-orders/` |
| `/api/holden-erp/intent/` | `/api/erp/holden/intent/` |
| `/api/holden-erp/import-supplier-catalog/` | `/api/erp/holden/import-supplier-catalog/` |

---

## 2. AI Jobs — זרימת נתונים מלאה

### Sequence Diagram

```
סוכן AI חיצוני (Dify / Flowise)
    │
    │  POST /api/erp/ai/jobs
    │  { type, payload, company_id }
    │
    ▼
┌─────────────────────────────┐
│  Middleware Auth Check      │
│  → redirect to login if no  │
│    valid Supabase session   │
└──────────────┬──────────────┘
               │ session valid
               ▼
┌─────────────────────────────┐
│  Route Handler              │
│  1. getUser() — Supabase    │
│  2. validate body fields    │
│  3. check company_id vs     │
│     active session cookie   │
│  4. INSERT → ai_jobs table  │
│     status: 'accepted'      │
└──────────────┬──────────────┘
               │
               ▼
┌─────────────────────────────┐
│  ai_jobs (Supabase table)   │
│  ┌──────────────────────┐   │
│  │ id: uuid (PK)        │   │
│  │ company_id: text     │   │  ← RLS: user_has_company_access()
│  │ created_by: uuid     │   │
│  │ type: text           │   │
│  │ payload: jsonb       │   │  ← AiJobPayloadSchema (see §3 schemas)
│  │ status: accepted     │   │
│  │   → processing       │   │  ← עתידי: queue worker יעדכן
│  │   → done / failed    │   │
│  │ result: jsonb        │   │  ← AiJobResultSchema
│  │ error_message: text  │   │
│  └──────────────────────┘   │
└──────────────┬──────────────┘
               │
               ▼
    { ok: true, status: 'accepted', job_id: uuid }
    ← חוזר לסוכן מיידית (async pattern)

─────────────────────────────────────────
  עתידי: Background Worker (Phase 5)
─────────────────────────────────────────
    Supabase Edge Function / cron job
    │  polls ai_jobs WHERE status='accepted'
    │  → status = 'processing'
    │  → runs analysis
    │  → UPDATE ai_jobs SET status='done', result=...
```

### Status Flow

```
accepted → processing → done
                      ↘ failed (+ error_message)
```

### RLS Policies

```sql
-- SELECT: user may only see their company's jobs
CREATE POLICY "ai_jobs: select own company"
  ON public.ai_jobs FOR SELECT
  USING (public.user_has_company_access(company_id));

-- INSERT: same guard
CREATE POLICY "ai_jobs: insert own company"
  ON public.ai_jobs FOR INSERT
  WITH CHECK (public.user_has_company_access(company_id));
```

---

## 3. Graceful Degradation — `runAiSafe`

### הבעיה שנפתרה

לפני Phase 3: כישלון Gemini (timeout / quota / שגיאת רשת) הפיל את ה-Server Action ולקוח קיבל 500.

### הפתרון — שכבות הגנה

```
Server Action
    │
    │ try { ... } catch (e) { return { ok: false, error } }  ← שכבה 1: כל action
    │
    ▼
Service function (lib/)
    │
    ▼
geminiGenerateJsonFromText() / geminiGenerateJsonFromInlineFile()
    │
    │ try { generateContent(..., { timeout: 60_000 }) }      ← שכבה 2: timeout + catch
    │ catch → throw new GeminiCallError(message, cause)      ← typed error
    │
    ▼
Google Generative AI SDK
```

### API — `lib/marker-ofek/ai/shared/gemini-json.ts`

```typescript
// שגיאה מדויקת — מאפשרת לזהות כשל AI בנפרד מכשל עסקי
class GeminiCallError extends Error {
  readonly isAiError = true
}

// timeout מובנה בכל קריאת generateContent
const AI_CALL_TIMEOUT_MS = 60_000

// utility לכל Server Action שרוצה fallback מובנה
async function runAiSafe<T>(
  fn: () => Promise<T>
): Promise<{ ok: true; data: T } | { ok: false; aiError: string; fallback: true }>
```

### דוגמת שימוש

```typescript
const result = await runAiSafe(() =>
  geminiGenerateJsonFromText({ prompt: riskPrompt })
)
if (!result.ok) {
  // AI לא זמין — מחזירים fallback בטוח, המשתמש רואה אזהרה קלה
  return { ok: false, aiWarning: result.aiError, risks: [] }
}
const risks = parseRiskSchema(result.data)
```

### Server Actions מוגנים (14+)

- `gantt-actions.ts` — try/catch + WBS rule-based fallback
- `vault-actions.ts` — fire-and-forget AI: `void ingestion().catch(() => {})`
- `project-wall-actions.ts` — AI fallback → `classifyProjectWallCategoryFromKeywords()`
- `workspace-efficiency-actions.ts` — nested try/catch על `generateObject`
- `meeting-intel-actions.ts` — try/catch + רישום "failed" ב-DB
- `tender-ai/boq/invoice-ai actions` — try/catch מקיף

---

## 4. מפת ה-Middleware Protection

**קובץ**: `lib/supabase/middleware.ts`

```
/api/erp/holden/*      → isSensitiveInternalApiPath → redirect to login
/api/ocr-invoice       → isSensitiveInternalApiPath
/api/hr/**             → isSensitiveInternalApiPath
/api/chat              → isSensitiveInternalApiPath

/marker-ofek/**        → isProtectedPath → auth required
/admin/**              → isProtectedPath
/api/erp/**            → isProtectedPath (via master-data auth context)
```

---

## 5. Phase 4 — הכנה לסוכנים (Next Steps)

| משימה | תיאור | קדימות |
|---|---|---|
| **Background Worker** | Supabase Edge Function שמעבדת `ai_jobs WHERE status='accepted'` | P1 |
| **Webhook Signature** | אימות HMAC לבקשות מDify/Flowise | P1 |
| **Job Status API** | `GET /api/erp/ai/jobs/[id]` — polling endpoint לסוכנים | P1 |
| **Risk Engine** | לוגיקת `gantt_risk_analysis` — זיהוי נתיב קריטי בסכנה | P2 |
| **Contractor Health** | לוגיקת `contractor_evaluation` — ניתוח תזרים קבלן | P2 |
| **Notification Layer** | Push/email כשJob עובר ל-`done` | P3 |
