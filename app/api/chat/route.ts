import { openai } from "@ai-sdk/openai"
import {
  convertToModelMessages,
  stepCountIs,
  streamText,
  tool,
  type UIMessage,
} from "ai"
import { z } from "zod"

import { createSupabaseServerClient } from "@/lib/supabase/server"
import type { TicketPriority } from "@/types/ticket"

export const maxDuration = 120

const SYSTEM_PROMPT =
  "You are the Marker Ofek Smart Building AI Manager. You now have vision capabilities. When a user uploads an image, analyze it first. Diagnose the equipment (e.g., electrical panel, generator) and potential faults visible. Then, use your `create_ticket` tool based on this visual diagnosis. Example: if shown a tripped breaker, create a critical ticket 'Tripped Circuit Breaker in [Location]' with a visual description in the `description` field. Always reply in professional Hebrew based on your visual findings."

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
  supabase: ReturnType<typeof createSupabaseServerClient>
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
  let body: { messages: UIMessage[] }
  try {
    body = await req.json()
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    })
  }

  const { messages } = body
  if (!Array.isArray(messages)) {
    return new Response(JSON.stringify({ error: "messages must be an array" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    })
  }

  const tools = {
    get_open_tickets: tool({
      description:
        "Fetch a list of all currently open maintenance tickets.",
      inputSchema: z.object({}),
      execute: async () => {
        const supabase = createSupabaseServerClient()
        const { data, error } = await supabase
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
        const supabase = createSupabaseServerClient()
        const buildingId = await resolveDefaultBuildingId(supabase)

        if (!buildingId) {
          return {
            ok: false as const,
            message:
              "לא הוגדר בניין ברירת מחדל. הגדר CHAT_DEFAULT_BUILDING_ID או טבלת buildings.",
          }
        }

        const priority = urgencyToPriority(urgency)

        const { data, error } = await supabase
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
  }

  const normalized = normalizeUserMessageParts(messages)

  const result = streamText({
    model: openai("gpt-4o"),
    system: SYSTEM_PROMPT,
    messages: await convertToModelMessages(normalized),
    tools,
    stopWhen: stepCountIs(5),
  })

  return result.toUIMessageStreamResponse()
}
