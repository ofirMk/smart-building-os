import { z } from "zod"

import { MOCK_WORKER_OPTIONS } from "@/lib/marker-ofek/asset-tracking-schema"

/** תואם Phase 6.2 — שמות עובדים; מזהים יציבים לטפסים */
export const ATTENDANCE_MOCK_WORKERS: readonly {
  id: string
  name: string
}[] = MOCK_WORKER_OPTIONS.map((name, i) => ({
  id: `mo-worker-${i + 1}`,
  name,
}))

export const ATTENDANCE_MOCK_PROJECTS: readonly {
  id: string
  label: string
}[] = [
  { id: "prj-gindi-towers-a", label: "גינדי TLV — מגדל A" },
  { id: "prj-gindi-logistics", label: "גינדי לוגיסטיקה פארק 7" },
  { id: "prj-wine-city", label: "מתחם עיר היין — שלב ביצוע" },
]

/** סטטוס מיקום (GPS דמה) */
export const LOCATION_STATUS_IDS = ["onsite_ok", "offsite_alert"] as const
export type LocationStatusId = (typeof LOCATION_STATUS_IDS)[number]

export const LOCATION_STATUS_LABELS: Record<LocationStatusId, string> = {
  onsite_ok: "תקין - באתר",
  offsite_alert: "חריג - מחוץ לאתר",
}

/**
 * רשומת נוכחות יומית — שדות לפי דרישת ERP.
 * זמנים בפורמט HH:mm (מקומי) ליום `dateIso`.
 */
export const attendanceClockSchema = z
  .object({
    workerId: z.string().min(1, "נא לבחור עובד"),
    projectId: z.string().min(1, "נא לבחור פרויקט"),
    clockInTime: z.string().min(1, "שעת כניסה"),
    clockOutTime: z.string().nullable().optional(),
    locationStatus: z.enum(LOCATION_STATUS_IDS),
  })
  .superRefine((data, ctx) => {
    if (data.clockOutTime && data.clockInTime) {
      if (data.clockOutTime < data.clockInTime) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["clockOutTime"],
          message: "שעת יציאה חייבת להיות אחרי שעת כניסה (אותו יום)",
        })
      }
    }
  })

export type AttendanceClockInput = z.input<typeof attendanceClockSchema>
export type AttendanceClockOutput = z.output<typeof attendanceClockSchema>

/** שורה ביומן התצוגה — עובדים פעילים היום */
export type AttendanceDayRow = {
  id: string
  workerId: string
  workerName: string
  projectId: string
  projectLabel: string
  /** yyyy-mm-dd */
  dateIso: string
  clockInTime: string
  clockOutTime: string | null
  locationStatus: LocationStatusId
}

export function workerNameById(workerId: string): string {
  return ATTENDANCE_MOCK_WORKERS.find((w) => w.id === workerId)?.name ?? workerId
}

export function projectLabelById(projectId: string): string {
  return (
    ATTENDANCE_MOCK_PROJECTS.find((p) => p.id === projectId)?.label ?? projectId
  )
}

/** שעות יומיות (דמה) — הפרש בין כניסה ליציאה */
export function computeDailyHoursDecimal(
  clockIn: string,
  clockOut: string | null
): number | null {
  if (!clockOut) return null
  const [ih, im] = clockIn.split(":").map(Number)
  const [oh, om] = clockOut.split(":").map(Number)
  if (
    [ih, im, oh, om].some(
      (n) => typeof n !== "number" || !Number.isFinite(n)
    )
  ) {
    return null
  }
  const start = ih * 60 + im
  const end = oh * 60 + om
  const diff = end - start
  if (diff < 0) return null
  return Math.round((diff / 60) * 100) / 100
}
