import { createSupabaseServerClient } from "@/lib/supabase/server"
import type { VendorRow } from "@/types/vendor"

export async function getVendorsForAdmin(): Promise<{
  data: VendorRow[] | null
  error: string | null
}> {
  try {
    const supabase = createSupabaseServerClient()
    const { data, error } = await supabase
      .from("vendors")
      .select("*")
      .order("name", { ascending: true })

    if (error) {
      return { data: null, error: error.message }
    }

    return { data: (data ?? []) as VendorRow[], error: null }
  } catch (e) {
    const message = e instanceof Error ? e.message : "שגיאה לא ידועה"
    return { data: null, error: message }
  }
}

/** קבלנים פעילים לבחירה בקריאות */
export async function getActiveVendors(): Promise<{
  data: VendorRow[] | null
  error: string | null
}> {
  try {
    const supabase = createSupabaseServerClient()
    const { data, error } = await supabase
      .from("vendors")
      .select("*")
      .eq("is_active", true)
      .order("name", { ascending: true })

    if (error) {
      return { data: null, error: error.message }
    }

    return { data: (data ?? []) as VendorRow[], error: null }
  } catch (e) {
    const message = e instanceof Error ? e.message : "שגיאה לא ידועה"
    return { data: null, error: message }
  }
}
