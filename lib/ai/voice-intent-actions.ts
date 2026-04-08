"use server"

import { openai } from "@ai-sdk/openai"
import { generateObject } from "ai"
import { z } from "zod"

import { MARKER_OFEK_HREFS } from "@/lib/infrastructure/navigation/sidebar-routes"
import { createSupabaseServerAuthClient } from "@/lib/supabase/server-auth"

const ALLOWED_NAV_PATHS = new Set<string>([
  MARKER_OFEK_HREFS.financeInvoiceNew,
  "/marker-ofek/finance",
  "/marker-ofek/projects",
  "/marker-ofek/execution/gantt",
  "/marker-ofek/command-center",
  "/marker-ofek/settings",
])

/**
 * OpenAI Structured Outputs (strict): every key in `properties` must appear in `required`,
 * and objects use `additionalProperties: false`. Optional semantics = explicit `null`.
 */
const voiceIntentSchema = z.object({
  action: z.enum(["NAVIGATE", "UNKNOWN"]),
  path: z.string(),
  params: z.object({
    clientName: z
      .union([z.string(), z.null()])
      .describe(
        "שם הלקוח בעברית כפי שנאמר, או null אם לא הוזכר"
      ),
    amount: z
      .union([z.number(), z.null()])
      .describe("סכום בשקלים (מספר בלבד) או null אם לא הוזכר"),
  }),
})

export type VoiceIntent = z.infer<typeof voiceIntentSchema>

const SYSTEM_PROMPT = `You are the AI brain of Holden Group's ERP. The user will give a voice command in Hebrew.
Your job is to extract the intent and parameters.

Always return all three top-level keys: action, path, params.
Inside params always include both clientName and amount — use JSON null when a value is unknown (never omit keys).

Rules:
- If the user wants to create/issue a tax invoice, receipt, or bill for a client, use action NAVIGATE and path "${MARKER_OFEK_HREFS.financeInvoiceNew}".
- If they mention a client name (e.g. "עיר היין", company names), put it in params.clientName as spoken (Hebrew); otherwise params.clientName must be null.
- If they mention a money amount in NIS/shekels, put the numeric value in params.amount (no currency symbol); otherwise params.amount must be null.
- For finance hub / כספים / מרכז כספים: path "/marker-ofek/finance".
- For projects list: path "/marker-ofek/projects".
- For Gantt / גאנט / לוח זמנים ביצוע: path "/marker-ofek/execution/gantt".
- If intent is unclear, use action UNKNOWN, path "", and params { clientName: null, amount: null }.
- Only use paths from this allowlist: ${[...ALLOWED_NAV_PATHS].join(", ")}.`

export async function parseVoiceCommand(
  transcript: string
): Promise<
  | { ok: true; intent: VoiceIntent }
  | { ok: false; error: string }
> {
  const trimmed = transcript.trim()
  if (!trimmed) {
    return { ok: false, error: "תמלול ריק" }
  }

  try {
    const supabase = await createSupabaseServerAuthClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user?.id) {
      return { ok: false, error: "נדרשת התחברות" }
    }

    const { object } = await generateObject({
      model: openai("gpt-4o-mini"),
      schema: voiceIntentSchema,
      system: SYSTEM_PROMPT,
      prompt: `דיבור המשתמש (עברית):\n"""${trimmed}"""`,
    })

    if (object.action !== "NAVIGATE" || !object.path?.trim()) {
      return {
        ok: true,
        intent: {
          ...object,
          action: "UNKNOWN",
          path: "",
          params: {
            clientName: object.params.clientName ?? null,
            amount: object.params.amount ?? null,
          },
        },
      }
    }

    const path = object.path.trim()
    if (!ALLOWED_NAV_PATHS.has(path)) {
      return {
        ok: true,
        intent: {
          action: "UNKNOWN",
          path: "",
          params: { clientName: null, amount: null },
        },
      }
    }

    return { ok: true, intent: object }
  } catch (e) {
    console.error("[parseVoiceCommand]", e)
    return {
      ok: false,
      error: e instanceof Error ? e.message : "שגיאת ניתוח פקודה",
    }
  }
}
