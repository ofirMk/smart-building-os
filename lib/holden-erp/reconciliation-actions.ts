"use server"

import { revalidatePath } from "next/cache"

import { createServerSupabaseClient } from "@/lib/supabase/server"
import { formatError } from "@/lib/utils"
import {
  fetchUnmatchedBankFeedLines,
  fetchUnmatchedBankLines,
  fetchUnmatchedJournalLines,
} from "@/lib/holden-erp/reconciliation-queries"
import type { UnmatchedBankLine, UnmatchedJournalLine } from "@/types/holden-finance"

export async function loadReconciliationArenaData(accountId: string): Promise<{
  success: boolean
  journal: UnmatchedJournalLine[]
  bank: UnmatchedBankLine[]
}> {
  const id = accountId.trim()
  if (!id) {
    return { success: false, journal: [], bank: [] }
  }

  const [journalRes, legacyBankRes, feedBankRes] = await Promise.all([
    fetchUnmatchedJournalLines(id),
    fetchUnmatchedBankLines(id),
    fetchUnmatchedBankFeedLines(id),
  ])

  const bankLegacy = legacyBankRes.success ? legacyBankRes.data : []
  const bankFeed = feedBankRes.success ? feedBankRes.data : []
  const bank = [...bankLegacy, ...bankFeed].sort((a, b) =>
    b.transaction_date.localeCompare(a.transaction_date)
  )

  return {
    success:
      journalRes.success && legacyBankRes.success && feedBankRes.success,
    journal: journalRes.success ? journalRes.data : [],
    bank,
  }
}

export type PerformMatchPayload = {
  bankAccountId: string
  journalLineIds: string[]
  /** Legacy: `bank_statement_lines.id` */
  bankLineIds?: string[]
  /** Flat feed: `bank_statement_entries.id` */
  bankEntryIds?: string[]
  type: "bank" | "credit_card" | "customer_supplier"
}

export async function performMatchAction(payload: PerformMatchPayload): Promise<
  | { success: true; reconciliationNumber: number }
  | { success: false; error: string }
> {
  const supabase = await createServerSupabaseClient()

  try {
    if (!payload.bankAccountId.trim()) {
      return { success: false, error: "חסר חשבון בנק" }
    }
    const bankSideCount =
      (payload.bankLineIds?.length ?? 0) + (payload.bankEntryIds?.length ?? 0)
    if (payload.journalLineIds.length === 0 || bankSideCount === 0) {
      return {
        success: false,
        error: "נדרשת לפחות שורת יומן ושורת בנק להתאמה",
      }
    }

    const {
      data: { user },
    } = await supabase.auth.getUser()

    const { data: recon, error: reconError } = await supabase
      .from("reconciliations")
      .insert({
        type: payload.type,
        status: "approved",
        created_by: user?.id ?? null,
      })
      .select("id, reconciliation_number")
      .single()

    if (reconError) throw reconError
    if (!recon) {
      return { success: false, error: "לא נוצרה רשומת התאמה" }
    }

    const reconLines = [
      ...payload.journalLineIds.map((id) => ({
        reconciliation_id: recon.id as string,
        journal_line_id: id,
        bank_line_id: null as string | null,
        bank_entry_id: null as string | null,
        matched_amount: 0,
      })),
      ...(payload.bankLineIds ?? []).map((id) => ({
        reconciliation_id: recon.id as string,
        bank_line_id: id,
        journal_line_id: null as string | null,
        bank_entry_id: null as string | null,
        matched_amount: 0,
      })),
      ...(payload.bankEntryIds ?? []).map((id) => ({
        reconciliation_id: recon.id as string,
        bank_entry_id: id,
        bank_line_id: null as string | null,
        journal_line_id: null as string | null,
        matched_amount: 0,
      })),
    ]

    const { error: linesError } = await supabase
      .from("reconciliation_lines")
      .insert(reconLines)

    if (linesError) {
      await supabase.from("reconciliations").delete().eq("id", recon.id)
      throw linesError
    }

    if ((payload.bankLineIds?.length ?? 0) > 0) {
      const { error: statusError } = await supabase
        .from("bank_statement_lines")
        .update({ match_status: "matched" })
        .in("id", payload.bankLineIds as string[])

      if (statusError) {
        await supabase.from("reconciliations").delete().eq("id", recon.id)
        throw statusError
      }
    }

    if ((payload.bankEntryIds?.length ?? 0) > 0) {
      const { error: entError } = await supabase
        .from("bank_statement_entries")
        .update({ is_reconciled: true })
        .in("id", payload.bankEntryIds as string[])

      if (entError) {
        await supabase.from("reconciliations").delete().eq("id", recon.id)
        throw entError
      }
    }

    revalidatePath("/marker-ofek/finance/reconciliations")
    return {
      success: true,
      reconciliationNumber: recon.reconciliation_number as number,
    }
  } catch (error: unknown) {
    console.error("Match Action Error:", error)
    return {
      success: false,
      error: formatError(error) || "Failed to perform match",
    }
  }
}
