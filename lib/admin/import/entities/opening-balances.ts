/**
 * Opening Balances importer (`erp_gl_journal_entries` + `erp_gl_journal_lines`).
 *
 * Operator workflow: enter one row per account with a single `amount` value.
 * The importer auto-computes debit-vs-credit based on the account's natural
 * side:
 *   - ASSET / EXPENSE  → positive amount = DEBIT.
 *   - LIABILITY / EQUITY / REVENUE → positive amount = CREDIT.
 *   - Negative amounts flip the side.
 *
 * Invariant: total debits MUST equal total credits across the batch. If the
 * batch is unbalanced, the entire import is rejected with a single batch-level
 * error (no partial commit).
 *
 * Idempotency: the journal entry uses a deterministic `entry_number` based on
 * the entry_date, so re-running the same import upserts the same entry rather
 * than duplicating it.
 *
 * Persistence model: ALL the rows in one file collapse into ONE journal entry
 * (the customary opening-balance entry) with N lines.
 */
import type { SupabaseClient } from "@supabase/supabase-js"

import { resolveAccountIds } from "../lookups"
import type { ImporterSpec, RowError } from "../types"

export type OpeningBalanceImportPayload = {
  account_number: string
  amount: number
  entry_date: string
  description: string | null
}

const DEBIT_SIDE_TYPES = new Set(["ASSET", "EXPENSE"])

function transformDate(raw: string): string {
  const t = raw.trim()
  if (!t) throw new Error("חסר תאריך")
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t
  const m = /^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2,4})$/.exec(t)
  if (m) {
    const y = m[3].length === 2 ? `20${m[3]}` : m[3]
    return `${y}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`
  }
  throw new Error(`פורמט תאריך לא נתמך: "${raw}". השתמשו ב-YYYY-MM-DD או DD/MM/YYYY.`)
}

function transformAmount(raw: string): number {
  const cleaned = raw.replace(/[,₪\s]/g, "")
  const n = Number(cleaned)
  if (!Number.isFinite(n)) throw new Error(`סכום לא מספרי: "${raw}"`)
  return n
}

export const OPENING_BALANCES_IMPORTER: ImporterSpec<OpeningBalanceImportPayload> = {
  kind: "opening_balances",
  title: "יתרות פתיחה",
  description:
    "ייבוא יתרות פתיחה לכל חשבון. כל הקובץ מתקפל ל-journal entry יחיד. חיוב/זיכוי נקבע אוטומטית לפי סוג החשבון. בודק שסך החיובים = סך הזיכויים.",
  templateFileName: "opening-balances-template.csv",
  columns: [
    {
      field: "account_number",
      label: "מספר חשבון",
      aliases: ["מספר חשבון", "Account Number", "account_number"],
      required: true,
    },
    {
      field: "amount",
      label: "סכום",
      aliases: ["סכום", "יתרה", "Amount", "Balance", "amount"],
      required: true,
      transform: transformAmount,
    },
    {
      field: "entry_date",
      label: "תאריך פתיחה",
      aliases: ["תאריך פתיחה", "תאריך", "Entry Date", "entry_date"],
      required: true,
      transform: transformDate,
    },
    {
      field: "description",
      label: "הערה",
      aliases: ["הערה", "תיאור", "Description", "description"],
      required: false,
    },
  ],
  upsert: async (client: SupabaseClient, companyId, payloads) => {
    const failed: RowError[] = []
    if (payloads.length === 0) return { inserted: 0, updated: 0, failed }

    // 1) All rows must share the same entry_date (an opening-balance batch is a single moment).
    const distinctDates = new Set(payloads.map((p) => p.entry_date))
    if (distinctDates.size !== 1) {
      failed.push({
        rowNumber: 1,
        field: "entry_date",
        message: `כל השורות חייבות להיות באותו תאריך. נמצאו ${distinctDates.size} תאריכים שונים.`,
        rawValue: [...distinctDates].join(", "),
      })
      return { inserted: 0, updated: 0, failed }
    }
    const entryDate = payloads[0].entry_date

    // 2) Resolve every account_number; abort on any failure.
    const accountMap = await resolveAccountIds(
      client,
      companyId,
      payloads.map((p) => p.account_number),
    )
    type Resolved = {
      p: OpeningBalanceImportPayload
      account_id: string
      account_type: string
      rowIdx: number
    }
    const resolved: Resolved[] = []
    payloads.forEach((p, idx) => {
      const info = accountMap.get(p.account_number)
      if (!info) {
        failed.push({
          rowNumber: idx + 2,
          field: "account_number",
          message: `חשבון "${p.account_number}" לא קיים. ייבאו את ה-Chart of Accounts תחילה.`,
          rawValue: p.account_number,
        })
        return
      }
      resolved.push({ p, account_id: info.id, account_type: info.account_type, rowIdx: idx })
    })
    if (failed.length > 0) {
      return { inserted: 0, updated: 0, failed }
    }

    // 3) Compute D/C per row + check batch balance (sum D == sum C).
    type DcLine = {
      rowIdx: number
      account_id: string
      debit_amount: number
      credit_amount: number
      description: string | null
    }
    const lines: DcLine[] = []
    let totalDebits = 0
    let totalCredits = 0

    for (const r of resolved) {
      if (r.p.amount === 0) continue
      const isNaturalDebitSide = DEBIT_SIDE_TYPES.has(r.account_type)
      const goesToDebit =
        (isNaturalDebitSide && r.p.amount > 0) ||
        (!isNaturalDebitSide && r.p.amount < 0)
      const abs = Math.abs(r.p.amount)
      const debit_amount = goesToDebit ? abs : 0
      const credit_amount = goesToDebit ? 0 : abs
      lines.push({
        rowIdx: r.rowIdx,
        account_id: r.account_id,
        debit_amount,
        credit_amount,
        description: r.p.description,
      })
      totalDebits += debit_amount
      totalCredits += credit_amount
    }

    if (lines.length === 0) {
      failed.push({
        rowNumber: 1,
        field: null,
        message: "אין שורות לייבוא — כל הסכומים אפס.",
        rawValue: null,
      })
      return { inserted: 0, updated: 0, failed }
    }

    const diff = Math.round((totalDebits - totalCredits) * 100) / 100
    if (diff !== 0) {
      failed.push({
        rowNumber: 1,
        field: null,
        message: `יתרות פתיחה לא מאוזנות: סך חיובים = ₪${totalDebits.toLocaleString("he-IL")}, סך זיכויים = ₪${totalCredits.toLocaleString("he-IL")}, פער = ₪${diff.toLocaleString("he-IL")}.`,
        rawValue: null,
      })
      return { inserted: 0, updated: 0, failed }
    }

    // 4) Upsert ONE journal entry header, deterministic entry_number for idempotency.
    const entryNumber = `OB-${entryDate.replace(/-/g, "")}`
    const { data: entryRow, error: entryErr } = await client
      .from("erp_gl_journal_entries")
      .upsert(
        {
          company_id: companyId,
          entry_number: entryNumber,
          entry_date: entryDate,
          description: `יתרות פתיחה ליום ${entryDate}`,
          source_type: "opening_balance",
          source_ref: null,
          // Insert as DRAFT so we can write all lines; flip to POSTED last.
          status: "DRAFT",
        },
        { onConflict: "company_id,entry_number" },
      )
      .select("id")
      .single()

    if (entryErr || !entryRow) {
      failed.push({
        rowNumber: 1,
        field: null,
        message: `שגיאה ביצירת journal entry: ${entryErr?.message ?? "unknown"}`,
        rawValue: null,
      })
      return { inserted: 0, updated: 0, failed }
    }

    // 5) Wipe existing lines (idempotent re-run) and insert fresh ones.
    const { error: delErr } = await client
      .from("erp_gl_journal_lines")
      .delete()
      .eq("journal_entry_id", entryRow.id)
      .eq("company_id", companyId)
    if (delErr) {
      failed.push({
        rowNumber: 1,
        field: null,
        message: `שגיאה במחיקת שורות קודמות: ${delErr.message}`,
        rawValue: null,
      })
      return { inserted: 0, updated: 0, failed }
    }

    const lineRows = lines.map((l, i) => ({
      company_id: companyId,
      journal_entry_id: entryRow.id,
      line_no: i + 1,
      account_id: l.account_id,
      debit_amount: l.debit_amount,
      credit_amount: l.credit_amount,
      description: l.description,
    }))

    const { error: insLinesErr } = await client
      .from("erp_gl_journal_lines")
      .insert(lineRows)
    if (insLinesErr) {
      failed.push({
        rowNumber: 1,
        field: null,
        message: `שגיאה בהכנסת שורות יומן: ${insLinesErr.message}`,
        rawValue: null,
      })
      return { inserted: 0, updated: 0, failed }
    }

    // 6) Flip to POSTED — the deferred constraint trigger will assert balance.
    const { error: postErr } = await client
      .from("erp_gl_journal_entries")
      .update({ status: "POSTED", posted_at: new Date().toISOString() })
      .eq("id", entryRow.id)
      .eq("company_id", companyId)
    if (postErr) {
      failed.push({
        rowNumber: 1,
        field: null,
        message: `שגיאה בהעברת ה-journal ל-POSTED (כנראה לא מאוזן): ${postErr.message}`,
        rawValue: null,
      })
      return { inserted: 0, updated: 0, failed }
    }

    // Account counts: each row maps to one journal line. Treat all as inserted
    // (or updated, if the entry already existed). Without distinguishing here,
    // we report all as inserted-equivalent.
    return {
      inserted: lines.length,
      updated: 0,
      failed,
    }
  },
}
