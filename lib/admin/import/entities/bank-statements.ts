/**
 * Bank Statements importer — Sprint A.1.
 *
 * Source: standard Israeli bank CSV exports (Hapoalim primary; Leumi/Discount
 * tolerated through alias headers). Each CSV contains rows for a single bank
 * account + period.
 *
 * Workflow:
 *   1) Operator uploads a single statement CSV. The file's bank account is
 *      identified via the leading two metadata rows OR via the `bank_alias`
 *      column on every line.
 *   2) Importer creates (or finds) the `erp_bank_statements` header for the
 *      relevant period_yyyymm, then inserts all lines under it.
 *
 * Re-running the same file is idempotent: existing lines are wiped and
 * re-inserted under the same statement (period stays unique).
 *
 * Validation:
 *   - bank_alias must resolve to exactly one `erp_bank_accounts` row.
 *   - line_date must parse; sign convention: amount > 0, side from column.
 *   - period_yyyymm derived from MAX(line_date) per file.
 */
import type { SupabaseClient } from "@supabase/supabase-js"

import type { ImporterSpec, RowError } from "../types"

export type BankStatementImportPayload = {
  bank_alias: string
  line_date: string
  reference: string | null
  description: string | null
  amount: number
  side: "DEBIT" | "CREDIT"
}

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
  return Math.abs(n)
}

function transformSide(raw: string): "DEBIT" | "CREDIT" {
  const t = raw.trim().toLowerCase()
  if (!t) throw new Error("חסר סימון חובה/זכות")
  if (t === "debit" || t === "חובה" || t === "d" || t === "ח") return "DEBIT"
  if (t === "credit" || t === "זכות" || t === "c" || t === "ז") return "CREDIT"
  throw new Error(`סימון לא נתמך: "${raw}". יש להשתמש ב-DEBIT/CREDIT או חובה/זכות.`)
}

export const BANK_STATEMENTS_IMPORTER: ImporterSpec<BankStatementImportPayload> = {
  kind: "bank_statements",
  title: "שורות דף בנק",
  description:
    "ייבוא שורות דפי בנק מ-CSV (תבנית בנק הפועלים סטנדרטית). הקובץ מוקצה לחשבון בנק לפי alias, ומקובץ ל-statement לפי חודש.",
  templateFileName: "bank-statements-template.csv",
  columns: [
    {
      field: "bank_alias",
      label: "שם חשבון בנק",
      aliases: ["שם חשבון בנק", "כינוי חשבון", "Bank Alias", "bank_alias"],
      required: true,
    },
    {
      field: "line_date",
      label: "תאריך",
      aliases: ["תאריך", "תאריך ערך", "Date", "Value Date", "line_date"],
      required: true,
      transform: transformDate,
    },
    {
      field: "reference",
      label: "אסמכתא",
      aliases: ["אסמכתא", "מספר אסמכתא", "Reference", "Ref", "reference"],
      required: false,
    },
    {
      field: "description",
      label: "תיאור",
      aliases: ["תיאור", "פרטים", "Description", "Details", "description"],
      required: false,
    },
    {
      field: "amount",
      label: "סכום",
      aliases: ["סכום", "Amount", "amount"],
      required: true,
      transform: transformAmount,
    },
    {
      field: "side",
      label: "חובה/זכות",
      aliases: ["חובה/זכות", "סוג", "Side", "Type", "side"],
      required: true,
      transform: transformSide,
    },
  ],
  upsert: async (client: SupabaseClient, companyId, payloads) => {
    const failed: RowError[] = []
    if (payloads.length === 0) return { inserted: 0, updated: 0, failed }

    // 1) Resolve bank_alias → bank_account_id (one alias per file).
    const aliases = new Set(payloads.map((p) => p.bank_alias))
    if (aliases.size !== 1) {
      failed.push({
        rowNumber: 1,
        field: "bank_alias",
        message: `קובץ אחד = חשבון בנק אחד. נמצאו ${aliases.size} aliases שונים.`,
        rawValue: [...aliases].join(", "),
      })
      return { inserted: 0, updated: 0, failed }
    }
    const alias = [...aliases][0]
    const { data: account, error: accErr } = await client
      .from("erp_bank_accounts")
      .select("id")
      .eq("company_id", companyId)
      .eq("account_alias", alias)
      .maybeSingle<{ id: string }>()

    if (accErr || !account) {
      failed.push({
        rowNumber: 1,
        field: "bank_alias",
        message: `חשבון בנק "${alias}" לא קיים. הוסיפו אותו תחילה ב-/marker-ofek/finance/bank-accounts.`,
        rawValue: alias,
      })
      return { inserted: 0, updated: 0, failed }
    }

    // 2) Derive period_yyyymm and statement_date from the latest line.
    const sorted = [...payloads].sort((a, b) => a.line_date.localeCompare(b.line_date))
    const earliest = sorted[0].line_date
    const latest = sorted[sorted.length - 1].line_date
    const period = latest.slice(0, 7)

    // 3) Upsert statement header.
    const { data: statementRow, error: stmtErr } = await client
      .from("erp_bank_statements")
      .upsert(
        {
          company_id: companyId,
          bank_account_id: account.id,
          period_yyyymm: period,
          statement_date: latest,
          opening_balance: 0,
          closing_balance: 0,
          source_file_name: `import-${earliest}-${latest}.csv`,
        },
        { onConflict: "company_id,bank_account_id,period_yyyymm" },
      )
      .select("id")
      .single<{ id: string }>()

    if (stmtErr || !statementRow) {
      failed.push({
        rowNumber: 1,
        field: null,
        message: `שגיאה ביצירת dean header: ${stmtErr?.message}`,
        rawValue: null,
      })
      return { inserted: 0, updated: 0, failed }
    }

    // 4) Wipe existing lines for idempotency.
    const { error: delErr } = await client
      .from("erp_bank_statement_lines")
      .delete()
      .eq("company_id", companyId)
      .eq("statement_id", statementRow.id)
    if (delErr) {
      failed.push({
        rowNumber: 1,
        field: null,
        message: `שגיאה במחיקת שורות קודמות: ${delErr.message}`,
        rawValue: null,
      })
      return { inserted: 0, updated: 0, failed }
    }

    // 5) Insert fresh lines.
    const lineRows = sorted.map((p, i) => ({
      company_id: companyId,
      statement_id: statementRow.id,
      line_no: i + 1,
      line_date: p.line_date,
      reference: p.reference,
      description: p.description,
      amount: p.amount,
      side: p.side,
    }))
    const { error: insErr } = await client
      .from("erp_bank_statement_lines")
      .insert(lineRows)
    if (insErr) {
      failed.push({
        rowNumber: 1,
        field: null,
        message: `שגיאה בהכנסת שורות: ${insErr.message}`,
        rawValue: null,
      })
      return { inserted: 0, updated: 0, failed }
    }

    return { inserted: lineRows.length, updated: 0, failed }
  },
}
