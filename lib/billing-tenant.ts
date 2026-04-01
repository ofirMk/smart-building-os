import { createSupabaseServerAuthClient } from "@/lib/supabase/server-auth"
import type { InvoiceRow } from "@/types/billing"

/**
 * חשבוניות של הדייר המחובר (RLS: רק שורות עם tenant_id = auth.uid()).
 */
export async function getMyInvoices(): Promise<{
  data: InvoiceRow[] | null
  error: string | null
}> {
  try {
    const supabase = await createSupabaseServerAuthClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return { data: null, error: "לא מחובר" }
    }

    const { data, error } = await supabase
      .from("invoices")
      .select("*")
      .order("due_date", { ascending: false })

    if (error) {
      return { data: null, error: error.message }
    }

    return { data: (data ?? []) as InvoiceRow[], error: null }
  } catch (e) {
    const message = e instanceof Error ? e.message : "שגיאה לא ידועה"
    return { data: null, error: message }
  }
}
