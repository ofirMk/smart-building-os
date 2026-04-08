import Papa from "papaparse"

import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role"

/** ערכי ברירת מחדל ל-FK קיימים כשהקובץ לא מכיל עמודה */
export const ERP_ITEMS_IMPORT_DEFAULTS = {
  family_code: "GEN",
  uom_code: "EA",
  currency_code: "ILS",
  base_price: 0,
} as const

const UPSERT_CHUNK = 250

type ColumnDef = {
  field: keyof ErpItemUpsertPayload
  /** כותרות אפשריות בקובץ (עברית / אנגלית) */
  aliases: string[]
}

/** שורה ל-upsert ל-`erp_items` — כל השדות החובה + MDM אופציונליים */
export type ErpItemUpsertPayload = {
  sku: string
  description: string
  family_code: string
  uom_code: string
  base_price: number
  currency_code: string
  is_active: boolean
  status_he: string | null
  part_type: string | null
  is_inventory_managed: boolean | null
  abc_classification: string | null
  primary_supplier_sku: string | null
  standard_cost_ils: number | null
  lead_time_days: number | null
  default_warehouse: string | null
}

const COLUMN_DEFS: ColumnDef[] = [
  { field: "sku", aliases: ['מק"ט', "מקט", "SKU", "sku", "Item", "פריט"] },
  { field: "description", aliases: ["תיאור", "Description", "description", "שם פריט", "שם"] },
  { field: "uom_code", aliases: ["יחידת מידה", "UOM", "uom", "יחידה"] },
  { field: "family_code", aliases: ["משפחה", "Family", "family_code", "קוד משפחה"] },
  { field: "currency_code", aliases: ["מטבע", "Currency", "currency"] },
  { field: "base_price", aliases: ["מחיר בסיס", "Base price", "base_price", "מחיר"] },
  { field: "status_he", aliases: ["סטטוס", "Status", "status_he", "מצב"] },
  {
    field: "part_type",
    aliases: ["טיפוס P/R/O", "P/R/O", "part_type", "סוג פריט", "טיפוס"],
  },
  {
    field: "is_inventory_managed",
    aliases: ["ניהול מלאי", "Inventory Managed", "מנוהל במלאי", "Inventory"],
  },
  { field: "abc_classification", aliases: ["ABC", "abc", "סיווג ABC", "סיווג"] },
  {
    field: "primary_supplier_sku",
    aliases: ["ספק ברירת מחדל", "Default Supplier", "מקט ספק", "primary_supplier_sku"],
  },
  {
    field: "standard_cost_ils",
    aliases: ["עלות תקן שח", "עלות תקן", "Standard Cost", "standard_cost", "עלות תקן ₪"],
  },
  {
    field: "lead_time_days",
    aliases: ["זמן אספקה רכש", "זמן אספקה", "Lead time", "lead_time_days", "ימי אספקה"],
  },
  { field: "default_warehouse", aliases: ["מחסן", "Warehouse", "default_warehouse", "מחסן ברירת מחדל"] },
  { field: "is_active", aliases: ["פעיל", "Active flag", "is_active"] },
]

export type ItemsCsvImportResult =
  | {
      ok: true
      upserted: number
      skipped: number
      warnings: string[]
    }
  | { ok: false; error: string }

function stripBom(text: string): string {
  if (text.charCodeAt(0) === 0xfeff) return text.slice(1)
  return text
}

function normalizeHeaderKey(key: string): string {
  return stripBom(key).trim().replace(/\s+/g, " ")
}

/** מיפוי כותרת עמודה ראשונה לשם שדה פנימי */
function buildHeaderFieldMap(headers: string[]): Map<string, keyof ErpItemUpsertPayload> {
  const map = new Map<string, keyof ErpItemUpsertPayload>()
  const normHeaders = headers.map((h) => normalizeHeaderKey(h))

  for (let i = 0; i < normHeaders.length; i++) {
    const raw = headers[i] ?? ""
    const n = normHeaders[i] ?? ""
    for (const def of COLUMN_DEFS) {
      if (def.aliases.some((a) => a === n || a === raw.trim())) {
        if (!map.has(n)) map.set(n, def.field)
        break
      }
    }
  }
  return map
}

function cellValue(
  row: Record<string, string>,
  headers: string[],
  fieldMap: Map<string, keyof ErpItemUpsertPayload>,
  field: keyof ErpItemUpsertPayload
): string {
  for (const h of headers) {
    const nk = normalizeHeaderKey(h)
    if (fieldMap.get(nk) === field) {
      const v = row[h]
      if (v == null) continue
      const s = String(v).trim()
      if (s !== "") return s
    }
  }
  return ""
}

function parseBoolYN(s: string): boolean | null {
  const t = s.trim().toUpperCase()
  if (t === "Y" || t === "YES" || t === "כן" || t === "1" || t === "TRUE") return true
  if (t === "N" || t === "NO" || t === "לא" || t === "0" || t === "FALSE") return false
  return null
}

function parsePartType(s: string): string | null {
  const c = s.trim().toUpperCase().charAt(0)
  if (c === "P" || c === "R" || c === "O") return c
  return null
}

function parseAbc(s: string): string | null {
  const c = s.trim().toUpperCase().charAt(0)
  if (c === "A" || c === "B" || c === "C") return c
  return null
}

/** מספרים עם פסיקים כמפריד אלפים או עשרוני (EU) */
function parseNumeric(s: string): number | null {
  const t = s.trim().replace(/\s/g, "")
  if (!t) return null
  const lastComma = t.lastIndexOf(",")
  const lastDot = t.lastIndexOf(".")
  let normalized = t
  if (lastComma > lastDot) {
    normalized = t.replace(/\./g, "").replace(",", ".")
  } else {
    normalized = t.replace(/,/g, "")
  }
  const n = Number(normalized)
  return Number.isFinite(n) ? n : null
}

function parseIntSafe(s: string): number | null {
  const t = s.trim()
  if (!t) return null
  const n = parseInt(t.replace(/[^\d-]/g, ""), 10)
  return Number.isFinite(n) ? n : null
}

function deriveIsActive(statusHe: string, explicit: string): boolean {
  if (explicit) {
    const b = parseBoolYN(explicit)
    if (b !== null) return b
  }
  const s = statusHe.trim().toLowerCase()
  if (s.includes("פעיל") || s === "active" || s === "y" || s === "yes") return true
  if (s.includes("לא פעיל") || s === "inactive" || s === "n" || s === "no") return false
  return true
}

function csvRowToPayload(
  row: Record<string, string>,
  headers: string[],
  fieldMap: Map<string, keyof ErpItemUpsertPayload>,
  rowIndex: number,
  warnings: string[]
): ErpItemUpsertPayload | null {
  const sku = cellValue(row, headers, fieldMap, "sku")
  if (!sku) {
    warnings.push(`שורה ${rowIndex + 2}: חסר מק״ט — דולג`)
    return null
  }

  const description =
    cellValue(row, headers, fieldMap, "description") || sku
  const uomRaw = cellValue(row, headers, fieldMap, "uom_code")
  const familyRaw = cellValue(row, headers, fieldMap, "family_code")
  const currencyRaw = cellValue(row, headers, fieldMap, "currency_code")
  const basePriceRaw = cellValue(row, headers, fieldMap, "base_price")
  const statusHeRaw = cellValue(row, headers, fieldMap, "status_he")
  const partTypeRaw = cellValue(row, headers, fieldMap, "part_type")
  const invRaw = cellValue(row, headers, fieldMap, "is_inventory_managed")
  const abcRaw = cellValue(row, headers, fieldMap, "abc_classification")
  const primarySkuRaw = cellValue(row, headers, fieldMap, "primary_supplier_sku")
  const stdCostRaw = cellValue(row, headers, fieldMap, "standard_cost_ils")
  const leadRaw = cellValue(row, headers, fieldMap, "lead_time_days")
  const whRaw = cellValue(row, headers, fieldMap, "default_warehouse")
  const activeRaw = cellValue(row, headers, fieldMap, "is_active")

  const base_price =
    basePriceRaw ? parseNumeric(basePriceRaw) ?? ERP_ITEMS_IMPORT_DEFAULTS.base_price : ERP_ITEMS_IMPORT_DEFAULTS.base_price

  const standard_cost_ils = stdCostRaw ? parseNumeric(stdCostRaw) : null
  const lead_time_days = leadRaw ? parseIntSafe(leadRaw) : null

  let is_inventory_managed: boolean | null = null
  if (invRaw) is_inventory_managed = parseBoolYN(invRaw)

  const payload: ErpItemUpsertPayload = {
    sku,
    description,
    family_code: familyRaw || ERP_ITEMS_IMPORT_DEFAULTS.family_code,
    uom_code: uomRaw || ERP_ITEMS_IMPORT_DEFAULTS.uom_code,
    base_price,
    currency_code: (currencyRaw || ERP_ITEMS_IMPORT_DEFAULTS.currency_code).toUpperCase().slice(0, 8),
    is_active: deriveIsActive(statusHeRaw, activeRaw),
    status_he: statusHeRaw || null,
    part_type: partTypeRaw ? parsePartType(partTypeRaw) : null,
    is_inventory_managed,
    abc_classification: abcRaw ? parseAbc(abcRaw) : null,
    primary_supplier_sku: primarySkuRaw || null,
    standard_cost_ils,
    lead_time_days,
    default_warehouse: whRaw || null,
  }

  if (partTypeRaw && !payload.part_type) {
    warnings.push(`שורה ${rowIndex + 2} (${sku}): טיפוס לא מזוהה "${partTypeRaw}" — יישמר null`)
  }
  if (abcRaw && !payload.abc_classification) {
    warnings.push(`שורה ${rowIndex + 2} (${sku}): ABC לא מזוהה "${abcRaw}" — יישמר null`)
  }

  return payload
}

/**
 * קורא CSV מוצרים (כותרות בעברית או באנגלית), ממפה לשדות `erp_items`, ומבצע upsert לפי `sku`.
 * דורש `SUPABASE_SERVICE_ROLE_KEY` (עוקף RLS).
 */
export async function parseAndUpsertItemsCsv(csvContent: string): Promise<ItemsCsvImportResult> {
  const text = stripBom(csvContent ?? "")
  if (!text.trim()) {
    return { ok: false, error: "קובץ ריק" }
  }

  const parsed = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (h) => normalizeHeaderKey(h),
  })

  if (parsed.errors?.length) {
    const fatal = parsed.errors.find((e) => e.type === "Quotes" || e.type === "FieldMismatch")
    if (fatal) {
      return { ok: false, error: `שגיאת CSV: ${fatal.message}` }
    }
  }

  const rows = parsed.data?.filter((r) => Object.values(r).some((v) => String(v ?? "").trim() !== "")) ?? []
  const headers = parsed.meta.fields?.map((h) => normalizeHeaderKey(h ?? "")) ?? []
  if (!headers.length || !rows.length) {
    return { ok: false, error: "לא נמצאו כותרות או שורות נתונים" }
  }

  const fieldMap = buildHeaderFieldMap(parsed.meta.fields ?? [])
  if (![...fieldMap.values()].includes("sku")) {
    return {
      ok: false,
      error: 'חובה עמודת מק״ט (למשל "מק״ט" או SKU)',
    }
  }

  const warnings: string[] = []
  const payloads: ErpItemUpsertPayload[] = []
  let skipped = 0

  for (let i = 0; i < rows.length; i++) {
    const p = csvRowToPayload(rows[i], parsed.meta.fields ?? [], fieldMap, i, warnings)
    if (p) payloads.push(p)
    else skipped++
  }

  if (!payloads.length) {
    return { ok: false, error: "אין שורות תקינות לייבוא" }
  }

  const supabase = createSupabaseServiceRoleClient()
  let upserted = 0

  for (let i = 0; i < payloads.length; i += UPSERT_CHUNK) {
    const chunk = payloads.slice(i, i + UPSERT_CHUNK)
    const { error } = await supabase.from("erp_items").upsert(chunk, {
      onConflict: "sku",
    })
    if (error) {
      return {
        ok: false,
        error: error.message || String(error),
      }
    }
    upserted += chunk.length
  }

  return { ok: true, upserted, skipped, warnings }
}
