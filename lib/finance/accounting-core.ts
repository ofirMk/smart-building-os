import "server-only"

import { createJournalEntry } from "@/lib/marker-ofek/journal-entry-engine"
import type { SupabaseClient } from "@supabase/supabase-js"

export type FinanceInvoiceTotals = {
  subtotal: number
  vat: number
  total: number
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/**
 * טיוטת פקודת יומן (כפל קלט) לחשבונית מס מאושרת — מקביל לטריגר mo_invoices.
 */
export function buildFinanceInvoiceJournalDraft(input: {
  invoiceNumber: number
  issueDate: string
  totals: FinanceInvoiceTotals
}): {
  entryDate: string
  reference: string
  description: string
  lines: { accountCode: string; debit: number; credit: number; memo: string }[]
} | null {
  const sub = round2(input.totals.subtotal)
  const vat = round2(input.totals.vat)
  const tot = round2(input.totals.total)
  if (tot <= 0) return null
  if (round2(sub + vat) !== tot) {
    return null
  }

  return {
    entryDate: input.issueDate,
    reference: `FIN-INV-${input.invoiceNumber}`,
    description: "חשבונית מס — מודול כספים (אוטו-יומן)",
    lines: [
      { accountCode: "1200", debit: tot, credit: 0, memo: "חוב לקוח" },
      { accountCode: "4000", debit: 0, credit: sub, memo: "הכנסה" },
      { accountCode: "2200", debit: 0, credit: vat, memo: "מע״מ לתשלום" },
    ],
  }
}

/**
 * רישום פקודת יומן + קישור ל־finance_invoices.journal_entry_id (אידמפוטנטי).
 */
export async function ensureFinanceInvoiceJournalEntry(params: {
  supabase: SupabaseClient
  invoiceId: string
  invoiceNumber: number
  projectId: string | null
  issueDate: string
  totals: FinanceInvoiceTotals
  invoiceType: "TAX_INVOICE" | "TRANSACTION" | "CREDIT"
}): Promise<{ ok: true; journalEntryId: string | null } | { ok: false; error: string }> {
  if (params.invoiceType !== "TAX_INVOICE") {
    return { ok: true, journalEntryId: null }
  }

  const { data: row, error: selErr } = await params.supabase
    .from("finance_invoices")
    .select("journal_entry_id")
    .eq("id", params.invoiceId)
    .maybeSingle()

  if (selErr) {
    return { ok: false, error: selErr.message }
  }

  const existing = (row as { journal_entry_id?: string | null } | null)?.journal_entry_id
  if (existing) {
    return { ok: true, journalEntryId: existing }
  }

  const draft = buildFinanceInvoiceJournalDraft({
    invoiceNumber: params.invoiceNumber,
    issueDate: params.issueDate,
    totals: params.totals,
  })
  if (!draft) {
    return { ok: true, journalEntryId: null }
  }

  const je = await createJournalEntry({
    entryDate: draft.entryDate,
    reference: draft.reference,
    description: draft.description,
    projectId: params.projectId,
    sourceType: "finance_invoice",
    sourceId: params.invoiceId,
    lines: draft.lines,
  })

  if (!je.ok) {
    return { ok: false, error: je.error }
  }

  const { error: upErr } = await params.supabase
    .from("finance_invoices")
    .update({ journal_entry_id: je.journalEntryId })
    .eq("id", params.invoiceId)

  if (upErr) {
    return { ok: false, error: upErr.message }
  }

  return { ok: true, journalEntryId: je.journalEntryId }
}
