"use server"

import { revalidatePath } from "next/cache"

import {
  quickEntitySchema,
  type QuickEntityInput,
} from "@/lib/marker-ofek/erp-validation-schemas"
import { logMoAuditEvent } from "@/lib/marker-ofek/audit-log"
import { createSupabaseServerAuthClient } from "@/lib/supabase/server-auth"
import { formatError } from "@/lib/utils"

function firstValidIsoDate(val: string | null | undefined): string | null {
  const t = typeof val === "string" ? val.trim() : ""
  if (t && /^\d{4}-\d{2}-\d{2}$/.test(t)) return t
  return null
}

export type UpdateErpEntityResult =
  | { success: true }
  | { success: false; error: string }

/**
 * עדכון ישות ERP — אימות בשרת עם ‎quickEntitySchema‎, כתיבה ל־‎public.entities‎.
 */
export async function updateErpEntity(
  id: string,
  payload: QuickEntityInput
): Promise<UpdateErpEntityResult> {
  try {
    const supabase = await createSupabaseServerAuthClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user?.id) {
      return { success: false, error: "נדרשת התחברות" }
    }

    const parsed = quickEntitySchema.safeParse(payload)
    if (!parsed.success) {
      const msg = parsed.error.issues.map((i) => i.message).join(" · ")
      return {
        success: false,
        error: msg || "הנתונים שנשלחו אינם תקינים.",
      }
    }

    const d = parsed.data
    const wDate = firstValidIsoDate(d.withholding_tax_expiry)
    const bDate = firstValidIsoDate(d.bookkeeping_cert_expiry)

    const contact: Record<string, string> = {}
    const em = d.email?.trim()
    const ph = d.phone?.trim()
    if (em) contact.email = em
    if (ph) contact.phone = ph

    const pctRaw = d.withholding_tax_pct ?? d.default_withholding_tax_percent
    const pct =
      pctRaw != null && Number.isFinite(Number(pctRaw))
        ? Number(pctRaw)
        : null

    const taxIdTrim = d.tax_id?.trim() || null
    const erpSup = d.erp_supplier_number?.trim() || null
    const erpCust = d.erp_customer_number?.trim() || null
    const ptc = d.payment_term_code?.trim() || null
    const gl = d.gl_account_code?.trim() || null

    const { error } = await supabase
      .from("entities")
      .update({
        name: d.name.trim(),
        type: d.type,
        contact_info: contact,
        legal_id: d.legal_id?.trim() || null,
        address: d.address?.trim() || null,
        tax_id: taxIdTrim,
        erp_supplier_number: erpSup,
        erp_customer_number: erpCust,
        payment_term_code: ptc,
        gl_account_code: gl,
        withholding_tax_expiry: wDate,
        bookkeeping_cert_expiry: bDate,
        default_withholding_tax_percent: pct ?? 0,
        withholding_tax_pct: pct,
      })
      .eq("id", id)
      .eq("is_deleted", false)

    if (error) {
      console.error("Failed to update entity:", error)
      return { success: false, error: "שגיאה בעדכון הנתונים במסד." }
    }

    void logMoAuditEvent({
      action_type: "UPDATE",
      table_name: "entities",
      project_id: null,
      new_data: { id, name: d.name.trim(), type: d.type },
    })

    revalidatePath(`/marker-ofek/entities/${id}`)
    revalidatePath("/marker-ofek/entities")
    revalidatePath("/marker-ofek/entities/suppliers")

    return { success: true }
  } catch (error) {
    console.error("Validation or Server Error:", error)
    return {
      success: false,
      error: formatError(error) || "הנתונים שנשלחו אינם תקינים.",
    }
  }
}
