import { createSupabaseServerClient } from "@/lib/supabase/server"
import type { PreventiveTaskRow } from "@/types/preventive-maintenance"

export async function getPreventiveTasks(): Promise<{
  data: PreventiveTaskRow[] | null
  error: string | null
}> {
  try {
    const supabase = createSupabaseServerClient()
    const { data, error } = await supabase
      .from("preventive_tasks")
      .select("*")
      .order("next_due_date", { ascending: true })

    if (error) {
      return { data: null, error: error.message }
    }

    return { data: (data ?? []) as PreventiveTaskRow[], error: null }
  } catch (e) {
    const message = e instanceof Error ? e.message : "שגיאה לא ידועה"
    return { data: null, error: message }
  }
}
