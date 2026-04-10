"use server"

import { revalidatePath } from "next/cache"

import {
  glAccountImportSchema,
  type GlAccountImportInput,
} from "@/lib/marker-ofek/erp-validation-schemas"
import { createSupabaseServerAuthClient } from "@/lib/supabase/server-auth"
import { formatError } from "@/lib/utils"

const UPSERT_CHUNK = 200

function normalizeGlAccountImportRow(row: unknown): unknown {
  if (row == null || typeof row !== "object") return row
  const o = { ...(row as Record<string, unknown>) }
  for (const key of [
    "account_code",
    "account_name_he",
    "account_name_en",
    "trial_balance_group",
    "financial_statement_category",
  ]) {
    const v = o[key]
    if (typeof v === "string") o[key] = v.trim()
  }
  const ia = o.is_active
  if (typeof ia === "string") {
    const s = ia.trim().toLowerCase()
    if (s === "false" || s === "0" || s === "no") o.is_active = false
    else o.is_active = true
  }
  return o
}

export type BulkImportGlAccountsResult =
  | { success: true; count: number; errors?: string[] }
  | { success: false; error: string; details?: string[] }

export async function bulkImportGlAccounts(
  rawAccounts: unknown[]
): Promise<BulkImportGlAccountsResult> {
  try {
    const supabase = await createSupabaseServerAuthClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user?.id) {
      return { success: false, error: "נדרשת התחברות" }
    }

    const rows = Array.isArray(rawAccounts) ? rawAccounts : []
    const validAccounts: GlAccountImportInput[] = []
    const errors: string[] = []

    rows.forEach((row, index) => {
      const parsed = glAccountImportSchema.safeParse(
        normalizeGlAccountImportRow(row)
      )
      if (parsed.success) {
        validAccounts.push(parsed.data)
      } else {
        errors.push(
          `Row ${index + 1}: ${parsed.error.issues.map((i) => i.message).join(", ")}`
        )
      }
    })

    if (validAccounts.length === 0) {
      return {
        success: false,
        error: "לא נמצאו נתונים תקינים לייבוא.",
        details: errors.length > 0 ? errors : undefined,
      }
    }

    for (let i = 0; i < validAccounts.length; i += UPSERT_CHUNK) {
      const chunk = validAccounts.slice(i, i + UPSERT_CHUNK)
      const { error: dbError } = await supabase
        .from("gl_accounts")
        .upsert(chunk, { onConflict: "account_code" })

      if (dbError) {
        console.error("Supabase upsert error:", dbError)
        return {
          success: false,
          error: "שגיאה בשמירת הנתונים במסד.",
          details: errors.length > 0 ? errors : undefined,
        }
      }
    }

    revalidatePath("/marker-ofek/finance/gl-accounts")
    return {
      success: true,
      count: validAccounts.length,
      errors: errors.length > 0 ? errors : undefined,
    }
  } catch (err) {
    console.error("Bulk import failed:", err)
    return { success: false, error: formatError(err) || "שגיאת מערכת בלתי צפויה." }
  }
}
