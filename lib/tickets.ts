import { createSupabaseServerClient } from "@/lib/supabase/server"
import type { TicketRow } from "@/types/ticket"

export async function getTickets(): Promise<{
  data: TicketRow[] | null
  error: string | null
}> {
  try {
    const supabase = createSupabaseServerClient()
    const { data, error } = await supabase
      .from("tickets")
      .select("*")
      .order("created_at", { ascending: false })

    if (error) {
      return { data: null, error: error.message }
    }

    return { data: (data ?? []) as TicketRow[], error: null }
  } catch (e) {
    const message = e instanceof Error ? e.message : "שגיאה לא ידועה"
    return { data: null, error: message }
  }
}
