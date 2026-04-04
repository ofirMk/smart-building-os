"use server"

import { revalidatePath } from "next/cache"

import { createSupabaseServerAuthClient } from "@/lib/supabase/server-auth"
import { formatError } from "@/lib/utils"

export type MoPoDirectCostCategory =
  | "materials"
  | "subcontract"
  | "equipment"
  | "general"
  | "marketing_overhead"

const CATEGORIES: readonly MoPoDirectCostCategory[] = [
  "materials",
  "subcontract",
  "equipment",
  "general",
  "marketing_overhead",
] as const

function normalizeCategory(raw: string): MoPoDirectCostCategory {
  const s = String(raw ?? "").trim() as MoPoDirectCostCategory
  return CATEGORIES.includes(s) ? s : "materials"
}

export async function updatePurchaseOrderFinanceFields(input: {
  poId: string
  withholding_tax_percent: number
  direct_cost_category: string
}): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const supabase = await createSupabaseServerAuthClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user?.id) return { ok: false, error: "נדרשת התחברות" }

    const poId = input.poId.trim()
    if (!poId) return { ok: false, error: "חסר מזהה הזמנה" }

    const pct = Math.min(100, Math.max(0, Number(input.withholding_tax_percent) || 0))
    const cat = normalizeCategory(input.direct_cost_category)

    const { error } = await supabase
      .from("purchase_orders")
      .update({
        withholding_tax_percent: pct,
        direct_cost_category: cat,
      })
      .eq("id", poId)
      .eq("is_deleted", false)

    if (error) {
      if (/column|does not exist/i.test(error.message)) {
        return { ok: false, error: "הריצו מיגרציה 20260427120000 ב-Supabase" }
      }
      return { ok: false, error: error.message }
    }

    revalidatePath(`/marker-ofek/procurement/${poId}`)
    revalidatePath("/marker-ofek/procurement")
    return { ok: true }
  } catch (e) {
    return { ok: false, error: formatError(e) }
  }
}
