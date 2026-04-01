/** שורת טבלה ב־UI ניהול קריאות (ממופה מ־Supabase או ממוק) */
export type TicketUrgency = "high" | "medium" | "low"

export type TicketStatusUi =
  | "open"
  | "in_progress"
  | "resolved"
  | "closed"

export type TicketManagementTableRow = {
  /** מפתח יציב לרשימה (מזהה UUID מהמסד או מזהה ייחודי במוק) */
  sourceId: string
  /** מזהה מקוצר להצגה */
  id: string
  location: string
  categoryHe: string
  urgency: TicketUrgency
  status: TicketStatusUi
  openedAtLabel: string
}
