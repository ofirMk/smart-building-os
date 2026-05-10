/**
 * Bank Reconciliation — Deterministic Matching Engine (Sprint A.1).
 *
 * Goal: for each unmatched `erp_bank_statement_lines` row, find the most likely
 * `erp_gl_journal_entries` (or future `ap_payments`) candidate using rules
 * only — no AI in MVP. AI suggestions deferred to Phase 2 per PRD §A.1.3.
 *
 * Matching rules (composable; final confidence is the product of factors):
 *   1) Amount — exact match (±0.01 ILS) → 1.0; else fail.
 *   2) Date   — within ±3 calendar days → 1.0; ±7 days → 0.5; else fail.
 *   3) Reference — same digits-only reference → +0.2 boost.
 *
 * Confidence threshold for "auto-match" is 0.95 (UI calls `proposeMatches` and
 * lets the operator confirm; "auto-match all > 0.95" is a single-click UI).
 *
 * The engine is pure: it reads from Supabase, computes candidates in JS,
 * returns proposals. Persistence (writing matched_journal_entry_id +
 * match_confidence) is a separate API route.
 */
import type { SupabaseClient } from "@supabase/supabase-js"

const DATE_WINDOW_DAYS_TIGHT = 3
const DATE_WINDOW_DAYS_LOOSE = 7
const AMOUNT_TOLERANCE_ILS = 0.01
const AUTO_MATCH_THRESHOLD = 0.95

export type BankLine = {
  id: string
  company_id: string
  statement_id: string
  line_date: string
  reference: string | null
  description: string | null
  amount: number
  side: "DEBIT" | "CREDIT"
  matched_journal_entry_id: string | null
}

export type CandidateJE = {
  id: string
  entry_number: string
  entry_date: string
  description: string
  total_amount: number
  source_type: string
}

export type MatchProposal = {
  bank_line_id: string
  candidate_je_id: string
  confidence: number
  factors: {
    amount_match: boolean
    date_window_days: number
    reference_match: boolean
  }
}

function daysBetween(a: string, b: string): number {
  const ms = Math.abs(new Date(a).getTime() - new Date(b).getTime())
  return Math.round(ms / (1000 * 60 * 60 * 24))
}

function digitsOnly(s: string | null): string {
  if (!s) return ""
  return s.replace(/\D+/g, "")
}

function dateConfidence(diffDays: number): number {
  if (diffDays <= DATE_WINDOW_DAYS_TIGHT) return 1.0
  if (diffDays <= DATE_WINDOW_DAYS_LOOSE) return 0.5
  return 0
}

/**
 * For one bank line, return the best candidate JEs (sorted by confidence DESC).
 * Caller decides whether to auto-confirm (`confidence >= AUTO_MATCH_THRESHOLD`).
 */
export async function proposeMatches(
  client: SupabaseClient,
  companyId: string,
  bankLineId: string,
  options: { limit?: number } = {},
): Promise<MatchProposal[]> {
  const { data: line, error: lineErr } = await client
    .from("erp_bank_statement_lines")
    .select(
      "id, company_id, statement_id, line_date, reference, description, amount, side, matched_journal_entry_id",
    )
    .eq("id", bankLineId)
    .eq("company_id", companyId)
    .maybeSingle<BankLine>()

  if (lineErr || !line) return []
  if (line.matched_journal_entry_id) return []

  // Window for candidate JEs: ±7 days around line_date.
  const start = new Date(line.line_date)
  start.setDate(start.getDate() - DATE_WINDOW_DAYS_LOOSE)
  const end = new Date(line.line_date)
  end.setDate(end.getDate() + DATE_WINDOW_DAYS_LOOSE)

  // Sum the JE total for matching against bank amount: we use abs(net) per entry.
  // For the MVP, fetch posted JEs in the window with the company id.
  const { data: jeRows, error: jeErr } = await client
    .from("erp_gl_journal_entries")
    .select("id, entry_number, entry_date, description, source_type")
    .eq("company_id", companyId)
    .eq("status", "POSTED")
    .gte("entry_date", start.toISOString().slice(0, 10))
    .lte("entry_date", end.toISOString().slice(0, 10))
    .limit(200)

  if (jeErr || !jeRows || jeRows.length === 0) return []

  const ids = jeRows.map((r) => r.id as string)
  const { data: lineRows } = await client
    .from("erp_gl_journal_lines")
    .select("journal_entry_id, debit_amount, credit_amount")
    .eq("company_id", companyId)
    .in("journal_entry_id", ids)

  const totalsByEntry = new Map<string, number>()
  for (const l of (lineRows ?? []) as {
    journal_entry_id: string
    debit_amount: number
    credit_amount: number
  }[]) {
    const prev = totalsByEntry.get(l.journal_entry_id) ?? 0
    // The JE total is conventionally the sum of debits (= sum of credits).
    totalsByEntry.set(l.journal_entry_id, prev + Number(l.debit_amount))
  }

  const candidates: CandidateJE[] = jeRows.map((r) => ({
    id: r.id as string,
    entry_number: r.entry_number as string,
    entry_date: r.entry_date as string,
    description: (r.description as string) ?? "",
    total_amount: totalsByEntry.get(r.id as string) ?? 0,
    source_type: (r.source_type as string) ?? "",
  }))

  const lineRefDigits = digitsOnly(line.reference)
  const proposals: MatchProposal[] = []

  for (const c of candidates) {
    const amountMatch =
      Math.abs(c.total_amount - Number(line.amount)) <= AMOUNT_TOLERANCE_ILS
    if (!amountMatch) continue

    const diffDays = daysBetween(c.entry_date, line.line_date)
    const dateConf = dateConfidence(diffDays)
    if (dateConf === 0) continue

    let confidence = dateConf
    const cRefDigits = digitsOnly(c.entry_number) + digitsOnly(c.description)
    const referenceMatch =
      lineRefDigits.length > 0 && cRefDigits.includes(lineRefDigits)
    if (referenceMatch) {
      confidence = Math.min(1, confidence + 0.2)
    }

    proposals.push({
      bank_line_id: bankLineId,
      candidate_je_id: c.id,
      confidence: Math.round(confidence * 1000) / 1000,
      factors: {
        amount_match: amountMatch,
        date_window_days: diffDays,
        reference_match: referenceMatch,
      },
    })
  }

  proposals.sort((a, b) => b.confidence - a.confidence)
  const limit = options.limit ?? 5
  return proposals.slice(0, limit)
}

/**
 * For an entire statement, return all proposals batched per bank line.
 * Used by the workspace UI's "auto-match all" button.
 */
export async function proposeMatchesForStatement(
  client: SupabaseClient,
  companyId: string,
  statementId: string,
): Promise<{ bankLineId: string; proposals: MatchProposal[] }[]> {
  const { data: lines, error } = await client
    .from("erp_bank_statement_lines")
    .select("id")
    .eq("company_id", companyId)
    .eq("statement_id", statementId)
    .is("matched_journal_entry_id", null)

  if (error || !lines) return []

  const out: { bankLineId: string; proposals: MatchProposal[] }[] = []
  for (const l of lines as { id: string }[]) {
    const proposals = await proposeMatches(client, companyId, l.id)
    out.push({ bankLineId: l.id, proposals })
  }
  return out
}

export const BANK_RECONCILIATION_CONSTANTS = {
  DATE_WINDOW_DAYS_TIGHT,
  DATE_WINDOW_DAYS_LOOSE,
  AMOUNT_TOLERANCE_ILS,
  AUTO_MATCH_THRESHOLD,
}
