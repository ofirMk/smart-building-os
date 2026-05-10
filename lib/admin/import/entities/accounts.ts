/**
 * Chart of Accounts importer (`erp_gl_accounts`).
 *
 * Source: Priority's ACCOUNTS form. Conflict key: `(company_id, account_number)`.
 *
 * Hierarchical: optional `parent_account_number` resolves to `parent_account_id`.
 * Self-reference handling: a row may reference a parent that is BEING IMPORTED
 * in the same file. Strategy:
 *   1. Insert all rows with parent_account_id=NULL.
 *   2. After upsert, run a second pass that resolves & sets parents.
 * This is safe because parent FK is just structural (no cascading constraints).
 */
import type { SupabaseClient } from "@supabase/supabase-js"

import { resolveAccountIds } from "../lookups"
import type { ImporterSpec, RowError } from "../types"

const UPSERT_CHUNK = 200

export type AccountImportPayload = {
  account_number: string
  account_name: string
  account_type: "ASSET" | "LIABILITY" | "EQUITY" | "REVENUE" | "EXPENSE"
  parent_account_number: string | null
  is_active: boolean
  description: string | null
}

const VALID_TYPES = new Set(["ASSET", "LIABILITY", "EQUITY", "REVENUE", "EXPENSE"])

function transformType(raw: string): AccountImportPayload["account_type"] {
  const t = raw.trim().toUpperCase()
  if (!t) throw new Error("חסר סוג חשבון")
  if (VALID_TYPES.has(t)) return t as AccountImportPayload["account_type"]
  // Hebrew aliases
  if (t.includes("נכס")) return "ASSET"
  if (t.includes("התחייבות") || t.includes("חוב")) return "LIABILITY"
  if (t.includes("הון")) return "EQUITY"
  if (t.includes("הכנסה")) return "REVENUE"
  if (t.includes("הוצאה")) return "EXPENSE"
  throw new Error(`סוג חשבון לא חוקי: "${raw}". מותר: ASSET/LIABILITY/EQUITY/REVENUE/EXPENSE.`)
}

function transformActive(raw: string): boolean {
  const t = raw.trim().toLowerCase()
  if (!t) return true
  if (["yes", "y", "true", "1", "כן", "פעיל"].includes(t)) return true
  if (["no", "n", "false", "0", "לא", "לא פעיל"].includes(t)) return false
  throw new Error(`ערך פעיל/לא לא חוקי: "${raw}"`)
}

export const ACCOUNTS_IMPORTER: ImporterSpec<AccountImportPayload> = {
  kind: "accounts",
  title: "תרשים חשבונות",
  description:
    "ייבוא Chart of Accounts. תומך בהיררכיה דרך parent_account_number (ההורה יכול להיות באותו קובץ).",
  templateFileName: "accounts-template.csv",
  columns: [
    {
      field: "account_number",
      label: "מספר חשבון",
      aliases: ["מספר חשבון", "Account Number", "account_number", "ACCOUNT"],
      required: true,
    },
    {
      field: "account_name",
      label: "שם חשבון",
      aliases: ["שם חשבון", "Account Name", "account_name", "ACCDES"],
      required: true,
    },
    {
      field: "account_type",
      label: "סוג",
      aliases: ["סוג", "Type", "account_type"],
      required: true,
      transform: transformType,
    },
    {
      field: "parent_account_number",
      label: "מספר חשבון אב",
      aliases: ["מספר חשבון אב", "חשבון אב", "Parent Account", "parent_account_number"],
      required: false,
    },
    {
      field: "is_active",
      label: "פעיל",
      aliases: ["פעיל", "Active", "is_active"],
      required: false,
      transform: transformActive,
    },
    {
      field: "description",
      label: "תיאור",
      aliases: ["תיאור", "Description", "description"],
      required: false,
    },
  ],
  upsert: async (client: SupabaseClient, companyId, payloads) => {
    const failed: RowError[] = []
    let inserted = 0
    let updated = 0

    // Phase 1 — upsert all rows with parent_account_id = null.
    const numbers = payloads.map((p) => p.account_number)
    const { data: existing } = await client
      .from("erp_gl_accounts")
      .select("account_number")
      .eq("company_id", companyId)
      .in("account_number", numbers)
    const existingSet = new Set(
      (existing ?? []).map((r: { account_number: string }) => r.account_number),
    )

    for (let i = 0; i < payloads.length; i += UPSERT_CHUNK) {
      const chunk = payloads.slice(i, i + UPSERT_CHUNK)
      const rows = chunk.map((p) => ({
        company_id: companyId,
        account_number: p.account_number,
        account_name: p.account_name,
        account_type: p.account_type,
        parent_account_id: null,
        is_active: p.is_active ?? true,
        description: p.description,
      }))
      const { error } = await client
        .from("erp_gl_accounts")
        .upsert(rows, { onConflict: "company_id,account_number" })
      if (error) {
        failed.push({
          rowNumber: i + 2,
          field: null,
          message: `שגיאת DB ב-chunk שמתחיל בשורה ${i + 2}: ${error.message}`,
          rawValue: null,
        })
        continue
      }
      for (const p of chunk) {
        if (existingSet.has(p.account_number)) updated += 1
        else inserted += 1
      }
    }

    // Phase 2 — resolve parent links for rows that declared one.
    const withParents = payloads.filter((p) => p.parent_account_number)
    if (withParents.length === 0) return { inserted, updated, failed }

    const allReferencedNumbers = [
      ...withParents.map((p) => p.account_number),
      ...withParents.map((p) => p.parent_account_number as string),
    ]
    const accountMap = await resolveAccountIds(
      client,
      companyId,
      allReferencedNumbers,
    )

    for (const p of withParents) {
      const childInfo = accountMap.get(p.account_number)
      const parentInfo = accountMap.get(p.parent_account_number as string)
      if (!childInfo) continue // shouldn't happen — we just inserted it.
      if (!parentInfo) {
        failed.push({
          rowNumber: payloads.indexOf(p) + 2,
          field: "parent_account_number",
          message: `חשבון אב "${p.parent_account_number}" לא נמצא — הקשר ההיררכי לא נוצר.`,
          rawValue: p.parent_account_number,
        })
        continue
      }
      if (childInfo.id === parentInfo.id) {
        failed.push({
          rowNumber: payloads.indexOf(p) + 2,
          field: "parent_account_number",
          message: "חשבון לא יכול להיות הורה של עצמו.",
          rawValue: p.parent_account_number,
        })
        continue
      }
      const { error } = await client
        .from("erp_gl_accounts")
        .update({ parent_account_id: parentInfo.id })
        .eq("id", childInfo.id)
        .eq("company_id", companyId)
      if (error) {
        failed.push({
          rowNumber: payloads.indexOf(p) + 2,
          field: "parent_account_number",
          message: `שגיאה בעדכון חשבון אב: ${error.message}`,
          rawValue: p.parent_account_number,
        })
      }
    }

    return { inserted, updated, failed }
  },
}
