import { z } from "zod"

/** מקור ההתראה — צבר מליקויים / תקציב / לוגיסטיקה */
export const notificationTypeSchema = z.enum(["QA", "BUDGET", "LOGISTICS"])
export type NotificationType = z.infer<typeof notificationTypeSchema>

export const notificationSchema = z.object({
  id: z.string().min(1),
  type: notificationTypeSchema,
  message: z.string().min(1),
  isRead: z.boolean(),
  /** ISO-8601 (דמה / שרת) */
  timestamp: z.string().min(1),
})

export type Notification = z.infer<typeof notificationSchema>

/** דמה — מרכז התראות גלובלי (Phase 7.3) */
export const MOCK_NOTIFICATIONS: Notification[] = [
  {
    id: "ntf-seed-qa-wine",
    type: "QA",
    message: "ליקוי קריטי חדש נפתח בעיר היין",
    isRead: false,
    timestamp: "2026-04-11T08:15:00.000Z",
  },
  {
    id: "ntf-seed-budget-materials",
    type: "BUDGET",
    message: "חריגה של 15% בתקציב החומרים",
    isRead: false,
    timestamp: "2026-04-11T07:42:00.000Z",
  },
  {
    id: "ntf-seed-logistics-makita",
    type: "LOGISTICS",
    message: "פטישון מקיטה בפיגור החזרה",
    isRead: false,
    timestamp: "2026-04-10T14:30:00.000Z",
  },
]

export function countUnreadNotifications(items: readonly Notification[]): number {
  return items.filter((n) => !n.isRead).length
}
