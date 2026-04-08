"use server"

import { revalidatePath } from "next/cache"

import { createSupabaseServerAuthClient } from "@/lib/supabase/server-auth"
import { formatError } from "@/lib/utils"

export async function holdenUpdateContractBoqLine(
  contractId: string,
  lineId: string,
  patch: {
    section_number?: string
    description?: string
    unit?: string
    quantity?: number
    unit_price?: number
  }
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const supabase = await createSupabaseServerAuthClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user?.id) {
      return { ok: false, error: "נדרשת התחברות" }
    }

    const cid = contractId.trim()
    const lid = lineId.trim()
    if (!cid || !lid) return { ok: false, error: "חסרים מזהים" }

    const update: Record<string, unknown> = {}
    if (patch.section_number !== undefined) update.section_number = patch.section_number
    if (patch.description !== undefined) update.description = patch.description
    if (patch.unit !== undefined) update.unit = patch.unit
    if (patch.quantity !== undefined) update.quantity = patch.quantity
    if (patch.unit_price !== undefined) update.unit_price = patch.unit_price

    const { error } = await supabase
      .from("contract_line_items")
      .update(update)
      .eq("id", lid)
      .eq("contract_id", cid)

    if (error) throw error

    revalidatePath(`/marker-ofek/holden-erp/contracts/${cid}`)
    return { ok: true }
  } catch (e) {
    return { ok: false, error: formatError(e) }
  }
}
