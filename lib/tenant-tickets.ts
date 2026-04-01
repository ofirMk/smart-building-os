import { createSupabaseServerAuthClient } from "@/lib/supabase/server-auth"
import type { TicketStatus } from "@/types/ticket"

export type TenantTicketListItem = {
  id: string
  title: string
  status: TicketStatus
  created_at: string
}

/**
 * רשימת קריאות של המשתמש המחובר בלבד.
 */
export async function getTenantTicketsListForUser(
  profileId: string,
  limit = 10
): Promise<{ data: TenantTicketListItem[]; error: string | null }> {
  try {
    const supabase = await createSupabaseServerAuthClient()
    const { data, error } = await supabase
      .from("tickets")
      .select("id, title, status, created_at")
      .eq("created_by", profileId)
      .order("created_at", { ascending: false })
      .limit(limit)

    if (error) {
      return { data: [], error: error.message }
    }

    return {
      data: (data ?? []) as TenantTicketListItem[],
      error: null,
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : "שגיאה לא ידועה"
    return { data: [], error: message }
  }
}
