/**
 * `/api/procurement/autonomous-po/chat` — Phase C
 *
 * AI Copilot chat endpoint for the autonomous procurement engine.
 *
 * ## ארכיטקטורה
 * ה-LLM משמש *אך ורק* כ-Intent Parser. החישובים, חוקי התקן והמחירים
 * רצים ב-RPC הדטרמיניסטי `erp_generate_draft_po_from_bom` (Phase B).
 * זוהי "חומת אש נגד הזיות" — המודל לא יכול להמציא כמויות או מחירים,
 * רק לאתר את ה-UUIDs המתאימים בקונטקסט ולהעביר אותם ל-tool.
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
  const [projectsRes, assembliesRes, locationsRes] = await Promise.all([
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

אחרי קריאה מוצלחת לכלי — נסח תשובה קצרה בעברית והוסף קישור Markdown
לצפייה בהזמנה: \`[לצפייה בהזמנת רכש לחץ כאן](/marker-ofek/procurement/orders/<id>)\`.
אם הסטטוס \`PENDING_APPROVAL\` — ציין שיש חריגות הנדסיות שדורשות אישור,
ופרט אותן בקצרה.

אם הכלי החזיר \`blocked: true\` — *אל תייצר שוב* אלא הסבר למשתמש בעברית
טבעית למה ה-PO נחסם, על בסיס ה-violations שהכלי החזיר. למשל:
"לא יכולתי לייצר את ההזמנה כי יחס זוויות-התמיכה חורג ב-24% מהתקן הישראלי
1419 (סף מותר 20%). אנא בדוק את ה-Assembly או הפעל אישור חריג."

═══════════════════════════════════════════════════════════════
ChatContext (chống חברה ${activeCompanyId}) — Grounding מקור-אמת:
═══════════════════════════════════════════════════════════════

PROJECTS:
${projectsBlock}

ASSEMBLIES (קיטים — עץ מוצר):
${assembliesBlock}

LOCATIONS (מיקומים בפרויקט; חשוב לחוקי PER_LENGTH/PER_AREA):
${locationsBlock}
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
            p_supplier_id_override: null,
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
  }

  // 6) Stream the LLM response. stepCountIs(4) = עד 4 צעדים: clarify→tool→answer.
  const result = streamText({
    model: openai("gpt-4o"),
    system: systemPrompt,
    messages: await convertToModelMessages(messages),
    tools,
    toolChoice: "auto",
    stopWhen: stepCountIs(4),
  })

  return result.toUIMessageStreamResponse({
    onError: (err) => {
      console.error("[autonomous-po/chat] stream error", err)
      return "שגיאה בזרימת ה-AI. אנא נסה שוב."
    },
  })
}
