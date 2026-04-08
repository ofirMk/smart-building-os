import Papa from "papaparse"

import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role"

const CHUNK = 200

function stripBom(text: string): string {
  if (text.charCodeAt(0) === 0xfeff) return text.slice(1)
  return text
}

export function normalizePlanningHeaderKey(key: string): string {
  return stripBom(key).trim().replace(/\s+/g, " ")
}

function buildAliasSet(aliases: string[]): Set<string> {
  return new Set(aliases.map((a) => normalizePlanningHeaderKey(a)))
}

function getCell(
  row: Record<string, string>,
  aliases: string[]
): string {
  const want = buildAliasSet(aliases)
  for (const [k, v] of Object.entries(row)) {
    if (want.has(normalizePlanningHeaderKey(k))) {
      return String(v ?? "").trim()
    }
  }
  return ""
}

function parseDecimal(raw: string): number {
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
  return Number.isFinite(n) ? n : 0
}

function clampPct(n: number): number {
  if (n < 0) return 0
  if (n > 100) return 100
  return Math.round(n * 100) / 100
}

/** תאריך yyyy-mm-dd או ריק */
function parseIsoDate(raw: string): string | null {
  const t = raw.trim()
  if (!t) return null
  const d = new Date(t)
  if (Number.isNaN(d.getTime())) {
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
  return d.toISOString().slice(0, 10)
}

function isUuid(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    s.trim()
  )
}

// --- BoQ (Sheet 1) ---

const BOQ_SKU = ['מק"ט', "מקט", "SKU", "item_sku", "פריט"]
const BOQ_QTY = ["כמות", "כמות מתוכננת", "Quantity", "planned_quantity", "כמות תכנון"]
const BOQ_UOM = ["יחידה", "יחידת מידה", "UOM", "unit"]
const BOQ_UNIT_COST = [
  "עלות יחידה",
  "עלות יחידה מוערכת",
  "מחיר יחידה",
  "estimated_unit_cost",
  "Rate",
  "תעריף",
]

export type ProjectBoqImportResult =
  | { ok: true; upserted: number; skipped: number; warnings: string[] }
  | { ok: false; error: string }

/**
 * ייבוא BoQ תכנוני (Sheet 1) → `erp_project_boq`.
 * Upsert לפי (project_id, item_sku). דורש מק״ט קיים ב-`erp_items`.
 */
export async function parseAndUpsertProjectBoq(
  projectId: string,
  csvContent: string
): Promise<ProjectBoqImportResult> {
  const pid = projectId?.trim()
  if (!pid || !isUuid(pid)) {
    return { ok: false, error: "projectId לא תקין (נדרש UUID)" }
  }

  const text = stripBom(csvContent ?? "")
  if (!text.trim()) {
    return { ok: false, error: "קובץ ריק" }
  }

  const parsed = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (h) => normalizePlanningHeaderKey(h),
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

  const warnings: string[] = []
  const payloads: {
    project_id: string
    item_sku: string
    planned_quantity: number
    uom: string
    estimated_unit_cost: number
  }[] = []

  for (let i = 0; i < rawRows.length; i++) {
    const row = rawRows[i]
    const item_sku = getCell(row, BOQ_SKU).trim()
    if (!item_sku) {
      warnings.push(`שורה ${i + 2}: חסר מקט — דולג`)
      continue
    }
    const planned_quantity = parseDecimal(getCell(row, BOQ_QTY))
    const uom = getCell(row, BOQ_UOM) || ""
    const estimated_unit_cost = parseDecimal(getCell(row, BOQ_UNIT_COST))

    payloads.push({
      project_id: pid,
      item_sku,
      planned_quantity,
      uom,
      estimated_unit_cost,
    })
  }

  if (!payloads.length) {
    return { ok: false, error: "אין שורות עם מקט תקין" }
  }

  const lastBySku = new Map<string, (typeof payloads)[0]>()
  for (const p of payloads) {
    lastBySku.set(p.item_sku, p)
  }
  const deduped = [...lastBySku.values()]
  if (payloads.length > deduped.length) {
    warnings.push(
      `הוסרו ${payloads.length - deduped.length} שורות כפולות (אותו מקט — נשמרה השורה האחרונה)`
    )
  }

  const supabase = createSupabaseServiceRoleClient()

  const { data: proj, error: pErr } = await supabase
    .from("projects")
    .select("id, is_deleted")
    .eq("id", pid)
    .maybeSingle()

  if (pErr) return { ok: false, error: pErr.message }
  if (!proj || proj.is_deleted) {
    return { ok: false, error: "פרויקט לא נמצא" }
  }

  let upserted = 0
  for (let i = 0; i < deduped.length; i += CHUNK) {
    const chunk = deduped.slice(i, i + CHUNK)
    const { error } = await supabase.from("erp_project_boq").upsert(chunk, {
      onConflict: "project_id,item_sku",
    })
    if (error) {
      return { ok: false, error: `erp_project_boq: ${error.message}` }
    }
    upserted += chunk.length
  }

  const skipped = rawRows.length - payloads.length
  return { ok: true, upserted, skipped, warnings }
}

// --- WBS (Sheet 2) ---

const WBS_NAME = [
  "אבן דרך",
  "שלב",
  "שם שלב",
  "milestone",
  "Milestone",
  "milestone_name",
  "שם",
]
const WBS_AMOUNT = ["סכום", "סכום מתוכנן", "תקציב", "planned_amount", "Amount", "סכום תכנון"]
const WBS_PROGRESS = ["אחוז ביצוע", "התקדמות", "progress", "Progress %", "progress_pct", "% ביצוע"]
const WBS_TARGET = ["תאריך יעד", "target_date", "תאריך", "יעד"]
const WBS_STATUS = ["סטטוס", "status", "Status"]
const WBS_MANAGER = ["מנהל", "אחראי", "manager", "Manager", "manager_name", "אופיר"]

export type ProjectWbsImportResult =
  | { ok: true; upserted: number; skipped: number; warnings: string[] }
  | { ok: false; error: string }

/**
 * ייבוא WBS / אבני דרך (Sheet 2) → `erp_project_wbs`.
 * Upsert לפי (project_id, milestone_name).
 */
export async function parseAndUpsertProjectWbs(
  projectId: string,
  csvContent: string
): Promise<ProjectWbsImportResult> {
  const pid = projectId?.trim()
  if (!pid || !isUuid(pid)) {
    return { ok: false, error: "projectId לא תקין (נדרש UUID)" }
  }

  const text = stripBom(csvContent ?? "")
  if (!text.trim()) {
    return { ok: false, error: "קובץ ריק" }
  }

  const parsed = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (h) => normalizePlanningHeaderKey(h),
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

  const warnings: string[] = []
  const payloads: {
    project_id: string
    milestone_name: string
    planned_amount: number
    progress_pct: number
    target_date: string | null
    status: string
    manager_name: string
  }[] = []

  for (let i = 0; i < rawRows.length; i++) {
    const row = rawRows[i]
    const milestone_name = getCell(row, WBS_NAME).trim()
    if (!milestone_name) {
      warnings.push(`שורה ${i + 2}: חסר שם אבן דרך — דולג`)
      continue
    }
    const planned_amount = parseDecimal(getCell(row, WBS_AMOUNT))
    const progress_pct = clampPct(parseDecimal(getCell(row, WBS_PROGRESS)))
    const target_date = parseIsoDate(getCell(row, WBS_TARGET))
    const status = getCell(row, WBS_STATUS) || ""
    const manager_name = getCell(row, WBS_MANAGER) || ""

    payloads.push({
      project_id: pid,
      milestone_name,
      planned_amount,
      progress_pct,
      target_date,
      status,
      manager_name,
    })
  }

  if (!payloads.length) {
    return { ok: false, error: "אין שורות עם שם אבן דרך תקין" }
  }

  const lastByName = new Map<string, (typeof payloads)[0]>()
  for (const p of payloads) {
    lastByName.set(p.milestone_name, p)
  }
  const deduped = [...lastByName.values()]
  if (payloads.length > deduped.length) {
    warnings.push(
      `הוסרו ${payloads.length - deduped.length} שורות כפולות (אותו שם שלב — נשמרה השורה האחרונה)`
    )
  }

  const supabase = createSupabaseServiceRoleClient()

  const { data: proj, error: pErr } = await supabase
    .from("projects")
    .select("id, is_deleted")
    .eq("id", pid)
    .maybeSingle()

  if (pErr) return { ok: false, error: pErr.message }
  if (!proj || proj.is_deleted) {
    return { ok: false, error: "פרויקט לא נמצא" }
  }

  let upserted = 0
  for (let i = 0; i < deduped.length; i += CHUNK) {
    const chunk = deduped.slice(i, i + CHUNK)
    const { error } = await supabase.from("erp_project_wbs").upsert(chunk, {
      onConflict: "project_id,milestone_name",
    })
    if (error) {
      return { ok: false, error: `erp_project_wbs: ${error.message}` }
    }
    upserted += chunk.length
  }

  const skipped = rawRows.length - payloads.length
  return { ok: true, upserted, skipped, warnings }
}
