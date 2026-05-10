/**
 * GL Auto-Posting Engine — Sprint A.1.
 *
 * Translates approved domain events (subcontractor partial bills, AP invoices,
 * payments) into balanced GL journal entries, idempotently. The first user is
 * `postSubcontractorBillToGL(billId)` — invoked from the partial-bill approval
 * server action when status flips DRAFT → APPROVED.
 *
 * Design rules:
 *   • Idempotent: keys on (source_type, source_ref); a duplicate call is a no-op.
 *   • Balanced: composes Dr/Cr lines that always sum to zero before persisting.
 *   • Period-aware: relies on `erp_gl_assert_period_open` trigger to block
 *     posting into CLOSED/LOCKED periods (raises a clear DB exception).
 *   • Account resolution: looks up account numbers via `getRequiredGlAccount`
 *     so company-specific Chart of Accounts variants can be supported by
 *     overriding the constants below in a future per-company config table.
 */
import type { SupabaseClient } from "@supabase/supabase-js"

/**
 * Standard Chart of Accounts numbers used by the auto-posting engine.
 * If a customer brings their own COA via the importer, these numbers must
 * exist (or a future `erp_gl_account_mappings` table will translate them).
 */
export const STD_GL_ACCOUNTS = {
  /** Dr — עלויות עבודות קבלני משנה (P&L). */
  SUBCONTRACTOR_COST: "5210",
  /** Cr — קבלני משנה לתשלום (AP). */
  SUBCONTRACTOR_AP: "2210",
  /** Cr — עכבון לקבלני משנה (Liability). */
  RETENTION_PAYABLE: "2220",
  /** Cr — קיזוזי ביטוח (Liability). */
  INSURANCE_DEDUCTION: "2230",
  /** Dr — מע"מ תשומות (Asset). */
  VAT_INPUT: "1450",
} as const

export type GlPostingResult =
  | { ok: true; journalEntryId: string; created: boolean }
  | { ok: false; error: string }

type AccountIdMap = Record<keyof typeof STD_GL_ACCOUNTS, string>

async function resolveAccountIds(
  client: SupabaseClient,
  companyId: string,
): Promise<{ ok: true; map: AccountIdMap } | { ok: false; error: string }> {
  const numbers = Object.values(STD_GL_ACCOUNTS)
  const { data, error } = await client
    .from("erp_gl_accounts")
    .select("id, account_number")
    .eq("company_id", companyId)
    .in("account_number", numbers)

  if (error) {
    return { ok: false, error: `Failed to resolve GL accounts: ${error.message}` }
  }

  const byNumber = new Map<string, string>()
  for (const row of (data ?? []) as { id: string; account_number: string }[]) {
    byNumber.set(row.account_number, row.id)
  }

  const missing: string[] = []
  const map: Partial<AccountIdMap> = {}
  for (const [key, num] of Object.entries(STD_GL_ACCOUNTS) as [
    keyof typeof STD_GL_ACCOUNTS,
    string,
  ][]) {
    const id = byNumber.get(num)
    if (!id) {
      missing.push(`${num} (${key})`)
    } else {
      map[key] = id
    }
  }

  if (missing.length > 0) {
    return {
      ok: false,
      error: `Missing required GL accounts: ${missing.join(", ")}. Run the chart-of-accounts importer first.`,
    }
  }
  return { ok: true, map: map as AccountIdMap }
}

type BillRow = {
  id: string
  company_id: string
  contract_id: string
  bill_number: number
  bill_date: string
  amount_to_pay: number
  retention_deduction_amount: number
  insurance_deduction_amount: number
  vat_amount: number
  status: string
}

/**
 * Auto-post a subcontractor partial bill to the GL.
 * Only operates when the bill is APPROVED (or PAID). Idempotent on
 * (source_type='bill', source_ref=bill.id).
 */
export async function postSubcontractorBillToGL(
  client: SupabaseClient,
  billId: string,
): Promise<GlPostingResult> {
  const { data: bill, error: billErr } = await client
    .from("erp_subcontractor_bills")
    .select(
      "id, company_id, contract_id, bill_number, bill_date, amount_to_pay, retention_deduction_amount, insurance_deduction_amount, vat_amount, status",
    )
    .eq("id", billId)
    .maybeSingle<BillRow>()

  if (billErr) return { ok: false, error: `Failed to load bill: ${billErr.message}` }
  if (!bill) return { ok: false, error: `Bill ${billId} not found` }
  if (bill.status !== "APPROVED" && bill.status !== "PAID") {
    return {
      ok: false,
      error: `Bill ${billId} is in status ${bill.status}; expected APPROVED or PAID before posting.`,
    }
  }

  // Idempotency check.
  const existing = await client
    .from("erp_gl_journal_entries")
    .select("id")
    .eq("company_id", bill.company_id)
    .eq("source_type", "bill")
    .eq("source_ref", bill.id)
    .maybeSingle<{ id: string }>()
  if (existing.data?.id) {
    return { ok: true, journalEntryId: existing.data.id, created: false }
  }

  const accounts = await resolveAccountIds(client, bill.company_id)
  if (!accounts.ok) return { ok: false, error: accounts.error }

  // Build balanced lines.
  const grossNet =
    Number(bill.amount_to_pay) +
    Number(bill.retention_deduction_amount) +
    Number(bill.insurance_deduction_amount)
  const vat = Number(bill.vat_amount)

  type Line = { account_id: string; debit: number; credit: number; description: string }
  const lines: Line[] = []

  if (grossNet > 0) {
    lines.push({
      account_id: accounts.map.SUBCONTRACTOR_COST,
      debit: grossNet,
      credit: 0,
      description: `עלות עבודות — חשבון #${bill.bill_number}`,
    })
  }
  if (vat > 0) {
    lines.push({
      account_id: accounts.map.VAT_INPUT,
      debit: vat,
      credit: 0,
      description: `מע"מ תשומות — חשבון #${bill.bill_number}`,
    })
  }
  if (Number(bill.retention_deduction_amount) > 0) {
    lines.push({
      account_id: accounts.map.RETENTION_PAYABLE,
      debit: 0,
      credit: Number(bill.retention_deduction_amount),
      description: `עכבון — חשבון #${bill.bill_number}`,
    })
  }
  if (Number(bill.insurance_deduction_amount) > 0) {
    lines.push({
      account_id: accounts.map.INSURANCE_DEDUCTION,
      debit: 0,
      credit: Number(bill.insurance_deduction_amount),
      description: `קיזוז ביטוח — חשבון #${bill.bill_number}`,
    })
  }
  // AP credit absorbs (amount_to_pay + vat).
  const apCredit = Number(bill.amount_to_pay) + vat
  if (apCredit > 0) {
    lines.push({
      account_id: accounts.map.SUBCONTRACTOR_AP,
      debit: 0,
      credit: apCredit,
      description: `יתרה לתשלום — חשבון #${bill.bill_number}`,
    })
  }

  if (lines.length === 0) {
    return { ok: false, error: "Bill has no monetary impact — nothing to post." }
  }

  const totalDebit = lines.reduce((s, l) => s + l.debit, 0)
  const totalCredit = lines.reduce((s, l) => s + l.credit, 0)
  if (Math.round((totalDebit - totalCredit) * 100) / 100 !== 0) {
    return {
      ok: false,
      error: `Imbalanced JE refused: D=${totalDebit}, C=${totalCredit}`,
    }
  }

  // Create header in DRAFT, insert lines, flip to POSTED.
  const entryNumber = `BILL-${bill.bill_number.toString().padStart(6, "0")}-${bill.id.slice(0, 8)}`
  const { data: header, error: hErr } = await client
    .from("erp_gl_journal_entries")
    .insert({
      company_id: bill.company_id,
      entry_number: entryNumber,
      entry_date: bill.bill_date,
      description: `חשבון חלקי קבלן משנה #${bill.bill_number}`,
      source_type: "bill",
      source_ref: bill.id,
      status: "DRAFT",
    })
    .select("id")
    .single<{ id: string }>()
  if (hErr || !header) {
    return { ok: false, error: `Failed to create JE header: ${hErr?.message}` }
  }

  const lineRows = lines.map((l, i) => ({
    company_id: bill.company_id,
    journal_entry_id: header.id,
    line_no: i + 1,
    account_id: l.account_id,
    debit_amount: l.debit,
    credit_amount: l.credit,
    description: l.description,
  }))
  const { error: lErr } = await client.from("erp_gl_journal_lines").insert(lineRows)
  if (lErr) {
    return { ok: false, error: `Failed to insert JE lines: ${lErr.message}` }
  }

  const { error: postErr } = await client
    .from("erp_gl_journal_entries")
    .update({ status: "POSTED", posted_at: new Date().toISOString() })
    .eq("id", header.id)
  if (postErr) {
    return {
      ok: false,
      error: `Failed to post JE (period closed or unbalanced): ${postErr.message}`,
    }
  }

  return { ok: true, journalEntryId: header.id, created: true }
}
