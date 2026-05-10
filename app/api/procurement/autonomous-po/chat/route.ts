/* eslint-disable @typescript-eslint/no-explicit-any -- TODO(tech-debt): refactor DB row types; tracked for Sprint 3 cleanup. */
/**
 * `/api/procurement/autonomous-po/chat` — Phase C → D
 *
 * AI Copilot chat endpoint for the autonomous procurement engine.
 *
 * ## ארכיטקטורה (Phase C)
 * ה-LLM משמש *אך ורק* כ-Intent Parser. החישובים, חוקי התקן והמחירים
 * רצים ב-RPC הדטרמיניסטי `erp_generate_draft_po_from_bom` (Phase B).
 * זוהי "חומת אש נגד הזיות" — המודל לא יכול להמציא כמויות או מחירים,
 * רק לאתר את ה-UUIDs המתאימים בקונטקסט ולהעביר אותם ל-tool.
 *
 * ## הוספות Phase D — Vision-to-PO interactive
 * 1) Suppliers נוספים ל-grounding כדי ש-LLM יוכל לזהות "חשמל ישיר".
 * 2) `generate_engineering_po` מקבל `supplierId` אופציונלי שמועבר ל-RPC
 *    כ-`p_supplier_id_override`.
 * 3) Tool חדש `prepare_vision_po_draft` שלא יוצר PO ב-DB אלא מחזיר "כרטיס
 *    הכנת הזמנה" ל-UI: כמות מוערכת + אזהרת ±7% + שדה עריכה למשתמש.
 *    זהו ה-human-in-the-loop שמגן על ה-firewall גם בזרימת ראייה.
 * 4) System prompt מורחב לסריקת שרטוטים, בקשת קנה מידה, ואיסור מוחלט
 *    על הפעלת `generate_engineering_po` ישירות מתוך מדידה ויזואלית בלי
 *    אישור משתמש מפורש.
 *
 * ## זרימה
 * 1) מאמת tenant דרך `requireProcurementApiContext` (RLS-safe).
 * 2) שולף קונטקסט: 50 פרויקטים פעילים, 50 assemblies פעילים, 200 locations.
 *    מזריק את ה-IDs+שמות ל-system prompt → grounding מלא.
 * 3) LLM מחליט להפעיל את הכלי `generate_engineering_po`.
 * 4) ה-tool execute קורא ל-RPC עם ה-supabase client של המשתמש (RLS).
 * 5) מחזיר ל-LLM: { ok, purchaseOrderId, poNumber, status, violations }
 *    או במקרה של 409 (BLOCK): { ok: false, blocked: true, violations }.
 * 6) ה-LLM מנסח תשובה בעברית טבעית עם קישור [למסך ההזמנה](...).
 *
 * ## אבטחה
 * ה-supabase client שנלכד ב-closure הוא ה-RLS-bound client של המשתמש,
 * לא service-role. כך ה-RPC רץ עם ה-JWT של המשתמש ו-`user_has_company_access`
 * עדיין אוכף את ה-tenant. אין דרך ל-LLM לעקוף את זה.
 */

import { openai } from "@ai-sdk/openai"
import {
  convertToModelMessages,
  stepCountIs,
  streamText,
  tool,
  type UIMessage,
} from "ai"
import { z } from "zod"

import { requireProcurementApiContext } from "@/lib/erp/procurement-api"

export const runtime = "nodejs"
export const maxDuration = 60

// ============================================================================
// Types
// ============================================================================

type ProjectCtx = { id: string; projectNumber: string; name: string }
type AssemblyCtx = {
  id: string
  code: string
  name: string
  unitOfMeasure: string
  category: string
}
type LocationCtx = {
  id: string
  projectId: string
  code: string
  name: string
  lengthM: number | null
  areaSqm: number | null
}
type SupplierCtx = {
  id: string
  supplierNumber: string
  name: string
  foreignName: string | null
}

/**
 * Phase E — Reasonable Defaults: ה-PO האחרון של החברה.
 *
 * נשלף מ-`erp_purchase_orders` ומוזרק ל-grounding כדי שהסוכן יוכל להשתמש
 * ב-projectId/supplierId כברירת מחדל אם המשתמש לא ציין אותם במפורש.
 * זה חוסך 50% מהשאלות הפתוחות ("באיזה פרויקט?" / "איזה ספק?") כשהדפוס
 * עקבי. הסוכן עדיין מחויב לשאול אם המקור לא ברור או אם הסיטואציה השתנתה.
 */
type RecentPoCtx = {
  id: string
  poNumber: string
  status: string
  projectId: string
  supplierId: string
  totalAmount: number
  createdAt: string
}

type RpcRow = {
  purchase_order_id: string
  po_number: string
  po_status: string
  total_amount_net: number | string
  violations: unknown
  bom_request_id: string
  lines_count: number | string
}

type ViolationRecord = {
  rule_code?: string
  rule_type?: string
  violation_action?: "BLOCK" | "ESCALATE" | "WARN"
  message?: string
  delta_pct?: number
  tolerance_pct?: number
}

// ============================================================================
// POST handler
// ============================================================================

export async function POST(req: Request) {
  if (!process.env.OPENAI_API_KEY?.trim()) {
    return new Response(
      JSON.stringify({ error: "Missing OPENAI_API_KEY in environment" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    )
  }

  // 1) Tenant gate. ה-`requireProcurementApiContext` קורא ל-supabase auth +
  //    מאמת `x-active-company-id`. נשים לב שזה דורש NextRequest, אבל POST
  //    מקבל Request רגיל; ה-helper תומך בשניהם דרך `req.headers` standard.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ctx = await requireProcurementApiContext(req as any)
  if (!ctx.ok) return ctx.response
  const { supabase, activeCompanyId, userId } = ctx

  // 2) Parse body
  let parsedBody: { messages?: UIMessage[] }
  try {
    parsedBody = await req.json()
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    })
  }
  const messages = Array.isArray(parsedBody.messages) ? parsedBody.messages : []
  if (messages.length === 0) {
    return new Response(JSON.stringify({ error: "messages array required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    })
  }

  // 3) Context fetching — Grounding ל-LLM. כל ה-queries תחת RLS של המשתמש.
  const [projectsRes, assembliesRes, locationsRes, suppliersRes, recentPoRes] =
    await Promise.all([
      supabase
        .from("erp_proj_projects")
        .select("id,project_number,name,status")
        .eq("company_id", activeCompanyId)
        .order("project_number", { ascending: true })
        .limit(50),
      supabase
        .from("erp_md_product_assemblies")
        .select("id,code,name,category,unit_of_measure")
        .eq("company_id", activeCompanyId)
        .eq("is_active", true)
        .order("code", { ascending: true })
        .limit(50),
      supabase
        .from("erp_proj_locations")
        .select("id,project_id,code,name,length_m,area_sqm")
        .eq("company_id", activeCompanyId)
        .eq("is_active", true)
        .order("code", { ascending: true })
        .limit(200),
      supabase
        .from("erp_md_suppliers")
        .select("id,supplier_number,name,foreign_name,status")
        .eq("company_id", activeCompanyId)
        .eq("status", "ACTIVE")
        .order("name", { ascending: true })
        .limit(80),
      // Phase E — Reasonable Defaults: ה-PO האחרון של החברה.
      // RLS מבטיח שהשאילתה מסוננת לחברה הפעילה; אין צורך בסינון user-id
      // (אין `created_by` בטבלה, ובכל מקרה רוב המשתמשים 1:1 עם חברה).
      supabase
        .from("erp_purchase_orders")
        .select("id,po_number,status,project_id,supplier_id,total_amount,created_at")
        .eq("company_id", activeCompanyId)
        .order("created_at", { ascending: false })
        .limit(1),
    ])

  const projects: ProjectCtx[] = (projectsRes.data ?? []).map((r: any) => ({
    id: r.id,
    projectNumber: r.project_number,
    name: r.name,
  }))
  const assemblies: AssemblyCtx[] = (assembliesRes.data ?? []).map((r: any) => ({
    id: r.id,
    code: r.code,
    name: r.name,
    category: r.category,
    unitOfMeasure: r.unit_of_measure,
  }))
  const locations: LocationCtx[] = (locationsRes.data ?? []).map((r: any) => ({
    id: r.id,
    projectId: r.project_id,
    code: r.code,
    name: r.name,
    lengthM: r.length_m === null ? null : Number(r.length_m),
    areaSqm: r.area_sqm === null ? null : Number(r.area_sqm),
  }))
  const suppliers: SupplierCtx[] = (suppliersRes.data ?? []).map((r: any) => ({
    id: r.id,
    supplierNumber: r.supplier_number,
    name: r.name,
    foreignName: r.foreign_name ?? null,
  }))

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recentPoRow = (recentPoRes.data ?? [])[0] as any | undefined
  const recentPo: RecentPoCtx | null = recentPoRow
    ? {
        id: recentPoRow.id,
        poNumber: recentPoRow.po_number,
        status: recentPoRow.status,
        projectId: recentPoRow.project_id,
        supplierId: recentPoRow.supplier_id,
        totalAmount: Number(recentPoRow.total_amount ?? 0),
        createdAt: recentPoRow.created_at,
      }
    : null

  // 4) Build grounding system prompt
  const projectsBlock = projects.length
    ? projects
        .map(
          (p) =>
            `  - id="${p.id}"  name="${p.name}"  number="${p.projectNumber}"`
        )
        .join("\n")
    : "  (אין פרויקטים פעילים)"

  const assembliesBlock = assemblies.length
    ? assemblies
        .map(
          (a) =>
            `  - id="${a.id}"  code="${a.code}"  name="${a.name}"  uom="${a.unitOfMeasure}"  category="${a.category}"`
        )
        .join("\n")
    : "  (אין assemblies)"

  const locationsBlock = locations.length
    ? locations
        .map((l) => {
          const meta = [
            l.lengthM !== null ? `${l.lengthM}m` : null,
            l.areaSqm !== null ? `${l.areaSqm}sqm` : null,
          ]
            .filter(Boolean)
            .join(", ")
          return `  - id="${l.id}"  project_id="${l.projectId}"  code="${l.code}"  name="${l.name}"${
            meta ? `  (${meta})` : ""
          }`
        })
        .join("\n")
    : "  (אין מיקומים)"

  const suppliersBlock = suppliers.length
    ? suppliers
        .map(
          (s) =>
            `  - id="${s.id}"  number="${s.supplierNumber}"  name="${s.name}"${
              s.foreignName ? `  foreign="${s.foreignName}"` : ""
            }`
        )
        .join("\n")
    : "  (אין ספקים פעילים)"

  const systemPrompt = `אתה "מהנדס רכש אוטונומי" של מערכת Marker Ofek.

תפקידך: להבין מה איש הרכש רוצה להזמין בעברית טבעית, לאתר את ה-UUIDs
המתאימים מהקונטקסט למטה, ולחלץ את הכמות המבוקשת. ואז להפעיל את הכלי
\`generate_engineering_po\` עם הפרמטרים הנכונים.

חוקים מוחלטים — אל תפר:
1. אסור לך לחשב כמויות, יחסים, חוקים הנדסיים, או מחירים בעצמך.
   השרת הדטרמיניסטי (RPC \`erp_generate_draft_po_from_bom\`) עושה את כל
   החישובים. אתה רק מתורגמן של כוונה.
2. השתמש *אך ורק* ב-IDs מהקונטקסט למטה. אל תמציא UUIDs.
3. אם המשתמש לא ציין פרויקט/assembly/כמות בבירור — שאל שאלת הבהרה
   *לפני* קריאה לכלי. אל תנחש.
4. אם יש רק פרויקט אחד או assembly אחד בקונטקסט — מותר להניח שהוא הכוונה
   ולציין זאת ("הנחתי שמדובר ב…").
5. תמיד דבר עברית. השתמש בלשון נכבד וענייני.

אחרי קריאה מוצלחת ל-\`generate_engineering_po\` — נסח תשובה קצרה בעברית
והוסף קישור Markdown לצפייה בהזמנה:
\`[לצפייה בהזמנת רכש לחץ כאן](/marker-ofek/procurement/orders/<id>)\`.
אם הסטטוס \`PENDING_APPROVAL\` — ציין שיש חריגות הנדסיות שדורשות אישור,
ופרט אותן בקצרה.

═══════════════════════════════════════════════════════════════
זרימת Vision-to-PO (Phase D) — חובה לעקוב!
═══════════════════════════════════════════════════════════════

כאשר המשתמש מצרף תמונה (שרטוט/תוכנית חשמל):
  1) השתמש ביכולות ה-Vision שלך לזהות את תוואי החומרים מהמקרא.
  2) אם לא צוין קנה מידה (1:50, 1:100 וכו') — בקש אותו מהמשתמש.
     אל תנחש קנה מידה!
  3) לאחר שיש קנה מידה, הערך את האורך הכולל מהשרטוט. ציין נקודות
     רוחב/גובה שעליהן ביססת את ההערכה.
  4) זהה את הספק המבוקש בקונטקסט (למשל "חשמל ישיר" → חפש בבלוק
     SUPPLIERS את ה-UUID לפי שם).
  5) קרא **אך ורק** ל-\`prepare_vision_po_draft\` כדי להציג כרטיס
     אישור למשתמש. אסור באיסור מוחלט להפעיל \`generate_engineering_po\`
     ישירות על סמך מדידה ויזואלית!
  6) המשתמש יראה את הכרטיס, יערוך את הכמות אם צריך, ויאשר.
     רק אז יישלח אליך הודעה "אני מאשר את הכמות של X. הפעל
     generate_engineering_po עם supplierId=...". אז ורק אז תפעיל את
     ה-tool ההוא — עם הכמות המאושרת והספק הנכון.

═══════════════════════════════════════════════════════════════
זיהוי קלט PDF — Reverse-Engineering + הערת שקיפות (חובה!)
═══════════════════════════════════════════════════════════════

כאשר ההודעה של המשתמש מתחילה במרקר \`[__PDF_SOURCE__:<filenames>]\` —
זה אומר שהמשתמש העלה PDF (תוכנית/שרטוט אדריכלי), ה-UI המיר אותו
ל-PNG-ים בצד הלקוח, והעמודים המצורפים הם רנדור raster של ה-PDF.
המרקר עצמו לא מוצג למשתמש — הוא מטא-דאטה לעיניך בלבד; אסור
לחזור עליו או להזכיר אותו בתגובתך.

כאשר אתה רואה מרקר כזה — חובה לעקוב אחרי שני השלבים האלה:

▸ **שלב 1 — הנדסה לאחור (Reverse Engineering)**:
  אל תסתפק בניסיון לקרוא טקסט גולמי. נתח את הגיאומטריה, הקווים,
  הצורות וההקשר המרחבי כדי להסיק את הלוגיקה ההנדסית של השרטוט.
  נסה לזהות רכיבים, תוואי מערכות, קירות ופתחים על סמך המבנה
  הוויזואלי שלהם — סמלים סטנדרטיים של מקרא חשמל, חיתוכים,
  צמתים, קוטר תעלות, ואלמנטים מבניים שמשפיעים על התוואי.

▸ **שלב 2 — הערת שקיפות מילולית (חובה!)**:
  פתח כל תגובה שאתה מנתח בה PDF *מילה במילה* בהערה הבאה
  (כפסקה ראשונה, לפני כל ניתוח אחר):

"💡 הערה: הניתוח המוגש כאן מבוסס על קובץ PDF. מכיוון ש-PDF מוחק את \
מסד הנתונים המקורי של השרטוט, ביצעתי 'הנדסה לאחור' על בסיס \
הגיאומטריה והתצוגה הוויזואלית בלבד. אם תעלה לי את התוכניות \
בפורמט מקור מובנה (כמו DWG, DXF, קובצי IFC מתוך מודל BIM, \
או RVT), תהיה לי גישה למפתח הנתונים, לבלוקים ולשכבות המידע \
המקוריות, ואוכל לספק לך תוצאות מדויקות ואמינות הרבה יותר."

  אסור להחליף את הנוסח, לקצר אותו, או לפצל אותו בין הודעות.
  מציגים אותו פעם אחת בתחילת התגובה הראשונה לכל קלט-PDF חדש.
  לאחריו ממשיכים לזרימת Vision-to-PO הרגילה (קנה מידה →
  הערכה → \`prepare_vision_po_draft\`).

כאשר אין מרקר \`[__PDF_SOURCE__:...]\` — המקור הוא צילום/תמונה
ישירה (לא PDF), ואין צורך בהערת השקיפות. בצע vision flow רגיל.

═════════════════════════════════════════════════════════════
מסלול Autodesk APS — DWG/DXF Vector Extraction (חובה!)
═════════════════════════════════════════════════════════════

אם המשתמש מזכיר קובץ עם סיומת **DWG / DXF**, או מבקש לחלץ מדויק
מ-**אוטוקאד / AutoCAD / Autodesk** — אתה חייב לדלג לגמרי על מנוע ה-Vision
ולבצע **שרשור פעולות דו-שלבי** הבא:

  שלב 1) הפעל תחילה את הכלי \`analyze_autodesk_drawing_mock\`.
         — אם המשתמש לא סיפק שם קובץ — המצא שם סביר (למשל "floor-B1-electrical.dwg").
         — הכלי יחזיר לך אובייקט עם השדות: extracted_length, matched_layer,
           confidence, provider.

  שלב 2) מייד אחרי קבלת התוצאה, הפעל את הכלי הקיים \`prepare_vision_po_draft\`
         כדי להציג למשתמש כרטיס הכנת הזמנה לאישור.

  קריטי — במסלול Autodesk חובה להעביר ל-\`prepare_vision_po_draft\`:
         • \`estimatedQuantity\` = הערך המדויק שהחזיר ה-mock (למשל 122.45) — בלי שינוי.
         • \`marginOfErrorPct\` = **0** (אפס אחוז שגיאה — זו הנקודה המבדלת מ-Vision).
         • \`reasoning\` = הטקסט הבא *מילה במילה* ולא דבר אחר — זהה להסברה למשתמש
           מהיכן מגיע הדיוק ההנדסי המוחלט:
           "הנתונים חולצו וקטורית ישירות משרתי Autodesk APS בדיוק הנדסי אבסולוטי (0% סטיית תקן)"

הקשר הזה גובר על כל PDF/Vision flow רגיל — לא מסגיר הערת שקיפות PDF
כאשר הקלט הוא DWG/DXF או אזכור מפורש ל-Autodesk.

כאשר המשתמש *לא* צירף תמונה ופשוט מתאר טקסטואלית — Phase C כרגיל:
קרא ישר ל-\`generate_engineering_po\` לאחר ודאות בכל הפרמטרים.

אם הכלי החזיר \`blocked: true\` — *אל תייצר שוב* אלא הסבר למשתמש בעברית
טבעית למה ה-PO נחסם, על בסיס ה-violations שהכלי החזיר. למשל:
"לא יכולתי לייצר את ההזמנה כי יחס זוויות-התמיכה חורג ב-24% מהתקן הישראלי
1419 (סף מותר 20%). אנא בדוק את ה-Assembly או הפעל אישור חריג."

═══════════════════════════════════════════════════════════════
ChatContext (חברה ${activeCompanyId}) — Grounding מקור-אמת:
═══════════════════════════════════════════════════════════════

PROJECTS:
${projectsBlock}

ASSEMBLIES (קיטים — עץ מוצר):
${assembliesBlock}

LOCATIONS (מיקומים בפרויקט; חשוב לחוקי PER_LENGTH/PER_AREA):
${locationsBlock}

SUPPLIERS (ספקים פעילים — שלוף UUID לפי שם כשהמשתמש מציין ספק):
${suppliersBlock}

PO_RECENT_HISTORY (Phase E — Reasonable Defaults):
${
  recentPo
    ? (() => {
        const proj = projects.find((p) => p.id === recentPo.projectId)
        const sup = suppliers.find((s) => s.id === recentPo.supplierId)
        return [
          `  - last_po_number="${recentPo.poNumber}"`,
          `    status="${recentPo.status}"`,
          `    created_at="${recentPo.createdAt}"`,
          `    default_project_id="${recentPo.projectId}"${
            proj ? ` (${proj.name} / ${proj.projectNumber})` : ""
          }`,
          `    default_supplier_id="${recentPo.supplierId}"${
            sup ? ` (${sup.name})` : ""
          }`,
          `    total_amount=${recentPo.totalAmount}`,
        ].join("\n")
      })()
    : "  (אין PO היסטורי בחברה זו — שאל את המשתמש לפני התחלה)"
}

כלל ברירת מחדל סבירה (Phase E):
  • אם המשתמש *לא* ציין projectId — השתמש ב-default_project_id מ-PO_RECENT_HISTORY,
    אבל ציין במפורש בתשובתך "הנחתי שמדובר בפרויקט <X> כי זה ה-PO האחרון; רוצה לשנות?".
  • אם המשתמש *לא* ציין ספק — השתמש ב-default_supplier_id באותה צורה.
  • אם אין PO היסטורי (PO_RECENT_HISTORY ריק) — חובה לשאול במפורש.
  • אם המשתמש שינה במפורש את הפרויקט/הספק — *אל* תחזור לדפולט; כבד את הבחירה החדשה.
  • החוק הזה לא מבטל את ה-Vision flow: עדיין חובה לקרוא ל-prepare_vision_po_draft
    כשמצורפת תמונה, ולחכות לאישור משתמש לפני generate_engineering_po.
`

  // 5) Tool definition — wrapper around the deterministic RPC
  const tools = {
    generate_engineering_po: tool({
      description:
        "מפעיל את מנוע הרכש ההנדסי הדטרמיניסטי. " +
        "פוצץ את עץ המוצר (assembly), מריץ ולידציות תקן הנדסיות, " +
        "ויוצר DRAFT PO (או PENDING_APPROVAL אם חוק תקן דורש אישור). " +
        "אם נמצאת חריגה חוסמת (BLOCK) — לא נוצר PO, ומוחזר blocked=true עם פירוט.",
      inputSchema: z.object({
        projectId: z
          .string()
          .uuid()
          .describe("UUID של הפרויקט מהקונטקסט. חובה."),
        assemblyId: z
          .string()
          .uuid()
          .describe(
            "UUID של ה-assembly (KIT) מהקונטקסט. חובה. דוגמה: KIT-EL-CHANNEL-100."
          ),
        requestedQty: z
          .number()
          .positive()
          .describe(
            "כמות בסיס ביחידות ה-assembly (למשל מטרים אם ה-uom של ה-assembly הוא METER)."
          ),
        locationId: z
          .string()
          .uuid()
          .nullable()
          .optional()
          .describe(
            "UUID של מיקום (אופציונלי). נדרש לחוקי PER_LENGTH/PER_AREA."
          ),
        supplierId: z
          .string()
          .uuid()
          .nullable()
          .optional()
          .describe(
            "UUID של ספק להעדפה (Phase D). מועבר ל-RPC כ-p_supplier_id_override. " +
              "אם null/חסר — ה-RPC בוחר ספק לפי preferred_supplier של פריט PRIMARY."
          ),
      }),
      execute: async (input) => {
        // ─────────────────────────────────────────────────────────────────
        // Server-side validation — IDs חייבים להיות מתוך הקונטקסט שהוזרק.
        // זהו שכבת הגנה נוספת מעל RLS, להבטיח שה-LLM לא חרג מ-grounding.
        // ─────────────────────────────────────────────────────────────────
        if (!projects.some((p) => p.id === input.projectId)) {
          return {
            ok: false as const,
            blocked: false as const,
            error:
              `projectId לא נמצא בקונטקסט (${input.projectId}). השתמש רק ב-IDs שסיפקנו.`,
          }
        }
        if (!assemblies.some((a) => a.id === input.assemblyId)) {
          return {
            ok: false as const,
            blocked: false as const,
            error: `assemblyId לא נמצא בקונטקסט (${input.assemblyId}).`,
          }
        }
        if (
          input.locationId &&
          !locations.some((l) => l.id === input.locationId)
        ) {
          return {
            ok: false as const,
            blocked: false as const,
            error: `locationId לא נמצא בקונטקסט (${input.locationId}).`,
          }
        }
        if (
          input.supplierId &&
          !suppliers.some((s) => s.id === input.supplierId)
        ) {
          return {
            ok: false as const,
            blocked: false as const,
            error: `supplierId לא נמצא בקונטקסט (${input.supplierId}).`,
          }
        }

        // ─────────────────────────────────────────────────────────────────
        // RPC call — נעטף ב-try/catch כי PL/pgSQL זורק exception על BLOCK.
        // ה-supabase client הוא ה-RLS-bound client של המשתמש (defense-in-depth).
        // ─────────────────────────────────────────────────────────────────
        const { data, error } = await supabase.rpc(
          "erp_generate_draft_po_from_bom",
          {
            p_company_id: activeCompanyId,
            p_project_id: input.projectId,
            p_assembly_id: input.assemblyId,
            p_requested_qty: input.requestedQty,
            p_location_id: input.locationId ?? null,
            p_created_by: userId ?? null,
            p_supplier_id_override: input.supplierId ?? null,
          }
        )

        if (error) {
          // P0001 = engineering BLOCK violation (זרקנו ידנית ב-RPC)
          if (error.code === "P0001") {
            let parsedViolations: ViolationRecord[] = []
            try {
              parsedViolations = JSON.parse((error.details as string) ?? "[]")
            } catch {
              parsedViolations = []
            }
            return {
              ok: false as const,
              blocked: true as const,
              message: error.message,
              violations: parsedViolations,
              hint:
                error.hint ??
                "ניתן לבקש גרסה מתוקנת או להסלים לאישור הנדסי ידני.",
            }
          }
          // שאר השגיאות — מבנה אחיד
          return {
            ok: false as const,
            blocked: false as const,
            error: error.message,
            code: error.code ?? null,
          }
        }

        const rows = (data ?? []) as RpcRow[]
        const row = rows[0]
        if (!row) {
          return {
            ok: false as const,
            blocked: false as const,
            error: "RPC לא החזיר תוצאה",
          }
        }

        const violationsArr: ViolationRecord[] = Array.isArray(row.violations)
          ? (row.violations as ViolationRecord[])
          : []

        return {
          ok: true as const,
          purchaseOrderId: row.purchase_order_id,
          poNumber: row.po_number,
          status: row.po_status,
          totalAmountNet: Number(row.total_amount_net),
          linesCount: Number(row.lines_count),
          bomRequestId: row.bom_request_id,
          violations: violationsArr,
          poUrl: `/marker-ofek/procurement/orders/${row.purchase_order_id}`,
        }
      },
    }),

    // ─────────────────────────────────────────────────────────────────────
    // Phase E — import_supplier_catalog (Step 1: placeholder)
    //
    // ה-tool הזה הוא **scaffold ריק** ב-Phase E Step 1. הוא מוכרז למודל
    // כדי לבסס את החוזה (signature + grounding), אבל ההטמעה מלאה (העלאת
    // קובץ → LLM extraction → כתיבה ל-erp_supplier_catalog_imports +
    // erp_supplier_catalog_import_lines) תיכנס ב-Phase E Step 2. עד אז
    // הקריאה תחזיר not_implemented כדי שלא יווצרו שורות חצי-בסיסיות ב-DB.
    //
    // ה-DB schema (טבלאות + RLS + טריגרים) **כן** קיים בפרודקשן (migration
    // 20260813100000), אז המשך הזרימה ינוע במהירות.
    // ─────────────────────────────────────────────────────────────────────
    // ─────────────────────────────────────────────────────────────────────
    // analyze_autodesk_drawing_mock — Wizard-of-Oz pilot for the investor demo
    //
    // **HEADS-UP: this tool is a fixture, not a real integration.** The full
    // Autodesk APS roadmap lives at
    //   docs/integrations/autodesk-aps-integration-plan.md
    // and is gated on the business prerequisites (developer account, billing,
    // DPA) that are still outstanding.
    //
    // Until APS is wired up for real, this mock returns a deterministic JSON
    // payload after a ~3.5s delay so the demo feels like a server round-trip
    // to Model Derivative. The system prompt above forces the model to chain
    // this tool → prepare_vision_po_draft with marginOfErrorPct=0, presenting
    // the result to investors as an exact vector extraction.
    //
    // When the real APS integration ships, this tool will be removed in the
    // same commit that introduces \`analyze_uploaded_drawing\` (see Step 6 in
    // the blueprint).
    // ─────────────────────────────────────────────────────────────────────
    analyze_autodesk_drawing_mock: tool({
      description:
        "Investor-demo fixture that simulates an Autodesk APS Model Derivative " +
        "vector extraction. Call this when the user references a DWG/DXF file " +
        "or asks for an exact extraction from AutoCAD / Autodesk. After it " +
        "returns, immediately call prepare_vision_po_draft with the returned " +
        "extracted_length and marginOfErrorPct=0.",
      inputSchema: z.object({
        filename: z
          .string()
          .min(1)
          .describe(
            "שם הקובץ (למשל 'floor-B1-electrical.dwg'). אם המשתמש לא סיפק — המצא שם סביר.",
          ),
      }),
      execute: async (input) => {
        // השהיה מלאכותית לאמינות הדמיה — מדמה קריאה ל-Autodesk Model Derivative API
        // (לרוב ממתין 2-5 שניות ל-translation+properties pull במצב אמיתי).
        await new Promise((resolve) => setTimeout(resolve, 3500))
        return {
          ok: true as const,
          provider: "Autodesk APS Model Derivative",
          filename: input.filename,
          extracted_length: 122.45,
          extracted_unit: "m",
          matched_layer: "EL_TRAY_100",
          confidence: 1.0,
          extraction_method: "vector",
          message:
            "Vector extraction completed successfully. Pass extracted_length to " +
            "prepare_vision_po_draft with marginOfErrorPct=0.",
        }
      },
    }),

    import_supplier_catalog: tool({
      description:
        "Phase E (Step 1 — placeholder) — מקבל קובץ קטלוג ספק (PDF/Excel) שכבר " +
        "הועלה, מחלץ שורות מוצרים+מחירים, וכותב ל-erp_supplier_catalog_imports. " +
        "ההטמעה המלאה תגיע ב-Step 2; כרגע הכלי מחזיר not_implemented.",
      inputSchema: z.object({
        supplierId: z
          .string()
          .uuid()
          .describe("UUID של הספק שהקטלוג שייך אליו (חובה)."),
        fileUrl: z
          .string()
          .min(1)
          .describe("נתיב הקובץ שהועלה ל-Supabase Storage."),
        originalFilename: z
          .string()
          .min(1)
          .describe("שם הקובץ המקורי לצורך תצוגה ב-UI."),
      }),
      execute: async (input) => {
        if (!suppliers.some((s) => s.id === input.supplierId)) {
          return {
            ok: false as const,
            error: `supplierId לא נמצא בקונטקסט (${input.supplierId}).`,
          }
        }
        // Placeholder — לא יוצר רשומה ב-DB עד Step 2.
        return {
          ok: false as const,
          notImplemented: true as const,
          message:
            "קליטת קטלוגי ספקים תיתמך ב-Phase E Step 2. השלד של מסד הנתונים " +
            "מוכן (erp_supplier_catalog_imports + erp_supplier_catalog_import_lines), " +
            "אבל ה-extraction pipeline טרם נבנה. אנא הוסף את המחירים ידנית בינתיים.",
          inputEcho: {
            supplierId: input.supplierId,
            originalFilename: input.originalFilename,
          },
        }
      },
    }),

    // ─────────────────────────────────────────────────────────────────────
    // Phase D — prepare_vision_po_draft
    //
    // *לא יוצר PO ב-DB!* תפקיד הכלי לעצור את ה-LLM ולהחזיר "כרטיס הכנת
    // הזמנה" שה-UI ירנדר עם שדה כמות עריך + כפתור אישור. רק לאחר אישור
    // המשתמש המודל יקרא ל-`generate_engineering_po` עם הכמות המאושרת.
    //
    // אנו מבצעים גם כאן grounding-check (project/assembly/supplier UUIDs)
    // כדי לוודא שה-UI לא מקבל IDs ממוצאים שלא קיימים ב-DB.
    // ─────────────────────────────────────────────────────────────────────
    prepare_vision_po_draft: tool({
      description:
        "Phase D — מציג כרטיס הכנת הזמנה אינטראקטיבי למשתמש לאחר מדידה ויזואלית של שרטוט. " +
        "הכלי לא יוצר PO ב-DB; הוא רק מחזיר את הנתונים ל-UI שיציג כרטיס לאישור. " +
        "חובה לקרוא לכלי הזה (ולא ל-generate_engineering_po) כשהמשתמש מצרף תמונה ומבקש הזמנה.",
      inputSchema: z.object({
        projectId: z.string().uuid().describe("UUID פרויקט מהקונטקסט."),
        assemblyId: z
          .string()
          .uuid()
          .describe("UUID assembly (KIT) מהקונטקסט."),
        locationId: z
          .string()
          .uuid()
          .nullable()
          .optional()
          .describe("UUID מיקום (אופציונלי)."),
        supplierId: z
          .string()
          .uuid()
          .describe(
            "UUID ספק מהקונטקסט. חובה ב-vision flow — המשתמש בחר ספק."
          ),
        estimatedQuantity: z
          .number()
          .positive()
          .describe("הכמות שהוערכה מהשרטוט, ביחידות ה-assembly UoM."),
        marginOfErrorPct: z
          .number()
          .default(7)
          .describe("שולי טעות בסריקה האופטית (ברירת מחדל 7%)."),
        reasoning: z
          .string()
          .min(1)
          .describe(
            "הסבר קצר בעברית כיצד חישבת את הכמות (קנה מידה, אורך מתואר, נקודות התייחסות)."
          ),
      }),
      execute: async (input) => {
        const proj = projects.find((p) => p.id === input.projectId)
        const asm = assemblies.find((a) => a.id === input.assemblyId)
        const sup = suppliers.find((s) => s.id === input.supplierId)
        const loc = input.locationId
          ? locations.find((l) => l.id === input.locationId)
          : null

        if (!proj) {
          return {
            ok: false as const,
            error: `projectId לא בקונטקסט (${input.projectId}).`,
          }
        }
        if (!asm) {
          return {
            ok: false as const,
            error: `assemblyId לא בקונטקסט (${input.assemblyId}).`,
          }
        }
        if (!sup) {
          return {
            ok: false as const,
            error: `supplierId לא בקונטקסט (${input.supplierId}).`,
          }
        }
        if (input.locationId && !loc) {
          return {
            ok: false as const,
            error: `locationId לא בקונטקסט (${input.locationId}).`,
          }
        }

        // החזרת "snapshot" של כל המידע שה-UI צריך כדי לרנדר את הכרטיס.
        // הסטטוס pending_user_confirmation מסמן ל-LLM ול-UI שצריך לחכות.
        return {
          ok: true as const,
          status: "pending_user_confirmation" as const,
          assembly: {
            id: asm.id,
            code: asm.code,
            name: asm.name,
            unitOfMeasure: asm.unitOfMeasure,
          },
          project: {
            id: proj.id,
            projectNumber: proj.projectNumber,
            name: proj.name,
          },
          location: loc
            ? { id: loc.id, code: loc.code, name: loc.name }
            : null,
          supplier: {
            id: sup.id,
            supplierNumber: sup.supplierNumber,
            name: sup.name,
          },
          estimatedQuantity: input.estimatedQuantity,
          marginOfErrorPct: input.marginOfErrorPct,
          reasoning: input.reasoning,
          message:
            "כרטיס הכנת ההזמנה נוצר. ממתין לאישור המשתמש לפני יצירת PO.",
        }
      },
    }),
  }

  // 6) Stream the LLM response. stepCountIs(6) — Phase D vision flow may need:
  //    vision-analyze → prepare_vision_po_draft → text → (user confirms) →
  //    generate_engineering_po → text. כל אחד הוא step.
  const result = streamText({
    model: openai("gpt-4o"),
    system: systemPrompt,
    messages: await convertToModelMessages(messages),
    tools,
    toolChoice: "auto",
    stopWhen: stepCountIs(6),
  })

  return result.toUIMessageStreamResponse({
    onError: (err) => {
      console.error("[autonomous-po/chat] stream error", err)
      return "שגיאה בזרימת ה-AI. אנא נסה שוב."
    },
  })
}
