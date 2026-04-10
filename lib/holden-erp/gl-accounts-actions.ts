"use server"

import { revalidatePath } from "next/cache"

import { createSupabaseServerAuthClient } from "@/lib/supabase/server-auth"
import { formatError } from "@/lib/utils"

export async function deleteAllGlAccounts(): Promise<{
  success: boolean
  error?: string
}> {
  try {
    const supabase = await createSupabaseServerAuthClient()
    const { error } = await supabase
      .from("gl_accounts")
      .delete()
      .neq("account_code", "")

    if (error) throw error

    revalidatePath("/marker-ofek/finance/gl-accounts")
    return { success: true }
  } catch (err) {
    console.error("Error deleting accounts:", err)
    return {
      success: false,
      error: formatError(err) || "Failed to delete accounts",
    }
  }
}
