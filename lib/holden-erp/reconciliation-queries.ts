import "server-only"

import { createServerSupabaseClient } from "@/lib/supabase/server"
import type {
  UnmatchedBankLine,
  UnmatchedJournalLine,
} from "@/types/holden-finance"

type JournalLineWithEntry = {
  id: string
  debit: string | number | null
  credit: string | number | null
  reference_1: string | null
  line_description: string | null
  journal_entries: {
    id: string
    entry_number: string | null
    entry_date: string
    status: string
    description: string | null
  } | null
}

export async function fetchUnmatchedJournalLines(accountId: string): Promise<{
  success: boolean
  data: UnmatchedJournalLine[]
}> {
  const supabase = await createServerSupabaseClient()

  const { data, error } = await supabase
    .from("journal_lines")
    .select(
      `
      id,
      debit,
      credit,
      reference_1,
      line_description,
      journal_entries (
        id,
        entry_number,
        entry_date,
        status,
        description
      )
    `
    )
    .eq("account_id", accountId)

  if (error) {
    console.error("Error fetching unmatched journal lines:", error)
    return { success: false, data: [] }
  }

  const raw = (data ?? []) as unknown as JournalLineWithEntry[]

  const posted = raw.filter(
    (row) => row.journal_entries?.status === "posted"
  )

  posted.sort((a, b) => {
    const da = a.journal_entries?.entry_date ?? ""
    const db = b.journal_entries?.entry_date ?? ""
    return db.localeCompare(da)
  })

  const formattedData: UnmatchedJournalLine[] = []
  for (const row of posted) {
    const je = row.journal_entries
    if (!je) continue
    const debit = Number(row.debit) || 0
    const credit = Number(row.credit) || 0
    formattedData.push({
      id: row.id,
      entry_id: je.id,
      entry_date: je.entry_date,
      entry_number: je.entry_number ?? "",
      description:
        row.line_description?.trim() ||
        je.description?.trim() ||
        "",
      reference_1: row.reference_1 ?? "",
      debit,
      credit,
      amount: debit - credit,
    })
  }

  return { success: true, data: formattedData }
}

export async function fetchUnmatchedBankLines(bankAccountId: string): Promise<{
  success: boolean
  data: UnmatchedBankLine[]
}> {
  const supabase = await createServerSupabaseClient()

  const { data: statements, error: stmtError } = await supabase
    .from("bank_statements")
    .select("id")
    .eq("bank_account_id", bankAccountId)

  if (stmtError) {
    console.error("Error fetching bank statements:", stmtError)
    return { success: false, data: [] }
  }

  const statementIds = (statements ?? []).map((s) => s.id as string)
  if (statementIds.length === 0) {
    return { success: true, data: [] }
  }

  const { data, error } = await supabase
    .from("bank_statement_lines")
    .select(
      `
      id,
      transaction_date,
      reference_number,
      description,
      debit,
      credit,
      match_status,
      statement_id
    `
    )
    .in("statement_id", statementIds)
    .in("match_status", ["unmatched", "partial"])
    .order("transaction_date", { ascending: false })

  if (error) {
    console.error("Error fetching unmatched bank lines:", error)
    return { success: false, data: [] }
  }

  type BankRow = {
    id: string
    transaction_date: string
    reference_number: string | null
    description: string | null
    debit: string | number | null
    credit: string | number | null
    match_status: string
    statement_id: string
  }

  const rows = (data ?? []) as unknown as BankRow[]

  const formattedData: UnmatchedBankLine[] = rows.map((row) => {
    const debit = Number(row.debit) || 0
    const credit = Number(row.credit) || 0
    return {
      id: row.id,
      statement_id: row.statement_id,
      transaction_date: row.transaction_date,
      reference_number: row.reference_number ?? "",
      description: row.description ?? "",
      debit,
      credit,
      amount: credit - debit,
      source: "legacy",
    }
  })

  return { success: true, data: formattedData }
}

export async function fetchUnmatchedBankFeedLines(bankAccountId: string): Promise<{
  success: boolean
  data: UnmatchedBankLine[]
}> {
  const supabase = await createServerSupabaseClient()

  const { data, error } = await supabase
    .from("bank_statement_entries")
    .select(
      "id, transaction_date, reference, description, debit, credit, is_reconciled"
    )
    .eq("bank_gl_account_id", bankAccountId)
    .eq("is_reconciled", false)
    .order("transaction_date", { ascending: false })

  if (error) {
    console.error("fetchUnmatchedBankFeedLines:", error)
    return { success: false, data: [] }
  }

  type FeedRow = {
    id: string
    transaction_date: string
    reference: string | null
    description: string | null
    debit: string | number | null
    credit: string | number | null
  }

  const rows = (data ?? []) as unknown as FeedRow[]

  const formattedData: UnmatchedBankLine[] = rows.map((row) => {
    const debit = Number(row.debit) || 0
    const credit = Number(row.credit) || 0
    return {
      id: row.id,
      statement_id: "",
      transaction_date: row.transaction_date,
      reference_number: row.reference ?? "",
      description: row.description ?? "",
      debit,
      credit,
      amount: credit - debit,
      source: "feed",
    }
  })

  return { success: true, data: formattedData }
}
