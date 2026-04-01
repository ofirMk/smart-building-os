"use server"

import { format } from "date-fns"
import { revalidatePath } from "next/cache"

import { computeNextDueDateFromCompletion } from "@/lib/preventive-maintenance-schedule"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import type {
  PreventiveTaskFrequency,
  PreventiveTaskStatus,
} from "@/types/preventive-maintenance"

export type MaintenanceActionState = {
  ok: boolean
  message: string
}

const FREQUENCIES: PreventiveTaskFrequency[] = [
  "monthly",
  "semi_annual",
  "annual",
]

function isFrequency(v: string): v is PreventiveTaskFrequency {
  return FREQUENCIES.includes(v as PreventiveTaskFrequency)
}

function toDateOnly(d: Date): string {
  return format(d, "yyyy-MM-dd")
}

export async function createPreventiveTask(
  _prev: MaintenanceActionState,
  formData: FormData
): Promise<MaintenanceActionState> {
  const title = String(formData.get("title") ?? "").trim()
  const systemType = String(formData.get("system_type") ?? "").trim()
  const frequencyRaw = String(formData.get("frequency") ?? "").trim()
  const nextDueRaw = String(formData.get("next_due_date") ?? "").trim()
  const vendorRaw = String(formData.get("vendor_id") ?? "").trim()

  if (!title) {
    return { ok: false, message: "נא למלא כותרת למשימה." }
  }
  if (!systemType) {
    return { ok: false, message: "נא לבחור או להזין סוג מערכת." }
  }
  if (!isFrequency(frequencyRaw)) {
    return { ok: false, message: "תדירות לא חוקית." }
  }
  if (!nextDueRaw || !/^\d{4}-\d{2}-\d{2}$/.test(nextDueRaw)) {
    return { ok: false, message: "נא לבחור תאריך יעד." }
  }

  const vendorId = vendorRaw.length > 0 ? vendorRaw : null

  try {
    const supabase = createSupabaseServerClient()
    const { error } = await supabase.from("preventive_tasks").insert({
      title,
      system_type: systemType,
      frequency: frequencyRaw,
      next_due_date: nextDueRaw,
      vendor_id: vendorId,
      status: "pending" satisfies PreventiveTaskStatus,
    })

    if (error) {
      return { ok: false, message: error.message }
    }

    revalidatePath("/maintenance")
    return { ok: true, message: "המשימה נוספה בהצלחה." }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "שגיאה בשמירה"
    return { ok: false, message: msg }
  }
}

export async function completePreventiveTask(
  taskId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!taskId?.trim()) {
    return { ok: false, error: "מזהה משימה חסר" }
  }

  const supabase = createSupabaseServerClient()

  const { data: row, error: fetchErr } = await supabase
    .from("preventive_tasks")
    .select("id, frequency")
    .eq("id", taskId)
    .maybeSingle()

  if (fetchErr || !row) {
    return {
      ok: false,
      error: fetchErr?.message ?? "המשימה לא נמצאה",
    }
  }

  const frequency = row.frequency as PreventiveTaskFrequency
  if (!isFrequency(frequency)) {
    return { ok: false, error: "תדירות לא תקינה במשימה" }
  }

  const now = new Date()
  const nextDue = computeNextDueDateFromCompletion(frequency, now)

  const { error } = await supabase
    .from("preventive_tasks")
    .update({
      status: "pending",
      last_completed_at: now.toISOString(),
      next_due_date: toDateOnly(nextDue),
    })
    .eq("id", taskId)

  if (error) {
    return { ok: false, error: error.message || "עדכון נכשל" }
  }

  revalidatePath("/maintenance")
  return { ok: true }
}
