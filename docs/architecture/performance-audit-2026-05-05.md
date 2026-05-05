# Performance Audit — 2026-05-05

**Trigger:** משוב משתמש "המערכת מגיבה לאט"
**Scope:** סקירה כוללת ללא דרישת telemetry; זיהוי bottlenecks נפוצים + safe wins

---

## 1. ממצאים עיקריים

### 🟢 מה עובד
- Next.js 16.2.1 — bleeding edge, יש לו Turbopack production builds + cache components.
- Default `optimizePackageImports` של Next 16 כבר מטפל ב-`lucide-react`, `date-fns`, `recharts`, `@radix-ui/*` המפוצלים.
- Authentication דרך `@supabase/ssr` עם cookie-based sessions — מהיר.

### 🔴 Bottlenecks אפשריים — לפי השפעה משוערת

| # | בעיה | השפעה משוערת | פעולה | סטטוס |
|---|---|---|---|---|
| 1 | **Vercel region לא נעוץ** ב-`vercel.json` → defaults `iad1` (US East). אם Supabase ב-EU → 200-500ms RTT לכל DB query | 🔴 קריטי | הוספת `regions: ["fra1"]` או `["dub1"]` | ⏸ ממתין למידע מהמשתמש על Supabase region |
| 2 | **Heavy packages בלי tree-shaking**: `framer-motion`, `@dnd-kit/*`, `@base-ui/react`, `@tanstack/react-table` | 🟠 בינוני | `experimental.optimizePackageImports` ב-`next.config.ts` | ✅ **בוצע** (commit 2026-05-05) |
| 3 | **`/api/procurement/orders` ללא pagination** — מחזיר את כל ה-POs לחברה. ב-1000+ POs = שניות | 🔴 קריטי בסקייל | הוספת `LIMIT/OFFSET` + UI infinite scroll או "טען עוד" | ⏳ Phase G |
| 4 | **143 routes עם `force-dynamic`** — רובם נכון (RLS-scoped per-user), אבל מסכי master data (status types, payment terms, suppliers list) יכולים להשתמש ב-`unstable_cache` עם TTL | 🟠 בינוני | wrap עם `unstable_cache({revalidate: 300})` ב-server components | ⏳ Phase G |
| 5 | **שתי ספריות Excel + שתי PDF + שתי CSV** ב-`package.json` — `exceljs` + `xlsx` + `xlsx-js-style`, `jspdf` + `@react-pdf/renderer`, `papaparse` + `csv-parse` | 🟡 קל | בחירת אחת לכל מטרה והסרת השאר | ⏳ Phase H (אופטימיזציה ארוכת טווח) |
| 6 | **No bundle analyzer** baseline — אין דרך לדעת *מה* כבד בלי מדידה | 🟢 כלי | הרצת `npx next experimental-analyze` | ⏳ recommended next |

---

## 2. שינוי שבוצע — Win #2

`@c:\Users\user\Desktop\smart-building-os\next.config.ts` — הוספת `experimental.optimizePackageImports`:

```ts
optimizePackageImports: [
  "framer-motion",
  "@dnd-kit/core",
  "@dnd-kit/sortable",
  "@dnd-kit/utilities",
  "@base-ui/react",
  "@tanstack/react-table",
],
```

**אבטחה:** זו תכונת Next.js תקנית; משנה רק resolution של imports בזמן build. Runtime זהה. הרעת מצב לא אפשרית.

**אימפקט מצופה:** -10-25% בגודל ה-client JS bundle של מסכים שמשתמשים ב-framer-motion / dnd-kit (טפסים מתקדמים, drag-and-drop ב-Gantt, ב-master-data tables). ה-impact גדול יותר ב-cold-load של מסכי ה-procurement שיש בהם הרבה motion.

---

## 3. צעדים מומלצים לפי סדר קדימויות

### 3.1 — Win #1: Pin Vercel region (5 דקות, השפעה דרמטית)

**תלוי במידע מהמשתמש.** ברגע שתדע איפה Supabase יושב:

```jsonc
// vercel.json
{
  "regions": ["fra1"],  // אם Supabase ב-eu-central-1 (Frankfurt)
  // או "dub1" אם eu-west-1 (Ireland)
  // או "iad1" אם us-east-1 (Vercel default — אין מה לשנות)
  "crons": [...]
}
```

**ההשפעה הצפויה:** -200-500ms בכל API call (היום כל קריאה קופצת בין יבשות).

**שיטת בדיקה:** אחרי deploy, השוואת זמני תגובה ב-DevTools Network → Server-Timing header `db;dur=...`.

### 3.2 — Diagnosis: רוץ Bundle Analyzer (10 דקות, no risk)

```bash
npx next experimental-analyze --output
```

יוצר ב-`.next/diagnostics/analyze` דוח אינטראקטיבי. תוכל לזהות:
- האם framer-motion באמת בכבד שהנחתי?
- מי המודולים הגדולים שלא ידעת עליהם?
- האם יש duplicates (שתי ספריות Excel שנטענות יחד)?

תוכל לשתף איתי את הדוח (screenshot של top-10 modules) ואני אתאים את הoptimizePackageImports בצורה מדויקת יותר.

### 3.3 — Win #3: Pagination ל-`/api/procurement/orders` (Phase G, ~30 דקות)

מצב נוכחי: `@c:\Users\user\Desktop\smart-building-os\app\api\procurement\orders\route.ts:94-100`:
```ts
let query = supabase
  .from("erp_purchase_orders")
  .select("...")
  .eq("company_id", activeCompanyId)
  .order("created_at", { ascending: false })
// אין .limit() ואין .range()!
```

**הסיכון:** סקייל. עם 100 POs זה בסדר, עם 5000 — UI מוקפא.

**תיקון:** הוספת `?limit=50&offset=0` לAPI + infinite scroll או pagination ב-`OrdersDashboard`. דורש שינויים בכמה קבצים ובדיקה ידנית — לכן Phase G ולא wei ad hoc.

### 3.4 — Win #4: Master data caching (Phase G, ~1 שעה)

`unstable_cache` יעיל ל-endpoints כמו:
- `/api/procurement/status-types` — סטטוסים קבועים, never change
- `/api/master-data/payment-terms` — משתנים פעם בחודש לכל היותר
- `/api/master-data/items?lookup=true` — קטלוג, משתנה רק על-ידי import

```ts
import { unstable_cache } from "next/cache"

export const getCachedItems = unstable_cache(
  async (companyId: string) => {/* ... */},
  ["items-lookup"],
  { tags: ["items"], revalidate: 300 }
)
```

ואז `revalidateTag("items")` אחרי import לקטלוג. השפעה: -90% עומס DB על endpoints האלה.

---

## 4. מה לא לעשות (פוטנציאל לשבירה)

- ❌ **לא לשנות `force-dynamic` ל-`force-static`** באופן גורף — זה ישבור RLS isolation.
- ❌ **לא להחליף ספריות** (xlsx → exceljs וכו') בלי לבדוק קודם איפה כל אחת בשימוש.
- ❌ **לא להעביר APIs ל-Edge runtime** — Supabase service-role + RLS לא תמיד תואם ל-Edge (timeouts, missing Node APIs).

---

## 5. אם המצב לא משתפר אחרי Win #2

תרצה שאעבור ישירות לWin #1 (region pin) — צריך רק את ה-Supabase region. אחרי זה אם עדיין איטי:

1. **שתף Vercel function logs** — חיפוש לאחר commands שלוקחים 1000ms+
2. **Lighthouse run** על מסך שאתה מרגיש איטי במיוחד
3. אריץ profiling ספציפי על אותו מסך

---

**Owner:** ofirMk · **Auditor:** Cascade · **Next review:** אחרי deploy של commit הנוכחי + מענה על Supabase region
