import { addDays, isBefore, parse, startOfDay } from "date-fns"

export type DueHighlight = "overdue" | "upcoming" | "ok"

/**
 * השוואת תאריך יעד (YYYY-MM-DD) מול היום — איחור / בשבוע הקרוב / רחוק יותר.
 */
export function classifyDueHighlight(
  nextDueDateIso: string,
  now: Date = new Date()
): DueHighlight {
  const due = startOfDay(parse(nextDueDateIso, "yyyy-MM-dd", new Date()))
  const today = startOfDay(now)
  const weekEnd = addDays(today, 7)

  if (isBefore(due, today)) {
    return "overdue"
  }
  if (isBefore(weekEnd, due)) {
    return "ok"
  }
  return "upcoming"
}
