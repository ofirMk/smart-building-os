"use server"

import { revalidatePath } from "next/cache"

import { createServerSupabaseClient } from "@/lib/supabase/server"
import { formatError } from "@/lib/utils"
import type { GlAccountRow, JournalEntryPayload } from "@/types/holden-finance"

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function resolveGlAccountId(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  raw: string
): Promise<string | null> {
  const s = raw.trim()
  if (!s) return null
  if (UUID_RE.test(s)) return s
  const { data } = await supabase
    .from("gl_accounts")
    .select("id")
    .eq("account_code", s)
    .maybeSingle()
  return (data as { id?: string } | null)?.id ?? null
}

export async function fetchAllGlAccounts(): Promise<{
  success: boolean
  data?: GlAccountRow[]
  error?: string
}> {
  try {
    const supabase = await createServerSupabaseClient()
    const { data, error } = await supabase
      .from("gl_accounts")
      .select("*")
      .order("account_code", { ascending: true })

    if (error) throw error
    return { success: true, data: (data ?? []) as GlAccountRow[] }
  } catch (err) {
    console.error("fetchAllGlAccounts:", err)
    return {
      success: false,
      error: formatError(err) || "Failed to fetch accounts",
    }
  }
}

export async function createJournalEntryAction(
  payload: JournalEntryPayload
): Promise<
  | { success: true; entryId: string; entryNumber: string }
  | { success: false; error: string }
> {
  const supabase = await createServerSupabaseClient()

  try {
    const {
      data: { user },
    } = await supabase.auth.getUser()

    const idem = payload.idempotencyKey?.trim()
    if (idem) {
      const { data: existing } = await supabase
        .from("journal_entries")
        .select("id, entry_number")
        .eq("idempotency_key", idem)
        .maybeSingle()
      if (existing) {
        return {
          success: true,
          entryId: String((existing as { id: string }).id),
          entryNumber: String((existing as { entry_number: string }).entry_number ?? ""),
        }
      }
    }

    const resolvedLines: {
      account_id: string
      debit: number
      credit: number
      reference_1: string | null
      reference_2: string | null
      line_description: string | null
    }[] = []

    for (const line of payload.lines) {
      const debit = Number(line.debit) || 0
      const credit = Number(line.credit) || 0
      if (debit === 0 && credit === 0) continue

      const accountId = await resolveGlAccountId(supabase, line.accountId)
      if (!accountId) {
        return {
          success: false,
          error: "חשבון לא נמצא לשורה אחת או יותר — בדקו קוד חשבון",
        }
      }

      resolvedLines.push({
        account_id: accountId,
        debit,
        credit,
        reference_1: line.reference1 || null,
        reference_2: line.reference2 || null,
        line_description: line.details || null,
      })
    }

    if (resolvedLines.length === 0) {
      return { success: false, error: "נדרשת לפחות שורת חובה/זכות אחת" }
    }

    const totalDebit = resolvedLines.reduce((s, r) => s + r.debit, 0)
    const totalCredit = resolvedLines.reduce((s, r) => s + r.credit, 0)
    const delta = Math.abs(totalDebit - totalCredit)
    if (payload.status === "posted" && delta > 0.005) {
      return {
        success: false,
        error: `פקודה לא מאוזנת — חובה ${totalDebit.toFixed(2)} ₪, זכות ${totalCredit.toFixed(2)} ₪ (הפרש ${delta.toFixed(2)} ₪)`,
      }
    }

    const prefix = payload.status === "draft" ? "T" : "J"
    const timestamp = Date.now().toString().slice(-6)
    const randomStr = Math.random().toString(36).substring(2, 5).toUpperCase()
    const entryNumber = `${prefix}-${timestamp}-${randomStr}`

    const { data: headerData, error: headerError } = await supabase
      .from("journal_entries")
      .insert({
        entry_number: entryNumber,
        status: payload.status,
        entry_date: payload.entryDate,
        description: payload.description || null,
        reference_number: payload.referenceNumber?.trim() || null,
        created_by: user?.id ?? null,
        idempotency_key: idem || null,
      })
      .select("id")
      .single()

    if (headerError) throw headerError
    const entryId = headerData.id as string

    const linesToInsert = resolvedLines.map((row) => ({
      entry_id: entryId,
      account_id: row.account_id,
      debit: row.debit,
      credit: row.credit,
      reference_1: row.reference_1,
      reference_2: row.reference_2,
      line_description: row.line_description,
    }))

    const { error: linesError } = await supabase
      .from("journal_lines")
      .insert(linesToInsert)

    if (linesError) {
      await supabase.from("journal_entries").delete().eq("id", entryId)
      throw linesError
    }

    if (payload.status === "posted") {
      const { data: isBalanced, error: checkError } = await supabase.rpc(
        "check_entry_balance",
        { p_entry_id: entryId }
      )

      if (checkError || !isBalanced) {
        await supabase
          .from("journal_entries")
          .update({ status: "draft" })
          .eq("id", entryId)
        if (checkError) throw checkError
        throw new Error("הפקודה אינה מאוזנת. נשמרה כטיוטה בלבד.")
      }
    }

    revalidatePath("/marker-ofek/finance/journal-entries")
    revalidatePath("/marker-ofek/finance/reconciliations")
    return { success: true, entryId, entryNumber }
  } catch (error: unknown) {
    console.error("Journal Entry Error:", error)
    return {
      success: false,
      error: formatError(error) || "Failed to save entry",
    }
  }
}
