import { createSupabaseServerClient } from "@/lib/supabase/server"

export type AnnouncementUrgency = "info" | "warning" | "critical"

export type AnnouncementRow = {
  id: string
  title: string
  content: string
  urgency: AnnouncementUrgency
  is_active: boolean
  created_at: string
  updated_at: string
}

export async function getAnnouncementsForAdmin(): Promise<{
  data: AnnouncementRow[] | null
  error: string | null
}> {
  try {
    const supabase = createSupabaseServerClient()
    const { data, error } = await supabase
      .from("announcements")
      .select("*")
      .order("created_at", { ascending: false })

    if (error) {
      return { data: null, error: error.message }
    }

    return { data: (data ?? []) as AnnouncementRow[], error: null }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "שגיאה לא ידועה"
    return { data: null, error: msg }
  }
}
