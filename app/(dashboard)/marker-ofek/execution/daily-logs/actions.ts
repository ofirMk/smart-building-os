"use server"

import { revalidatePath } from "next/cache"

import { formatError } from "@/lib/format-error"
import { createSupabaseServerAuthClient } from "@/lib/supabase/server-auth"

const EXECUTION_PATH = "/marker-ofek/execution/daily-logs/new"

export type DailyLogWeather = "sunny" | "cloudy" | "rain" | "heat_wind"

export type SaveDailyLogResult =
  | { ok: true }
  | { ok: false; error: string }

export async function saveDailyLog(input: {
  tenderId: string
  logDate: string
  weather: DailyLogWeather
  workersOnSite: number
  workDescription: string
  safetyQualityNotes: string
}): Promise<SaveDailyLogResult> {
  const tenderId = input.tenderId?.trim()
  if (!tenderId) {
    return { ok: false, error: "נא לבחור פרויקט (מכרז)" }
  }

  const logDate = input.logDate?.trim()
  if (!logDate || !/^\d{4}-\d{2}-\d{2}$/.test(logDate)) {
    return { ok: false, error: "תאריך לא תקין" }
  }

  const weather = input.weather
  if (
    weather !== "sunny" &&
    weather !== "cloudy" &&
    weather !== "rain" &&
    weather !== "heat_wind"
  ) {
    return { ok: false, error: "נא לבחור מזג אוויר" }
  }

  const workers = Math.floor(Number(input.workersOnSite))
  if (!Number.isFinite(workers) || workers < 0) {
    return { ok: false, error: "מספר עובדים לא תקין" }
  }

  const workDescription = input.workDescription?.trim() ?? ""
  if (workDescription.length < 1) {
    return { ok: false, error: "נא למלא תיאור עבודה / משימות שבוצעו" }
  }

  const safety = input.safetyQualityNotes?.trim() ?? ""
  const safetyQualityNotes = safety.length > 0 ? safety : null

  try {
    const supabase = await createSupabaseServerAuthClient()
    const { error } = await supabase.from("daily_logs").insert({
      tender_id: tenderId,
      log_date: logDate,
      weather,
      workers_on_site: workers,
      work_description: workDescription,
      safety_quality_notes: safetyQualityNotes,
    })

    if (error) {
      return { ok: false, error: error.message }
    }

    revalidatePath(EXECUTION_PATH)
    return { ok: true }
  } catch (e) {
    return { ok: false, error: formatError(e) }
  }
}
