"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"

import { createSupabaseServerAuthClient } from "@/lib/supabase/server-auth"
import type { TicketPriority } from "@/types/ticket"

/** בניין ברירת מחדל לפורטל דיירים — seed / env */
const DEFAULT_TENANT_BUILDING_ID =
  process.env.TENANT_DEFAULT_BUILDING_ID?.trim() ||
  "b1111111-1111-4111-8111-111111111111"

const tenantTicketSchema = z.object({
  title: z.string().min(1, "נא למלא נושא").max(500),
  description: z.string().max(8000).optional(),
  urgency: z.enum(["normal", "urgent", "critical"]),
})

function urgencyToPriority(
  urgency: z.infer<typeof tenantTicketSchema>["urgency"]
): TicketPriority {
  switch (urgency) {
    case "critical":
      return "P1"
    case "urgent":
      return "P2"
    case "normal":
    default:
      return "P3"
  }
}

export type CreateTenantTicketResult =
  | { ok: true }
  | { ok: false; error: string }

export async function createTenantTicket(
  input: unknown
): Promise<CreateTenantTicketResult> {
  const parsed = tenantTicketSchema.safeParse(input)
  if (!parsed.success) {
    const first = parsed.error.issues[0]?.message ?? "נתונים לא תקינים"
    return { ok: false, error: first }
  }

  const supabase = await createSupabaseServerAuthClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return { ok: false, error: "נדרשת התחברות לפתיחת קריאה" }
  }

  const { title, description, urgency } = parsed.data
  const descriptionTrimmed = description?.trim() ?? ""
  const descriptionValue =
    descriptionTrimmed.length > 0 ? descriptionTrimmed : null

  const { error } = await supabase.from("tickets").insert({
    building_id: DEFAULT_TENANT_BUILDING_ID,
    title,
    description: descriptionValue,
    priority: urgencyToPriority(urgency),
    status: "open",
    created_by: user.id,
  })

  if (error) {
    return {
      ok: false,
      error: error.message || "פתיחת הקריאה נכשלה",
    }
  }

  revalidatePath("/tenant/tickets")
  revalidatePath("/tenant")
  revalidatePath("/tickets")
  return { ok: true }
}
