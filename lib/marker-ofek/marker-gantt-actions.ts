"use server"

import { z } from "zod"

import {
  fetchProjectTasks,
  updateTaskGridRow,
} from "@/lib/marker-ofek/gantt-actions"
import { formatError } from "@/lib/utils"

// NOTE: Next.js 16 forbids non-async exports from "use server" modules.
// Schema is consumed only inside `patchMarkerGanttTaskAction` below, so the
// `export` keyword was dropped. The inferred type was unused externally and
// removed entirely.
const markerGanttQuickEditSchema = z
  .object({
    projectId: z.string().uuid("מזהה פרויקט לא תקין"),
    taskId: z.string().uuid("מזהה משימה לא תקין"),
    startDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "תאריך התחלה חייב בפורמט YYYY-MM-DD"),
    endDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "תאריך סיום חייב בפורמט YYYY-MM-DD"),
    progress: z.coerce
      .number()
      .min(0, "אחוז התקדמות מינימום 0")
      .max(100, "אחוז התקדמות מקסימום 100"),
  })
  .refine((d) => d.startDate <= d.endDate, {
    message: "תאריך ההתחלה חייב להיות לפני או ביום הסיום",
    path: ["endDate"],
  })

export async function patchMarkerGanttTaskAction(
  raw: unknown
): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = markerGanttQuickEditSchema.safeParse(raw)
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => i.message).join(" · ")
    return { ok: false, error: msg || "נתונים לא תקינים" }
  }
  const p = parsed.data
  try {
    const tasks = await fetchProjectTasks(p.projectId)
    const row = tasks.find((t) => t.id === p.taskId)
    if (!row) {
      return { ok: false, error: "המשימה לא נמצאה בפרויקט" }
    }
    await updateTaskGridRow({
      taskId: p.taskId,
      projectId: p.projectId,
      name: row.name,
      startDate: p.startDate,
      endDate: p.endDate,
      progress: p.progress,
    })
    return { ok: true }
  } catch (e) {
    return { ok: false, error: formatError(e) }
  }
}
