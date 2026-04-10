"use server"

import { revalidatePath } from "next/cache"

import { createServerSupabaseClient } from "@/lib/supabase/server"
import { formatError } from "@/lib/utils"

export type BankImportRow = {
  transactionDate: string
  description: string
  reference?: string
  debit: number
  credit: number
}

export async function importBankStatementAction(payload: {
  bankGlAccountId: string
  transactions: BankImportRow[]
}): Promise<
  { success: true; inserted: number } | { success: false; error: string }
> {
  const bankId = payload.bankGlAccountId?.trim() ?? ""
  if (!bankId) {
    return { success: false, error: "נא לבחור חשבון בנק בכרטסת" }
  }
  const rows = payload.transactions ?? []
  if (!Array.isArray(rows) || rows.length === 0) {
    return { success: false, error: "אין שורות לייבוא" }
  }

  const supabase = await createServerSupabaseClient()

  const normalized = rows
    .map((r) => {
      const debit = Math.max(0, Number(r.debit) || 0)
      const credit = Math.max(0, Number(r.credit) || 0)
      if (debit > 0 && credit > 0) return null
      const d = (r.description ?? "").trim()
      const ref = (r.reference ?? "").trim()
      const td = (r.transactionDate ?? "").trim().slice(0, 10)
      if (!td) return null
      return {
        bank_gl_account_id: bankId,
        transaction_date: td,
        description: d || "—",
        reference: ref || null,
        debit,
        credit,
        is_reconciled: false,
      }
    })
    .filter((x): x is NonNullable<typeof x> => x != null)

  if (normalized.length === 0) {
    return { success: false, error: "לא נשארו שורות תקינות אחרי נירמול" }
  }

  const { error } = await supabase.from("bank_statement_entries").insert(normalized)

  if (error) {
    return {
      success: false,
      error: formatError(error) || "ייבוא נכשל",
    }
  }

  revalidatePath("/marker-ofek/finance/reconciliations")
  revalidatePath("/marker-ofek/finance/bank-statements/new")
  return { success: true, inserted: normalized.length }
}

export async function createBankStatementAction(payload: {
  bankAccountId: string
  statementDate: string
  startingBalance: number
  endingBalance: number
  lines: {
    date: string
    reference: string
    description: string
    debit: number
    credit: number
  }[]
}): Promise<
  | { success: true; statementNumber: string }
  | { success: false; error: string }
> {
  const supabase = await createServerSupabaseClient()

  try {
    const {
      data: { user },
    } = await supabase.auth.getUser()

    const statementNumber = `BS-${Date.now().toString(36).toUpperCase().slice(-10)}`

    const { data: header, error: headerError } = await supabase
      .from("bank_statements")
      .insert({
        bank_account_id: payload.bankAccountId,
        statement_date: payload.statementDate,
        statement_number: statementNumber,
        starting_balance: payload.startingBalance,
        ending_balance: payload.endingBalance,
        status: "open",
        created_by: user?.id ?? null,
      })
      .select("id")
      .single()

    if (headerError || !header) {
      return {
        success: false,
        error: formatError(headerError) || "שמירת כותרת דף בנק נכשלה",
      }
    }

    const statementId = (header as { id: string }).id

    const legacyLines = payload.lines.map((l) => ({
      statement_id: statementId,
      transaction_date: l.date.slice(0, 10),
      reference_number: l.reference?.trim() || null,
      description: l.description?.trim() || null,
      debit: Math.max(0, Number(l.debit) || 0),
      credit: Math.max(0, Number(l.credit) || 0),
      match_status: "unmatched" as const,
    }))

    const { error: linesError } = await supabase
      .from("bank_statement_lines")
      .insert(legacyLines)

    if (linesError) {
      await supabase.from("bank_statements").delete().eq("id", statementId)
      return {
        success: false,
        error: formatError(linesError) || "שמירת שורות דף בנק נכשלה",
      }
    }

    const feedMirror = payload.lines
      .filter((l) => (Number(l.debit) || 0) > 0 || (Number(l.credit) || 0) > 0)
      .map((l) => ({
        bank_gl_account_id: payload.bankAccountId,
        transaction_date: l.date.slice(0, 10),
        description: (l.description ?? "").trim() || "—",
        reference: (l.reference ?? "").trim() || null,
        debit: Math.max(0, Number(l.debit) || 0),
        credit: Math.max(0, Number(l.credit) || 0),
        is_reconciled: false,
      }))

    if (feedMirror.length > 0) {
      const { error: feedErr } = await supabase
        .from("bank_statement_entries")
        .insert(feedMirror)
      if (feedErr) {
        console.error("bank_statement_entries mirror:", feedErr)
      }
    }

    revalidatePath("/marker-ofek/finance/reconciliations")
    revalidatePath("/marker-ofek/finance/bank-statements/new")
    return { success: true, statementNumber }
  } catch (e) {
    return {
      success: false,
      error: formatError(e) || "שמירה נכשלה",
    }
  }
}
