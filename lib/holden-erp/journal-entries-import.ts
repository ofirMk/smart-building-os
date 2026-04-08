import { randomUUID } from "crypto"

import Papa from "papaparse"

import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role"

const REFERENCE_DOCUMENT_TYPE = "priority_legacy_journal"

function stripBom(text: string): string {
  if (text.charCodeAt(0) === 0xfeff) return text.slice(1)
  return text
}

export function normalizeJeHeaderKey(key: string): string {
  return stripBom(key).trim().replace(/\s+/g, " ")
}

function buildAliasSet(aliases: string[]): Set<string> {
  return new Set(aliases.map((a) => normalizeJeHeaderKey(a)))
}

function getCell(row: Record<string, string>, aliases: string[]): string {
  const want = buildAliasSet(aliases)
  for (const [k, v] of Object.entries(row)) {
    if (want.has(normalizeJeHeaderKey(k))) {
      return String(v ?? "").trim()
    }
  }
  return ""
}

function parseMoney(raw: string): number {
  const t = raw.trim().replace(/\s/g, "")
  if (!t) return 0
  const lastComma = t.lastIndexOf(",")
  const lastDot = t.lastIndexOf(".")
  let normalized = t
  if (lastComma > lastDot) {
    normalized = t.replace(/\./g, "").replace(",", ".")
  } else {
    normalized = t.replace(/,/g, "")
  }
  const n = Number(normalized)
  if (!Number.isFinite(n)) return 0
  return Math.round(n * 100) / 100
}

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100
}

function parseIsoDate(raw: string): string | null {
  const t = raw.trim()
  if (!t) return null
  const d = new Date(t)
  if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10)
  const m = /^(\d{1,2})[./](\d{1,2})[./](\d{2,4})$/.exec(t)
  if (m) {
    const day = Number(m[1])
    const month = Number(m[2]) - 1
    let year = Number(m[3])
    if (year < 100) year += 2000
    const dt = new Date(year, month, day)
    if (!Number.isNaN(dt.getTime())) return dt.toISOString().slice(0, 10)
  }
  return null
}

/** חובה → debit, זכות → credit */
function parseDebitCredit(raw: string): "debit" | "credit" | null {
  const t = raw.trim().toLowerCase()
  if (!t) return null
  if (
    t.includes("חובה") ||
    t === "ח" ||
    t === "d" ||
    t === "dr" ||
    t === "debit" ||
    t === "חוב"
  ) {
    return "debit"
  }
  if (
    t.includes("זכות") ||
    t === "ז" ||
    t === "c" ||
    t === "cr" ||
    t === "credit"
  ) {
    return "credit"
  }
  return null
}

/** מקטע קוד חשבון מתחילת תא (לפני מקף/רווח/תיאור) */
function parseAccountCode(raw: string): string {
  const t = raw.trim()
  if (!t) return ""
  const first = t.split(/\s|—|–|-/u)[0]?.trim() ?? t
  return first.replace(/\s/g, "")
}

function isUuid(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    s.trim()
  )
}

// --- Column aliases (Priority / עברית) ---

const COL_JOURNAL_NUM = [
  "מס. תנועת היומן",
  "מס תנועת היומן",
  "מספר תנועת היומן",
  "מספר תנועה",
  "Journal Entry",
  "journal_entry_number",
  "מס תנועה",
]

const COL_LINE = ["שורה", "Line", "line", "מספר שורה", "sort_order"]

const COL_TX_TYPE = [
  "סוג תנועה",
  "Transaction Type",
  "transaction_type",
  "סוג",
]

const COL_ACCOUNT = ["חשבון", "Account", "account", "קוד חשבון", "חשבון חובה/זכות"]

const COL_DC = ["חובה/זכות", "חובה / זכות", "D/C", "Debit/Credit", "סוג תנועה חובה זכות"]

const COL_AMOUNT = ["סכום בשקלים", "סכום", "Amount", "amount", "סכום ₪"]

const COL_PROJECT = ["פרויקט", "Project", "project", "קוד פרויקט", "מספר פרויקט"]

const COL_WBS = ["מספר פעילות WBS", "WBS", "wbs", "פעילות WBS", "מזהה WBS"]

const COL_DATE = ["תאריך", "Date", "entry_date", "תאריך תנועה"]

export type JournalEntriesImportResult =
  | {
      ok: true
      entriesInserted: number
      linesInserted: number
      skippedJournalKeys: number
      warnings: string[]
    }
  | { ok: false; error: string }

type PreparedLine = {
  account_id: string
  debit_amount: number
  credit_amount: number
  sort_order: number
  line_memo: string | null
  project_id: string | null
  wbs_node_id: string | null
  legacy_journal_entry_number: string
  transaction_type: string | null
}

/**
 * ייבוא היסטוריית תנועות יומן מ-Priority (CSV).
 * מקובץ לפי מספר תנועה, יוצר `gl_journal_entries` + `gl_journal_lines` (service role).
 */
export async function parseAndUpsertJournalEntries(
  csvContent: string
): Promise<JournalEntriesImportResult> {
  const text = stripBom(csvContent ?? "")
  if (!text.trim()) {
    return { ok: false, error: "קובץ ריק" }
  }

  const parsed = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (h) => normalizeJeHeaderKey(h),
  })

  if (parsed.errors?.length) {
    const fatal = parsed.errors.find((e) => e.type === "Quotes" || e.type === "FieldMismatch")
    if (fatal) {
      return { ok: false, error: `שגיאת CSV: ${fatal.message}` }
    }
  }

  const rawRows =
    parsed.data?.filter((r) => Object.values(r).some((v) => String(v ?? "").trim() !== "")) ?? []
  if (!rawRows.length) {
    return { ok: false, error: "אין שורות נתונים" }
  }

  const byJournal = new Map<string, Record<string, string>[]>()
  for (const row of rawRows) {
    const jn = getCell(row, COL_JOURNAL_NUM)
    if (!jn) continue
    const k = jn.trim()
    if (!byJournal.has(k)) byJournal.set(k, [])
    byJournal.get(k)!.push(row)
  }

  if (!byJournal.size) {
    return { ok: false, error: 'חסרה עמודת "מס. תנועת היומן" או אין מספרי תנועה' }
  }

  const supabase = createSupabaseServiceRoleClient()

  const journalKeys = [...byJournal.keys()]
  const alreadyImported = new Set<string>()
  const LEGACY_CHUNK = 300
  for (let i = 0; i < journalKeys.length; i += LEGACY_CHUNK) {
    const chunk = journalKeys.slice(i, i + LEGACY_CHUNK)
    const { data: existingLegacy } = await supabase
      .from("gl_journal_lines")
      .select("legacy_journal_entry_number")
      .in("legacy_journal_entry_number", chunk)
    for (const r of existingLegacy ?? []) {
      alreadyImported.add(
        String((r as { legacy_journal_entry_number: string }).legacy_journal_entry_number)
      )
    }
  }

  const { data: accounts, error: accErr } = await supabase
    .from("gl_accounts")
    .select("id, account_code")
    .eq("is_active", true)

  if (accErr || !accounts?.length) {
    return {
      ok: false,
      error: accErr?.message ?? "לא נטענו חשבונות מ-gl_accounts",
    }
  }

  const accountIdByCode = new Map<string, string>()
  for (const a of accounts as { id: string; account_code: string }[]) {
    accountIdByCode.set(String(a.account_code).trim().toLowerCase(), a.id)
  }

  const { data: projects, error: projErr } = await supabase
    .from("projects")
    .select("id, internal_project_code, name, is_deleted")
    .or("is_deleted.is.null,is_deleted.eq.false")

  if (projErr) {
    return { ok: false, error: projErr.message }
  }

  const projectIdByCode = new Map<string, string>()
  const projectIdByName = new Map<string, string>()
  for (const p of (projects ?? []) as {
    id: string
    internal_project_code: string | null
    name: string | null
  }[]) {
    if (p.internal_project_code?.trim()) {
      projectIdByCode.set(p.internal_project_code.trim().toLowerCase(), p.id)
    }
    if (p.name?.trim()) {
      projectIdByName.set(p.name.trim().toLowerCase(), p.id)
    }
  }

  const { data: wbsRows } = await supabase
    .from("erp_project_wbs")
    .select("id, project_id, milestone_name")

  const wbsList = (wbsRows ?? []) as {
    id: string
    project_id: string
    milestone_name: string
  }[]

  const warnings: string[] = []
  let entriesInserted = 0
  let linesInserted = 0
  let skippedJournalKeys = 0

  for (const [journalKey, rows] of byJournal) {
    const legacyNum = journalKey.trim()

    if (alreadyImported.has(legacyNum)) {
      warnings.push(`תנועה ${legacyNum}: כבר קיימת במערכת — דולג`)
      skippedJournalKeys++
      continue
    }

    const entryDate =
      parseIsoDate(getCell(rows[0]!, COL_DATE)) ??
      new Date().toISOString().slice(0, 10)

    const prepared: PreparedLine[] = []
    let groupDebit = 0
    let groupCredit = 0

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]!
      const acRaw = getCell(row, COL_ACCOUNT)
      const code = parseAccountCode(acRaw)
      if (!code) {
        warnings.push(`תנועה ${legacyNum} שורה ${i + 1}: חסר חשבון — דולג`)
        continue
      }

      const accountId = accountIdByCode.get(code.toLowerCase())
      if (!accountId) {
        return {
          ok: false,
          error: `תנועה ${legacyNum}: חשבון לא קיים בכרטסת — ${code}`,
        }
      }

      const side = parseDebitCredit(getCell(row, COL_DC))
      if (!side) {
        return {
          ok: false,
          error: `תנועה ${legacyNum} שורה ${i + 1}: חובה/זכות לא מזוהה`,
        }
      }

      const amt = parseMoney(getCell(row, COL_AMOUNT))
      if (amt <= 0) {
        warnings.push(`תנועה ${legacyNum} שורה ${i + 1}: סכום אפס — דולג`)
        continue
      }

      const debit_amount = side === "debit" ? amt : 0
      const credit_amount = side === "credit" ? amt : 0
      groupDebit = roundMoney(groupDebit + debit_amount)
      groupCredit = roundMoney(groupCredit + credit_amount)

      const projRaw = getCell(row, COL_PROJECT)
      let project_id: string | null = null
      if (projRaw) {
        const key = projRaw.trim().toLowerCase()
        project_id =
          projectIdByCode.get(key) ?? projectIdByName.get(key) ?? null
        if (!project_id) {
          warnings.push(
            `תנועה ${legacyNum} שורה ${i + 1}: פרויקט "${projRaw}" לא נמצא — שורה ללא project_id`
          )
        }
      }

      const wbsRaw = getCell(row, COL_WBS)
      let wbs_node_id: string | null = null
      if (wbsRaw) {
        if (isUuid(wbsRaw)) {
          const hit = wbsList.find((w) => w.id === wbsRaw.trim())
          if (hit) {
            if (project_id && hit.project_id !== project_id) {
              warnings.push(
                `תנועה ${legacyNum} שורה ${i + 1}: WBS לא שייך לאותו פרויקט — בוטל wbs_node_id`
              )
            } else {
              wbs_node_id = hit.id
            }
          } else {
            warnings.push(`תנועה ${legacyNum} שורה ${i + 1}: WBS id לא נמצא`)
          }
        } else {
          const candidates = wbsList.filter(
            (w) =>
              w.milestone_name.trim().toLowerCase() === wbsRaw.trim().toLowerCase()
          )
          const match =
            project_id != null
              ? candidates.find((w) => w.project_id === project_id)
              : candidates[0]
          if (match) wbs_node_id = match.id
          else {
            warnings.push(
              `תנועה ${legacyNum} שורה ${i + 1}: WBS "${wbsRaw}" לא נמצא`
            )
          }
        }
      }

      const sortStr = getCell(row, COL_LINE)
      const sort_order = sortStr ? parseInt(sortStr, 10) || i : i

      const transaction_type = getCell(row, COL_TX_TYPE) || null

      prepared.push({
        account_id: accountId,
        debit_amount,
        credit_amount,
        sort_order,
        line_memo: acRaw !== code ? acRaw : null,
        project_id,
        wbs_node_id,
        legacy_journal_entry_number: legacyNum,
        transaction_type,
      })
    }

    if (!prepared.length) {
      warnings.push(`תנועה ${legacyNum}: אין שורות תקינות — דולג`)
      skippedJournalKeys++
      continue
    }

    if (groupDebit !== groupCredit) {
      return {
        ok: false,
        error: `תנועה ${legacyNum}: לא מאוזנת — חובה ${groupDebit} זכות ${groupCredit}`,
      }
    }

    const projectIds = new Set(
      prepared.map((p) => p.project_id).filter(Boolean) as string[]
    )
    const headerProjectId =
      projectIds.size === 1 ? [...projectIds][0]! : null

    const refId = randomUUID()

    const { data: header, error: hErr } = await supabase
      .from("gl_journal_entries")
      .insert({
        entry_date: entryDate,
        reference_document_type: REFERENCE_DOCUMENT_TYPE,
        reference_document_id: refId,
        description: `Priority journal #${legacyNum} (import)`,
        project_id: headerProjectId,
        created_by: null,
      })
      .select("id")
      .single()

    if (hErr || !header) {
      return {
        ok: false,
        error: hErr?.message ?? "יצירת כותרת יומן נכשלה",
      }
    }

    const jeId = (header as { id: string }).id

    const linePayload = prepared
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((p, idx) => ({
        journal_entry_id: jeId,
        account_id: p.account_id,
        debit_amount: p.debit_amount,
        credit_amount: p.credit_amount,
        line_memo: p.line_memo,
        sort_order: idx,
        project_id: p.project_id,
        wbs_node_id: p.wbs_node_id,
        legacy_journal_entry_number: p.legacy_journal_entry_number,
        transaction_type: p.transaction_type,
      }))

    const { error: lErr } = await supabase.from("gl_journal_lines").insert(linePayload)

    if (lErr) {
      await supabase.from("gl_journal_entries").delete().eq("id", jeId)
      return { ok: false, error: lErr.message }
    }

    entriesInserted++
    linesInserted += linePayload.length
  }

  return {
    ok: true,
    entriesInserted,
    linesInserted,
    skippedJournalKeys,
    warnings,
  }
}
