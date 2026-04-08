import { openai } from "@ai-sdk/openai"
import {
  convertToModelMessages,
  stepCountIs,
  streamText,
  tool,
  type UIMessage,
} from "ai"
import { z } from "zod"

import {
  DIAMOND_FINANCE_CONTROLLER_RULES,
  DIAMOND_FINANCE_INVOICE_COPILOT_RULES,
} from "@/lib/ai/prompts"
import {
  financeExecutiveSnapshotForChat,
  financeProjectOverheadInsightForChat,
  financeVatSummaryForChat,
  israelTaxOpenDataVendorLookupForChat,
  supplierPaymentWithholdingEstimateForChat,
} from "@/lib/marker-ofek/ai/marker-ofek-finance-chat-tools"
import { markerOfekProcurementSnapshot } from "@/lib/marker-ofek/ai/marker-ofek-procurement-chat-tool"
import { matchContractVaultDocumentsCore } from "@/lib/marker-ofek/contract-vault/vault-match-core"
import { createSupabaseServerAuthClient } from "@/lib/supabase/server-auth"
import type { SupabaseClient } from "@supabase/supabase-js"
import type { TicketPriority } from "@/types/ticket"

export const maxDuration = 120

const SYSTEM_PROMPT = [
  "You are the enterprise Smart Building / construction ERP AI assistant — senior financial and operations analyst.",
  "Tone: professional Hebrew, calm, audit-ready, 'Pharmacy clean' — short paragraphs, no hype.",
  "Financial amounts: always show Israeli Shekel amounts clearly (e.g. 1,234,567 ₪). Prefer putting each key figure on its own line for readability.",
  "When tool results include `proactive_alerts` or negative P&L fields, surface them explicitly at the start of your answer (דגל אדום) before detail.",
  "You have vision: when a user uploads an image, analyze equipment (e.g. electrical panel, generator), diagnose visible faults, and use `create_ticket` when appropriate.",
  "For questions about contract documents, clauses, or project-specific paperwork, call `search_contract_vault` with the project UUID and the user's question as `query`.",
  "Base contract answers only on snippets returned by that tool; cite file names briefly. If the tool returns no snippets, say you found no matching vault text.",
  "For procurement / PO questions (e.g. last PO amount, status, rough share of main contract, or 'profit margin' of a PO — margin is not stored; explain and give the proxy), call `marker_ofek_procurement_snapshot` with `project_name_query` (Hebrew partial name like Ir HaYin).",
  "For VAT / מע״מ exposure by project (output VAT from approved/paid tax invoices), call `finance_vat_summary_by_project`. Pass optional `project_name_query` (e.g. נחלים, Sde Dov) or omit for portfolio totals.",
  "For holding / executive P&L, consolidated field vs loaded profit, overhead pool, and per-project overhead allocation, call `finance_executive_snapshot`.",
  "To explain why net profit is low for a specific project (overhead loading, labor_based vs revenue_based, fixed_rate), call `finance_project_overhead_insight` with `project_name_query`.",
  "For estimated net payment to a supplier after ניכוי במקור, call `supplier_payment_withholding_estimate` with `supplier_name_query` and `payment_amount_before_withholding_nis`. Clarify this is an estimate from profile/entity defaults, not tax advice.",
  "When the user asks about a Tax ID (ח.פ / עוסק מורשה) or subcontractor compliance against government data, call `israel_tax_open_data_vendor_lookup` with `tax_id`. If `screenContext` in the request describes a mismatch alert, acknowledge it and suggest verification steps.",
  "",
  DIAMOND_FINANCE_CONTROLLER_RULES,
  "",
  DIAMOND_FINANCE_INVOICE_COPILOT_RULES,
].join(" ")

/** Same default creator as `app/(dashboard)/tickets/actions.ts` for inserts. */
const DEFAULT_CREATOR_PROFILE_ID =
  process.env.DEMO_TICKET_CREATOR_PROFILE_ID?.trim() ||
  "a1111111-1111-4111-8111-111111111101"

function urgencyToPriority(
  urgency: "low" | "medium" | "high" | "critical"
): TicketPriority {
  switch (urgency) {
    case "critical":
      return "P1"
    case "high":
      return "P2"
    case "medium":
      return "P3"
    case "low":
    default:
      return "P4"
  }
}

async function resolveDefaultBuildingId(
  supabase: SupabaseClient
): Promise<string | null> {
  const fromEnv = process.env.CHAT_DEFAULT_BUILDING_ID?.trim()
  if (fromEnv) return fromEnv

  const { data } = await supabase.from("buildings").select("id").limit(1)
  const row = data?.[0] as { id?: string } | undefined
  return row?.id ?? null
}

/**
 * Accepts loose client shapes: `{ type: 'image', image: base64 }` → `FileUIPart` for `convertToModelMessages`.
 */
function normalizeUserMessageParts(messages: UIMessage[]): UIMessage[] {
  return messages.map((msg) => {
    if (msg.role !== "user" || !Array.isArray(msg.parts)) return msg

    const parts = msg.parts.map((part) => {
      if (
        part &&
        typeof part === "object" &&
        "type" in part &&
        (part as { type: string }).type === "image" &&
        "image" in part &&
        typeof (part as { image: unknown }).image === "string"
      ) {
        const raw = (part as { image: string }).image.trim()
        const url = raw.startsWith("data:")
          ? raw
          : `data:image/jpeg;base64,${raw}`
        return {
          type: "file" as const,
          url,
          mediaType: "image/jpeg",
        }
      }
      return part
    })

    return { ...msg, parts }
  })
}

export async function POST(req: Request) {
  let body: { messages: UIMessage[]; screenContext?: string | null }
  try {
    body = await req.json()
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    })
  }

  const { messages, screenContext: screenContextRaw } = body
  if (!Array.isArray(messages)) {
    return new Response(JSON.stringify({ error: "messages must be an array" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    })
  }

  const authSupabase = await createSupabaseServerAuthClient()
  const {
    data: { user: chatUser },
  } = await authSupabase.auth.getUser()
  if (!chatUser?.id) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    })
  }

  const tools = {
    get_open_tickets: tool({
      description:
        "Fetch a list of all currently open maintenance tickets.",
      inputSchema: z.object({}),
      execute: async () => {
        const { data, error } = await authSupabase
          .from("tickets")
          .select("id, title, status, priority, building_id, created_at")
          .neq("status", "resolved")
          .neq("status", "closed")
          .order("created_at", { ascending: false })
          .limit(50)

        if (error) {
          return {
            ok: false as const,
            error: error.message,
            tickets: [] as const,
          }
        }

        const rows = data ?? []
        return {
          ok: true as const,
          count: rows.length,
          summary: rows.map((t) => ({
            id: t.id,
            title: t.title,
            status: t.status,
            priority: t.priority,
            building_id: t.building_id,
            created_at: t.created_at,
          })),
        }
      },
    }),

    create_ticket: tool({
      description: "Create a new maintenance ticket.",
      inputSchema: z.object({
        title: z.string().describe("Short title for the ticket"),
        description: z.string().describe("Detailed description of the issue"),
        urgency: z.enum(["low", "medium", "high", "critical"]),
      }),
      execute: async ({ title, description, urgency }) => {
        const buildingId = await resolveDefaultBuildingId(authSupabase)

        if (!buildingId) {
          return {
            ok: false as const,
            message:
              "לא הוגדר בניין ברירת מחדל. הגדר CHAT_DEFAULT_BUILDING_ID או טבלת buildings.",
          }
        }

        const priority = urgencyToPriority(urgency)

        const { data, error } = await authSupabase
          .from("tickets")
          .insert({
            building_id: buildingId,
            title: title.trim(),
            description:
              description.trim().length > 0 ? description.trim() : null,
            priority,
            status: "open",
            created_by: DEFAULT_CREATOR_PROFILE_ID,
          })
          .select("id")
          .single()

        if (error) {
          return {
            ok: false as const,
            message: error.message,
          }
        }

        return {
          ok: true as const,
          ticketId: data.id,
          message: "הקריאה נרשמה במערכת בהצלחה.",
        }
      },
    }),

    marker_ofek_procurement_snapshot: tool({
      description:
        "Procurement: find project by Hebrew/partial name, fetch latest purchase order and active main contract total. Use for questions about last PO, amounts, status, or 'margin' (explain margin is not stored; return cost-pressure proxy as PO÷contract %).",
      inputSchema: z.object({
        project_name_query: z
          .string()
          .min(1)
          .describe("Partial project display name, e.g. עיר היין / Ir HaYin"),
      }),
      execute: async ({ project_name_query }) => {
        return markerOfekProcurementSnapshot({ project_name_query })
      },
    }),

    finance_executive_snapshot: tool({
      description:
        "Finance: holding dashboard — recognized revenue, direct costs, field profit, monthly corporate overhead pool, net loaded consolidated P&L, overhead allocation policy label, and per-project highlights (field profit, allocated overhead, net loaded). Includes proactive_alerts for negative loaded P&L. Use for 'how is the portfolio', consolidated P&L, executive summary.",
      inputSchema: z.object({}),
      execute: async () => financeExecutiveSnapshotForChat(),
    }),

    finance_vat_summary_by_project: tool({
      description:
        "Finance: output VAT (מע״מ פלט) from mo_invoices (approved/paid), aggregated by project. Optional project_name_query to filter by Hebrew/partial name or internal code (e.g. נחלים).",
      inputSchema: z.object({
        project_name_query: z
          .string()
          .optional()
          .describe(
            "Partial project name or code; leave empty for all projects in scope"
          ),
      }),
      execute: async ({ project_name_query }) =>
        financeVatSummaryForChat({ project_name_query }),
    }),

    finance_project_overhead_insight: tool({
      description:
        "Finance: for ONE project (match by name/code), return field profit vs allocated corporate overhead, net loaded profit, Gantt labor-day weight, global overhead pool, company allocation label, and per-project policy (revenue_based / labor_based / fixed_rate). Use to explain low net profit due to overhead loading.",
      inputSchema: z.object({
        project_name_query: z
          .string()
          .min(1)
          .describe("Partial project display name or internal code"),
      }),
      execute: async ({ project_name_query }) =>
        financeProjectOverheadInsightForChat({ project_name_query }),
    }),

    israel_tax_open_data_vendor_lookup: tool({
      description:
        "Israel open-data (data.gov.il CKAN): look up vendor / business registration by tax id (ח.פ / מספר עוסק). Returns registered name hint and any withholding-related field text if present in the dataset. Requires server env ISRAEL_TAX_REGISTRY_RESOURCE_ID.",
      inputSchema: z.object({
        tax_id: z.string().min(1).describe("ח.פ או מספר עוסק (ספרות)"),
      }),
      execute: async ({ tax_id }) => israelTaxOpenDataVendorLookupForChat({ tax_id }),
    }),

    supplier_payment_withholding_estimate: tool({
      description:
        "Estimate ניכוי במקור and net amount paid: looks up supplier entity by name, uses supplier_finance_profile.withholding_rate_percent if set, else entities.default_withholding_tax_percent. Not a substitute for accountant advice.",
      inputSchema: z.object({
        supplier_name_query: z.string().min(1).describe("Partial supplier entity name"),
        payment_amount_before_withholding_nis: z
          .number()
          .positive()
          .describe("Gross payment in NIS before withholding"),
      }),
      execute: async ({
        supplier_name_query,
        payment_amount_before_withholding_nis,
      }) =>
        supplierPaymentWithholdingEstimateForChat({
          supplier_name_query,
          payment_amount_before_withholding_nis,
        }),
    }),

    search_contract_vault: tool({
      description:
        "Vector search (768-dim embeddings) over the project's Contract Vault OCR excerpts. Use for RAG answers about signed contracts, annexes, and vault PDFs.",
      inputSchema: z.object({
        project_id: z
          .string()
          .min(1)
          .describe("Project UUID the vault is scoped to"),
        query: z
          .string()
          .min(1)
          .describe("Natural language question or keywords to match"),
        match_count: z
          .number()
          .int()
          .min(1)
          .max(12)
          .optional()
          .describe("Number of snippets (default 6)"),
      }),
      execute: async ({ project_id, query, match_count }) => {
        try {
          const res = await matchContractVaultDocumentsCore(authSupabase, {
            projectId: project_id.trim(),
            query: query.trim(),
            matchCount: match_count,
          })
          if (!res.ok) {
            return { ok: false as const, error: res.error, snippets: [] as const }
          }
          return {
            ok: true as const,
            count: res.snippets.length,
            snippets: res.snippets.map((s) => ({
              file_name: s.file_name,
              excerpt: s.excerpt,
              similarity: s.similarity,
            })),
          }
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e)
          return { ok: false as const, error: msg, snippets: [] as const }
        }
      },
    }),
  }

  const normalized = normalizeUserMessageParts(messages)

  const screenContext =
    typeof screenContextRaw === "string" ? screenContextRaw.trim() : ""
  const systemWithScreen =
    screenContext.length > 0
      ? `${SYSTEM_PROMPT}\n\n---\nCurrent ERP screen context (what the user is viewing now; use for guidance only, not legal/tax advice):\n${screenContext.slice(0, 12_000)}`
      : SYSTEM_PROMPT

  const result = streamText({
    model: openai("gpt-4o"),
    system: systemWithScreen,
    messages: await convertToModelMessages(normalized),
    tools,
    stopWhen: stepCountIs(12),
  })

  return result.toUIMessageStreamResponse()
}
