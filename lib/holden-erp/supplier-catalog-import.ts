import Papa from "papaparse"

import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role"

/** מחירון ברירת מחדל לייבוא קטלוג (Phase 7 — `erp_supplier_price_lists.price_list_code`) */
export const SUPPLIER_CATALOG_PRICE_LIST_CODE = "DEFAULT" as const

const DEFAULT_CURRENCY = "ILS"
const CHUNK = 200

/** כותרות אפשריות — כולל רווחים בסוף כמו בקובץ Erka */
const HEADER_INTERNAL_SKU = ["מקט", 'מק"ט', "Internal SKU", "SKU פנימי"]
const HEADER_SUPPLIER_SKU = ["מקט ספק", "מקט ספק ", "Supplier SKU", "מק״ט ספק"]
const HEADER_PRICE = ["מחיר", "מחיר ", "Price", "מחיר בסיס"]
const HEADER_DISCOUNT = ["הנחה", "הנחה ", "Discount", "הנחה %", "אחוז הנחה"]
const HEADER_UOM = ["יחידה", "יחידה ", "UOM", "יחידת מידה"]

export type SupplierCatalogImportResult =
  | {
      ok: true
      supplierItemsUpserted: number
      priceRowsWritten: number
      skipped: number
      warnings: string[]
    }
  | { ok: false; error: string }

function stripBom(text: string): string {
  if (text.charCodeAt(0) === 0xfeff) return text.slice(1)
  return text
}

export function normalizeCatalogHeaderKey(key: string): string {
  return stripBom(key).trim().replace(/\s+/g, " ")
}

function buildNormalizedAliasSet(aliases: string[]): Set<string> {
  return new Set(aliases.map((a) => normalizeCatalogHeaderKey(a)))
}

function getCellByAliases(
  row: Record<string, string>,
  aliases: string[]
): string {
  const want = buildNormalizedAliasSet(aliases)
  for (const [k, v] of Object.entries(row)) {
    if (want.has(normalizeCatalogHeaderKey(k))) {
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

/**
 * DB: `discount_pct` בין 0 ל-100 (אחוזים).
 * קבצי ERP לעיתים שולחים שבר עשרוני (0.735 = 73.5%).
 */
export function normalizeDiscountPercent(raw: string): number {
  const t = raw.trim()
  if (!t) return 0
  const n = parseDecimal(t)
  if (n < 0) return 0
  if (n > 100) return 100
  if (n > 0 && n < 1) {
    return Math.round(n * 10000) / 100
  }
  return Math.round(n * 100) / 100
}

type ParsedRow = {
  internal_sku: string
  supplier_sku: string
  price: number
  discount_pct: number
  uom_note: string
}

function parseRows(
  rows: Record<string, string>[],
  warnings: string[]
): ParsedRow[] {
  const out: ParsedRow[] = []
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    const internal_sku = getCellByAliases(row, HEADER_INTERNAL_SKU)
    if (!internal_sku) {
      warnings.push(`שורה ${i + 2}: חסר מקט פנימי — דולג`)
      continue
    }
    const supplier_sku = getCellByAliases(row, HEADER_SUPPLIER_SKU)
    const priceRaw = getCellByAliases(row, HEADER_PRICE)
    const discountRaw = getCellByAliases(row, HEADER_DISCOUNT)
    const uom = getCellByAliases(row, HEADER_UOM)

    const price = parseDecimal(priceRaw)
    const discount_pct = normalizeDiscountPercent(discountRaw)

    let uom_note = ""
    if (uom) {
      uom_note = `יחידה: ${uom}`
    }

    out.push({
      internal_sku,
      supplier_sku,
      price,
      discount_pct,
      uom_note,
    })
  }
  return out
}

function isUuid(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    s.trim()
  )
}

/**
 * ייבוא קטלוג מחירים לספק: `erp_supplier_items` + `erp_supplier_price_lists`.
 * דורש `SUPABASE_SERVICE_ROLE_KEY`. מקט פנימי חייב להופיע ב-`erp_items`.
 */
export async function parseAndUpsertSupplierCatalog(
  supplierId: string,
  csvContent: string
): Promise<SupplierCatalogImportResult> {
  const sid = supplierId?.trim()
  if (!sid || !isUuid(sid)) {
    return { ok: false, error: "supplierId לא תקין (נדרש UUID)" }
  }

  const text = stripBom(csvContent ?? "")
  if (!text.trim()) {
    return { ok: false, error: "קובץ ריק" }
  }

  const parsed = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (h) => normalizeCatalogHeaderKey(h),
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
  const parsedRows = parseRows(rawRows, warnings)
  if (!parsedRows.length) {
    return { ok: false, error: "אין שורות עם מקט פנימי תקין" }
  }

  const lastBySku = new Map<string, ParsedRow>()
  for (const r of parsedRows) {
    lastBySku.set(r.internal_sku, r)
  }
  const rows = [...lastBySku.values()]
  if (parsedRows.length > rows.length) {
    warnings.push(
      `הוסרו ${parsedRows.length - rows.length} שורות כפולות (אותו מקט פנימי — נשמרה השורה האחרונה)`
    )
  }

  const supabase = createSupabaseServiceRoleClient()

  const { data: entity, error: entErr } = await supabase
    .from("entities")
    .select("id, type, is_deleted")
    .eq("id", sid)
    .maybeSingle()

  if (entErr) {
    return { ok: false, error: entErr.message }
  }
  if (!entity || entity.is_deleted) {
    return { ok: false, error: "ספק לא נמצא" }
  }
  if (String(entity.type) !== "supplier") {
    return { ok: false, error: "הישות אינה מסוג supplier" }
  }

  const supplierItemPayloads = rows.map((r) => ({
    supplier_id: sid,
    internal_sku: r.internal_sku,
    supplier_sku: r.supplier_sku,
    supplier_item_description: r.uom_note,
  }))

  let supplierItemsUpserted = 0
  for (let i = 0; i < supplierItemPayloads.length; i += CHUNK) {
    const chunk = supplierItemPayloads.slice(i, i + CHUNK)
    const { error } = await supabase.from("erp_supplier_items").upsert(chunk, {
      onConflict: "supplier_id,internal_sku",
    })
    if (error) {
      return {
        ok: false,
        error: `erp_supplier_items: ${error.message}`,
      }
    }
    supplierItemsUpserted += chunk.length
  }

  const skus = [...new Set(rows.map((r) => r.internal_sku))]

  const { error: delErr } = await supabase
    .from("erp_supplier_price_lists")
    .delete()
    .eq("supplier_id", sid)
    .eq("price_list_code", SUPPLIER_CATALOG_PRICE_LIST_CODE)
    .in("item_sku", skus)

  if (delErr) {
    return { ok: false, error: `מחיקת מחירון קודם: ${delErr.message}` }
  }

  const today = new Date().toISOString().slice(0, 10)
  const pricePayloads = rows.map((r) => ({
    supplier_id: sid,
    price_list_code: SUPPLIER_CATALOG_PRICE_LIST_CODE,
    item_sku: r.internal_sku,
    price: r.price,
    currency_code: DEFAULT_CURRENCY,
    discount_pct: r.discount_pct,
    valid_from: today,
    valid_to: null as string | null,
  }))

  let priceRowsWritten = 0
  for (let i = 0; i < pricePayloads.length; i += CHUNK) {
    const chunk = pricePayloads.slice(i, i + CHUNK)
    const { error } = await supabase.from("erp_supplier_price_lists").insert(chunk)
    if (error) {
      return {
        ok: false,
        error: `erp_supplier_price_lists: ${error.message}`,
      }
    }
    priceRowsWritten += chunk.length
  }

  const skipped = rawRows.length - parsedRows.length

  return {
    ok: true,
    supplierItemsUpserted,
    priceRowsWritten,
    skipped,
    warnings,
  }
}
