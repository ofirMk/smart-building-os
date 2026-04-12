import { z } from "zod"

import { ATTENDANCE_MOCK_WORKERS } from "@/lib/marker-ofek/attendance-schema"

/**
 * Phase 9.2 — אישור שעות ושכר.
 * עובדים מסונכרנים עם Phase 7.2 (`ATTENDANCE_MOCK_WORKERS` / `MOCK_WORKER_OPTIONS`).
 *
 * @database-layer — `@@index([month])`, מפתח ייחודי לפי עובד/חודש — ראו `DATA_LAYER_INDEXING.md`.
 */

export const TIMESHEET_WORKER_STATUS_IDS = ["pending", "approved"] as const
export type TimesheetWorkerStatusId = (typeof TIMESHEET_WORKER_STATUS_IDS)[number]

export const timesheetWorkerStatusSchema = z.enum(TIMESHEET_WORKER_STATUS_IDS)

/** שורת עובד בטופס חודשי — שעות כמספר (טפסים: coerce ממחרוזת) */
export const timesheetWorkerRowFormSchema = z.object({
  /** מפתח יציב לניווט Master–Detail וקישורי URL */
  workerId: z.string().min(1, "מזהה עובד"),
  workerName: z.string().min(1, "שם עובד"),
  regularHours: z.coerce.number().min(0, "מינ׳ 0"),
  overtimeHours: z.coerce.number().min(0, "מינ׳ 0"),
  status: timesheetWorkerStatusSchema,
})

export const monthlyTimesheetFormSchema = z.object({
  month: z
    .string()
    .regex(/^\d{4}-\d{2}$/, "פורמט חודש: yyyy-mm"),
  workers: z.array(timesheetWorkerRowFormSchema).min(1),
})

export type MonthlyTimesheetFormInput = z.input<typeof monthlyTimesheetFormSchema>
export type MonthlyTimesheetFormOutput = z.output<typeof monthlyTimesheetFormSchema>

/** סף אזהרה ענבר: מעל X שעות בחודש */
export const MONTHLY_HOURS_AMBER_THRESHOLD = 180
/** סף אזהרה אדומה: מעל X שעות בחודש */
export const MONTHLY_HOURS_RED_THRESHOLD = 200

/** O(1) — סכימת שעות לשורת עובד בודדת */
export function computeMonthlyTotalHours(
  regularHours: number,
  overtimeHours: number
): number {
  const t = regularHours + overtimeHours
  return Math.round(t * 100) / 100
}

export type MonthlyHoursAlertLevel = "ok" | "amber" | "red"

export function monthlyHoursAlertLevel(total: number): MonthlyHoursAlertLevel {
  if (total > MONTHLY_HOURS_RED_THRESHOLD) return "red"
  if (total > MONTHLY_HOURS_AMBER_THRESHOLD) return "amber"
  return "ok"
}

/**
 * דמה: שעות מצטברות חודשיות «מבוססות» לוגיקת נוכחות יומית (הפרש כניסה–יציאה),
 * עם פיזור ריאלי בין רגילות לנוספות (ימי חול / שבת וכו׳).
 */
export function buildMockMonthlyTimesheetWorkers(): MonthlyTimesheetFormOutput["workers"] {
  const w = ATTENDANCE_MOCK_WORKERS
  return [
    {
      workerId: w[0]?.id ?? "mo-worker-1",
      workerName: w[0]?.name ?? "דני לוי",
      regularHours: 158,
      overtimeHours: 18,
      status: "pending",
    },
    {
      workerId: w[1]?.id ?? "mo-worker-2",
      workerName: w[1]?.name ?? "מאיר אברהם",
      regularHours: 160,
      overtimeHours: 35,
      status: "pending",
    },
    {
      workerId: w[2]?.id ?? "mo-worker-3",
      workerName: w[2]?.name ?? "יוסי כהן",
      regularHours: 172,
      overtimeHours: 42,
      status: "pending",
    },
    {
      workerId: w[3]?.id ?? "mo-worker-4",
      workerName: w[3]?.name ?? "רונית שמעוני",
      regularHours: 150,
      overtimeHours: 8,
      status: "approved",
    },
    {
      workerId: w[4]?.id ?? "mo-worker-5",
      workerName: w[4]?.name ?? "עומר חדד",
      regularHours: 144,
      overtimeHours: 22,
      status: "pending",
    },
  ]
}

export function currentMonthYyyyMm(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  return `${y}-${m}`
}

export function defaultMonthlyTimesheetFormValues(): MonthlyTimesheetFormOutput {
  return {
    month: currentMonthYyyyMm(),
    workers: buildMockMonthlyTimesheetWorkers(),
  }
}
