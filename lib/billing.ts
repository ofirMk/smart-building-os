import { createSupabaseServerClient } from "@/lib/supabase/server"
import type { InvoiceWithTenant } from "@/types/billing"

export type TenantOption = {
  id: string
  full_name: string | null
  email: string | null
}

export async function getTenantOptionsForBilling(): Promise<{
  data: TenantOption[] | null
  error: string | null
}> {
  try {
    const supabase = createSupabaseServerClient()
    const { data, error } = await supabase
      .from("profiles")
      .select("id, full_name, email")
      .eq("role", "tenant")
      .order("full_name", { ascending: true })

    if (error) {
      return { data: null, error: error.message }
    }

    return { data: (data ?? []) as TenantOption[], error: null }
  } catch (e) {
    const message = e instanceof Error ? e.message : "שגיאה לא ידועה"
    return { data: null, error: message }
  }
}

export async function getInvoicesWithTenants(): Promise<{
  data: InvoiceWithTenant[] | null
  error: string | null
}> {
  try {
    const supabase = createSupabaseServerClient()
    const { data, error } = await supabase
      .from("invoices")
      .select(
        `
        id,
        tenant_id,
        amount,
        description,
        due_date,
        status,
        paid_at,
        created_at,
        updated_at,
        profiles ( full_name, email )
      `
      )
      .order("due_date", { ascending: true })

    if (error) {
      return { data: null, error: error.message }
    }

    return { data: (data ?? []) as unknown as InvoiceWithTenant[], error: null }
  } catch (e) {
    const message = e instanceof Error ? e.message : "שגיאה לא ידועה"
    return { data: null, error: message }
  }
}

