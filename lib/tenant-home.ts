import { createSupabaseServerAuthClient } from "@/lib/supabase/server-auth"
import type { TicketStatus } from "@/types/ticket"

export type TenantRecentTicket = {
  id: string
  title: string
  status: TicketStatus
}

/**
 * קריאות אחרונות של המשתמש המחובר בלבד (`created_by` = מזהה פרופיל = auth.uid).
 */
export async function getRecentTenantTicketsForUser(
  profileId: string,
  limit = 3
): Promise<{ data: TenantRecentTicket[]; error: string | null }> {
  try {
    const supabase = await createSupabaseServerAuthClient()
    const { data, error } = await supabase
      .from("tickets")
      .select("id, title, status")
      .eq("created_by", profileId)
      .order("created_at", { ascending: false })
      .limit(limit)

    if (error) {
      return { data: [], error: error.message }
    }

    return {
      data: (data ?? []) as TenantRecentTicket[],
      error: null,
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : "שגיאה לא ידועה"
    return { data: [], error: message }
  }
}
