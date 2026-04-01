"use server"

import { revalidatePath } from "next/cache"

import { createSupabaseServerClient } from "@/lib/supabase/server"

export type BillingActionState = {
  ok: boolean
  message: string
}

export async function createInvoice(
  _prev: BillingActionState,
  formData: FormData
): Promise<BillingActionState> {
  const tenantId = String(formData.get("tenant_id") ?? "").trim()
  const amountRaw = String(formData.get("amount") ?? "").trim()
  const description = String(formData.get("description") ?? "").trim()
  const dueRaw = String(formData.get("due_date") ?? "").trim()

  if (!tenantId) {
    return { ok: false, message: "נא לבחור דייר." }
  }
  if (!description) {
    return { ok: false, message: "נא למלא תיאור לחיוב." }
  }
  if (!dueRaw || !/^\d{4}-\d{2}-\d{2}$/.test(dueRaw)) {
    return { ok: false, message: "נא לבחור תאריך יעד לתשלום." }
  }

  const normalizedAmount = amountRaw.replace(/\s/g, "").replace(",", ".")
  const amount = Number(normalizedAmount)
  if (!Number.isFinite(amount) || amount < 0) {
    return { ok: false, message: "סכום לא חוקי." }
  }

  try {
    const supabase = createSupabaseServerClient()
    const { error } = await supabase.from("invoices").insert({
      tenant_id: tenantId,
      amount,
      description,
      due_date: dueRaw,
      status: "pending",
    })

    if (error) {
      return { ok: false, message: error.message }
    }

    revalidatePath("/billing")
    revalidatePath("/tenant/billing")
    return { ok: true, message: "החיוב נרשם בהצלחה." }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "שגיאה בשמירה"
    return { ok: false, message: msg }
  }
}

export async function markInvoicePaid(
  invoiceId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!invoiceId?.trim()) {
    return { ok: false, error: "מזהה חשבונית חסר" }
  }

  const supabase = createSupabaseServerClient()
  const now = new Date().toISOString()

  const { error } = await supabase
    .from("invoices")
    .update({
      status: "paid",
      paid_at: now,
    })
    .eq("id", invoiceId)
    .eq("status", "pending")

  if (error) {
    return { ok: false, error: error.message || "עדכון נכשל" }
  }

  revalidatePath("/billing")
  revalidatePath("/tenant/billing")
  return { ok: true }
}
