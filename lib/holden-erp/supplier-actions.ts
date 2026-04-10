"use server"

import { revalidatePath } from "next/cache"

import { createServerSupabaseClient } from "@/lib/supabase/server"
import { formatError } from "@/lib/utils"

export async function createQuickSupplierAction(payload: {
  name: string
  supplierType?: string
  taxId?: string
}): Promise<{ success: true; id: string } | { success: false; error: string }> {
  const name = payload.name?.trim() ?? ""
  if (!name) {
    return { success: false, error: "נא להזין שם ספק או קבלן" }
  }

  const supabase = await createServerSupabaseClient()
  const { data, error } = await supabase
    .from("suppliers")
    .insert({
      name,
      supplier_type: payload.supplierType?.trim() || "supplier",
      tax_id: payload.taxId?.trim() || null,
    })
    .select("id")
    .single()

  if (error || !data) {
    return {
      success: false,
      error: formatError(error) || "שמירת הספק נכשלה",
    }
  }

  revalidatePath("/marker-ofek/finance/suppliers")
  return { success: true, id: (data as { id: string }).id }
}
