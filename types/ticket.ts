export type TicketPriority = "P1" | "P2" | "P3" | "P4"

export type TicketStatus = "open" | "in_progress" | "resolved" | "closed"

/** Row shape returned from `public.tickets` via Supabase */
export type TicketRow = {
  id: string
  building_id: string
  apartment_id: string | null
  title: string
  description: string | null
  priority: TicketPriority
  status: TicketStatus
  sla_due_at: string | null
  created_by: string
  assigned_to: string | null
  contractor_id: string | null
  /** חברה חיצונית מהטבלה vendors (לאחר מיגרציה) */
  vendor_id?: string | null
  created_at: string
  updated_at: string
  resolved_at: string | null
}
