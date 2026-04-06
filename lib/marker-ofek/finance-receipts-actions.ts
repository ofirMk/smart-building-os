"use server"

import { revalidatePath } from "next/cache"

import { createReceiptInputSchema } from "@/lib/marker-ofek/finance-schemas"
import { createJournalEntry } from "@/lib/marker-ofek/journal-entry-engine"
import { createSupabaseServerAuthClient } from "@/lib/supabase/server-auth"
import { formatError } from "@/lib/utils"

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100
}

export type OpenInvoiceOption = {
  id: string
  invoice_number: number | null
  issue_date: string | null
  grand_total: number
  open_amount: number
}

/** חשבוניות פתוחות לשיוך קבלה */
export async function fetchOpenInvoicesForReceipt(
  entityId: string
): Promise<OpenInvoiceOption[]> {
  const id = String(entityId ?? "").trim()
  if (!id) return []

  const supabase = await createSupabaseServerAuthClient()
  const { data: invs, error: iErr } = await supabase
    .from("mo_invoices")
    .select("id, invoice_number, issue_date, grand_total")
    .eq("entity_id", id)
    .eq("is_finalized", true)
    .order("issue_date", { ascending: false })
    .limit(200)
  if (iErr) throw new Error(iErr.message)

  const ids = ((invs ?? []) as { id: string }[]).map((r) => r.id)
  let allocBy = new Map<string, number>()
  if (ids.length > 0) {
    const { data: allocRows, error: aErr } = await supabase
      .from("mo_receipt_allocations")
      .select("invoice_id, amount")
      .in("invoice_id", ids)
    if (aErr) throw new Error(aErr.message)
    for (const row of allocRows ?? []) {
      const invId = String((row as { invoice_id: string }).invoice_id)
      const amt = Number((row as { amount: number }).amount) || 0
      allocBy.set(invId, (allocBy.get(invId) ?? 0) + amt)
    }
  }

  return (invs ?? []).map((raw) => {
    const r = raw as {
      id: string
      invoice_number: number | null
      issue_date: string | null
      grand_total: number | null
    }
    const gt = Number(r.grand_total ?? 0) || 0
    const alloc = allocBy.get(r.id) ?? 0
    return {
      id: r.id,
      invoice_number: r.invoice_number,
      issue_date: r.issue_date,
      grand_total: gt,
      open_amount: Math.max(0, roundMoney(gt - alloc)),
    }
  })
}

export async function createMoReceiptAction(
  raw: unknown
): Promise<{ ok: true; receiptId: string } | { ok: false; error: string }> {
  const parsed = createReceiptInputSchema.safeParse(raw)
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => i.message).join(" · ")
    return { ok: false, error: msg || "נתונים לא תקינים" }
  }
  const p = parsed.data
  const allocSum = roundMoney(
    p.allocations.reduce((s, a) => s + a.amount, 0)
  )
  if (allocSum > roundMoney(p.amount) + 0.01) {
    return { ok: false, error: "סכום ההקצאות לחשבוניות עולה על סכום הקבלה" }
  }

  try {
    const supabase = await createSupabaseServerAuthClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user?.id) return { ok: false, error: "נדרשת התחברות" }

    const { data: ent, error: entErr } = await supabase
      .from("entities")
      .select("id, type, is_deleted")
      .eq("id", p.entityId)
      .maybeSingle()
    if (entErr) return { ok: false, error: entErr.message }
    if (!ent || (ent as { is_deleted?: boolean }).is_deleted) {
      return { ok: false, error: "ישות לא נמצאה" }
    }
    if (String((ent as { type?: string }).type) !== "client") {
      return { ok: false, error: "קבלה מקושרת ללקוח (מזמין) בלבד" }
    }

    const projectId =
      p.projectId && String(p.projectId).trim() ? String(p.projectId).trim() : null

    const refLabel = (p.reference?.trim() || "—").slice(0, 80)
    const je = await createJournalEntry({
      entryDate: p.receiptDate,
      reference: `RCPT-${refLabel}`,
      description: "קבלת תשלום — בנק / מזומן מול חוב לקוחות",
      projectId,
      sourceType: "mo_receipt",
      lines: [
        {
          accountCode: "1000",
          debit: p.amount,
          credit: 0,
          memo: `תשלום ${p.paymentMethod}`,
        },
        {
          accountCode: "1200",
          debit: 0,
          credit: p.amount,
          memo: "הקטנת חוב לקוח",
        },
      ],
    })

    if (!je.ok) return { ok: false, error: je.error }

    const { data: rec, error: rErr } = await supabase
      .from("mo_receipts")
      .insert({
        receipt_date: p.receiptDate,
        payment_method: p.paymentMethod,
        reference: p.reference?.trim() || null,
        amount: p.amount,
        entity_id: p.entityId,
        project_id: projectId,
        journal_entry_id: je.journalEntryId,
        notes: p.notes?.trim() || null,
        created_by: user.id,
      })
      .select("id")
      .single()

    if (rErr || !rec?.id) {
      return { ok: false, error: rErr?.message ?? "שמירת קבלה נכשלה" }
    }

    const receiptId = rec.id as string

    if (p.allocations.length > 0) {
      const { error: alErr } = await supabase.from("mo_receipt_allocations").insert(
        p.allocations.map((a) => ({
          receipt_id: receiptId,
          invoice_id: a.invoiceId,
          amount: roundMoney(a.amount),
        }))
      )
      if (alErr) {
        return { ok: false, error: alErr.message }
      }
    }

    revalidatePath("/marker-ofek/finance/receipts/new")
    revalidatePath("/marker-ofek/finance/customers")
    revalidatePath("/marker-ofek/finance/reports/aging")
    revalidatePath("/marker-ofek/finance")
    return { ok: true, receiptId }
  } catch (e) {
    return { ok: false, error: formatError(e) }
  }
}
