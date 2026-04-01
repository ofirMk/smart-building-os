"use server"

import { revalidatePath } from "next/cache"

import { createSupabaseServerClient } from "@/lib/supabase/server"
import type { TicketPriority, TicketStatus } from "@/types/ticket"

/** פרופיל יוצר ברירת מחדל (seed / env) — עד חיבור Auth */
const DEFAULT_CREATOR_PROFILE_ID =
  process.env.DEMO_TICKET_CREATOR_PROFILE_ID?.trim() ||
  "a1111111-1111-4111-8111-111111111101"

const VALID_PRIORITIES: TicketPriority[] = ["P1", "P2", "P3", "P4"]

function isTicketPriority(value: string): value is TicketPriority {
  return VALID_PRIORITIES.includes(value as TicketPriority)
}

const VALID_STATUSES: TicketStatus[] = [
  "open",
  "in_progress",
  "resolved",
  "closed",
]

function isTicketStatus(value: string): value is TicketStatus {
  return VALID_STATUSES.includes(value as TicketStatus)
}

export async function updateTicketStatus(
  ticketId: string,
  newStatus: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!ticketId?.trim()) {
    return { ok: false, error: "מזהה קריאה חסר" }
  }

  if (!isTicketStatus(newStatus)) {
    return { ok: false, error: "סטטוס לא חוקי" }
  }

  const supabase = createSupabaseServerClient()

  const payload: {
    status: TicketStatus
    resolved_at: string | null
  } = {
    status: newStatus,
    resolved_at:
      newStatus === "resolved" || newStatus === "closed"
        ? new Date().toISOString()
        : null,
  }

  const { error } = await supabase
    .from("tickets")
    .update(payload)
    .eq("id", ticketId)

  if (error) {
    return {
      ok: false,
      error: error.message || "עדכון הסטטוס נכשל",
    }
  }

  revalidatePath("/tickets")
  return { ok: true }
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export async function updateTicketVendor(
  ticketId: string,
  vendorId: string | null
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!ticketId?.trim()) {
    return { ok: false, error: "מזהה קריאה חסר" }
  }

  if (vendorId !== null && !UUID_RE.test(vendorId)) {
    return { ok: false, error: "מזהה קבלן לא חוקי" }
  }

  const supabase = createSupabaseServerClient()

  const { error } = await supabase
    .from("tickets")
    .update({ vendor_id: vendorId })
    .eq("id", ticketId)

  if (error) {
    return {
      ok: false,
      error: error.message || "עדכון הקבלן נכשל",
    }
  }

  revalidatePath("/tickets")
  return { ok: true }
}

export async function createTicket(
  formData: FormData
): Promise<{ ok: true } | { ok: false; error: string }> {
  const title = String(formData.get("title") ?? "").trim()
  const descriptionRaw = String(formData.get("description") ?? "").trim()
  const buildingId = String(formData.get("building_id") ?? "").trim()
  const priorityRaw = String(formData.get("priority") ?? "P3").trim()

  if (!title) {
    return { ok: false, error: "יש למלא נושא לקריאה" }
  }

  if (!buildingId) {
    return { ok: false, error: "יש לבחור בניין" }
  }

  if (!isTicketPriority(priorityRaw)) {
    return { ok: false, error: "עדיפות לא חוקית" }
  }

  const supabase = createSupabaseServerClient()

  const { error } = await supabase.from("tickets").insert({
    building_id: buildingId,
    title,
    description: descriptionRaw.length > 0 ? descriptionRaw : null,
    priority: priorityRaw,
    status: "open",
    created_by: DEFAULT_CREATOR_PROFILE_ID,
  })

  if (error) {
    return {
      ok: false,
      error: error.message || "פתיחת הקריאה נכשלה",
    }
  }

  revalidatePath("/tickets")
  return { ok: true }
}
