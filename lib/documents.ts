import { createSupabaseServerClient } from "@/lib/supabase/server"
import type { DocumentRow } from "@/types/documents"

export async function getDocuments(): Promise<{
  data: DocumentRow[] | null
  error: string | null
}> {
  try {
    const supabase = createSupabaseServerClient()
    const { data, error } = await supabase
      .from("documents")
      .select("*")
      .order("created_at", { ascending: false })

    if (error) {
      return { data: null, error: error.message }
    }

    return { data: (data ?? []) as DocumentRow[], error: null }
  } catch (e) {
    const message = e instanceof Error ? e.message : "שגיאה לא ידועה"
    return { data: null, error: message }
  }
}
