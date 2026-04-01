import { addMonths, addYears, startOfDay } from "date-fns"

import type { PreventiveTaskFrequency } from "@/types/preventive-maintenance"

/**
 * מחשב תאריך יעד הבא אחרי ביצוע משימה (מבוסס על מועד הסיום).
 */
export function computeNextDueDateFromCompletion(
  frequency: PreventiveTaskFrequency,
  completedAt: Date
): Date {
  const base = startOfDay(completedAt)
  switch (frequency) {
    case "monthly":
      return addMonths(base, 1)
    case "semi_annual":
      return addMonths(base, 6)
    case "annual":
      return addYears(base, 1)
    default:
      return addMonths(base, 1)
  }
}
