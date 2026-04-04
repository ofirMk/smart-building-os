"use server"

import { headers } from "next/headers"

import { createSupabaseServerAuthClient } from "@/lib/supabase/server-auth"
import { formatError } from "@/lib/utils"

export type MoAuditManualPayload = {
  action_type: "INSERT" | "UPDATE" | "DELETE"
  table_name: string
  project_id?: string | null
  old_data?: Record<string, unknown> | null
  new_data?: Record<string, unknown> | null
}

/**
 * שכבת אפליקציה משלימה לטריגרים ב־DB — לשימוש מ־server actions כשצריך IP או אירוע מחוץ לטבלאות המנוטרות.
 */
export async function logMoAuditEvent(
  payload: MoAuditManualPayload
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const supabase = await createSupabaseServerAuthClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user?.id) {
      return { ok: false, error: "נדרשת התחברות לרישום ביקורת" }
    }

    let ip: string | null = null
    try {
      const h = await headers()
      const xf = h.get("x-forwarded-for")
      ip = xf?.split(",")[0]?.trim() ?? h.get("x-real-ip")
    } catch {
      ip = null
    }

    const { error } = await supabase.from("mo_audit_logs").insert({
      user_id: user.id,
      project_id: payload.project_id ?? null,
      action_type: payload.action_type,
      table_name: payload.table_name,
      old_data: payload.old_data ?? null,
      new_data: payload.new_data ?? null,
      ip_address: ip,
    })
    if (error) return { ok: false, error: error.message }
    return { ok: true }
  } catch (e) {
    return { ok: false, error: formatError(e) }
  }
}
