import { NextResponse } from "next/server"

import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role"
import type { TicketPriority, TicketStatus } from "@/types/ticket"

export const dynamic = "force-dynamic"

const PREVENTIVE_TITLE = "[מונעת] בדיקת גנרטור ומשאבות מים"
const PREVENTIVE_DESCRIPTION =
  "בדיקה שבועית אוטומטית למערכות החירום של הבניין"
/** DB uses `priority` (P1–P4); maps from conceptual "medium" urgency. */
const PREVENTIVE_PRIORITY: TicketPriority = "P3"
const PREVENTIVE_STATUS: TicketStatus = "open"

const DEFAULT_CREATOR_PROFILE_ID =
  process.env.DEMO_TICKET_CREATOR_PROFILE_ID?.trim() ||
  "a1111111-1111-4111-8111-111111111101"

function getExpectedAuthHeader(): string | null {
  const secret = process.env.CRON_SECRET?.trim()
  if (!secret) return null
  return `Bearer ${secret}`
}

async function resolveDefaultBuildingId(
  supabase: ReturnType<typeof createSupabaseServiceRoleClient>
): Promise<string | null> {
  const fromEnv = process.env.CHAT_DEFAULT_BUILDING_ID?.trim()
  if (fromEnv) return fromEnv

  const { data } = await supabase.from("buildings").select("id").limit(1)
  const row = data?.[0] as { id?: string } | undefined
  return row?.id ?? null
}

/**
 * Vercel Cron: set `CRON_SECRET` in the project; requests include `Authorization: Bearer <CRON_SECRET>`.
 */
export async function GET(req: Request) {
  const expected = getExpectedAuthHeader()
  if (!expected) {
    return NextResponse.json(
      { ok: false, error: "CRON_SECRET is not configured" },
      { status: 500 }
    )
  }

  const auth = req.headers.get("authorization")
  if (auth !== expected) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 })
  }

  try {
    const supabase = createSupabaseServiceRoleClient()
    const buildingId = await resolveDefaultBuildingId(supabase)

    if (!buildingId) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "No building id: set CHAT_DEFAULT_BUILDING_ID or seed public.buildings",
        },
        { status: 422 }
      )
    }

    const { data, error } = await supabase
      .from("tickets")
      .insert({
        building_id: buildingId,
        title: PREVENTIVE_TITLE,
        description: PREVENTIVE_DESCRIPTION,
        priority: PREVENTIVE_PRIORITY,
        status: PREVENTIVE_STATUS,
        created_by: DEFAULT_CREATOR_PROFILE_ID,
      })
      .select("id, title, status, priority, created_at")
      .single()

    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      )
    }

    return NextResponse.json({
      ok: true,
      message: "Preventive maintenance ticket created",
      tickets: [data],
      // Conceptual urgency; DB column is `priority` (medium → P3).
      meta: { urgency: "medium" as const, priority: PREVENTIVE_PRIORITY },
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error"
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
