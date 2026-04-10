import { cache } from "react"
import "server-only"

import { createSupabaseServerAuthClient } from "@/lib/supabase/server-auth"
import { formatError } from "@/lib/utils"
import type { GlAccountRow } from "@/types/holden-finance"

/**
 * Chart of accounts for server components only — not a Server Action (avoids extra auth/RPC churn).
 * Deduped per request via React cache().
 */
export const fetchAllGlAccounts = cache(async function fetchAllGlAccounts(): Promise<{
  success: boolean
  data?: GlAccountRow[]
  error?: string
}> {
  try {
    const supabase = await createSupabaseServerAuthClient()
    const { data, error } = await supabase
      .from("gl_accounts")
      .select("*")
      .order("account_code", { ascending: true })

    if (error) throw error
    return { success: true, data: (data ?? []) as GlAccountRow[] }
  } catch (err) {
    console.error("Error fetching GL accounts:", err)
    return { success: false, error: formatError(err) || "Failed to fetch accounts" }
  }
})
