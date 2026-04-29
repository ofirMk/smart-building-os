/**
 * Bulk import endpoint לפריטי מאסטר.
 *
 * זרם: client מעלה CSV → מנתח עם papaparse → שולח JSON של שורות תקינות לכאן.
 * השרת:
 *   1. מאמת קונטקסט חברה (RLS guard).
 *   2. מתרגם family_code → family_id (lookup פעם אחת לכל הקודים הייחודיים).
 *   3. מתרגם supplier_name/supplier_number → supplier_id (אותו דבר).
 *   4. מבצע insert לכל שורה ומחזיר תוצאה לכל שורה.
 *
 * אין טרנזקציה אטומית — partial success מותר. לקוח מקבל errors.csv ויכול
 * להעלות מחדש את השורות הכושלות.
 *
 * **FP-safe**: המחירים ושעורי ההמרה מועברים כ-string ל-Postgres `numeric`.
 */

import { type NextRequest, NextResponse } from "next/server"

import {
  requireMasterDataApiContext,
  sanitizeDecimalString,
  sanitizeOptionalString,
} from "@/lib/erp/master-data-api"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const ITEM_STATUSES = new Set(["ACTIVE", "INACTIVE", "PURCHASE_ONLY", "INTERNAL_ONLY", "OBSOLETE"])
const ITEM_TYPES = new Set(["R", "P", "S", "K"])

type RawRow = {
  rowIndex?: number
  sku?: unknown
  description?: unknown
  foreignDescription?: unknown
  familyCode?: unknown
  itemType?: unknown
  unitOfMeasure?: unknown
  factoryUom?: unknown
  conversionFactor?: unknown
  supplierName?: unknown
  supplierNumber?: unknown
  defaultPrice?: unknown
  isInventoryManaged?: unknown
  status?: unknown
}

type BulkBody = {
  rows?: RawRow[]
}

type RowOutcome =
  | { rowIndex: number; sku: string | null; status: "created"; itemId: string }
  | { rowIndex: number; sku: string | null; status: "error"; error: string }

const MAX_ROWS_PER_REQUEST = 500

function normalizeBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === "boolean") return value
  if (typeof value === "string") {
    const t = value.trim().toLowerCase()
    if (["true", "1", "yes", "y", "כן"].includes(t)) return true
    if (["false", "0", "no", "n", "לא"].includes(t)) return false
  }
  if (typeof value === "number") return value !== 0
  return fallback
}

export async function POST(req: NextRequest) {
  const gate = await requireMasterDataApiContext(req)
  if (!gate.ok) return gate.response
  const { supabase, activeCompanyId } = gate.ctx

  const body = (await req.json().catch(() => null)) as BulkBody | null
  const rows = Array.isArray(body?.rows) ? body!.rows : null
  if (!rows || rows.length === 0) {
    return NextResponse.json({ error: "rows is required and must be a non-empty array" }, { status: 400 })
  }
  if (rows.length > MAX_ROWS_PER_REQUEST) {
    return NextResponse.json(
      { error: `Too many rows in one request (max ${MAX_ROWS_PER_REQUEST}). Split the file.` },
      { status: 400 }
    )
  }

  // ── Step 1: גוללים את כל השורות, אוספים ערכים ייחודיים ל-lookups
  const familyCodes = new Set<string>()
  const supplierNumbers = new Set<string>()
  const supplierNames = new Set<string>()
  for (const r of rows) {
    const fc = sanitizeOptionalString(r.familyCode)
    if (fc) familyCodes.add(fc)
    const sn = sanitizeOptionalString(r.supplierNumber)
    if (sn) supplierNumbers.add(sn)
    const snm = sanitizeOptionalString(r.supplierName)
    if (snm) supplierNames.add(snm)
  }

  // ── Step 2: lookup batch של משפחות
  const familyMap = new Map<string, string>() // family_code → id
  if (familyCodes.size > 0) {
    const { data, error } = await supabase
      .from("erp_md_product_families")
      .select("id,family_code")
      .eq("company_id", activeCompanyId)
      .in("family_code", Array.from(familyCodes))
    if (error) {
      return NextResponse.json({ error: `Family lookup failed: ${error.message}` }, { status: 500 })
    }
    for (const f of data ?? []) {
      if (f.family_code) familyMap.set(f.family_code, f.id)
    }
  }

  // ── Step 3: lookup batch של ספקים (לפי number או name)
  const supplierByNumber = new Map<string, string>()
  const supplierByName = new Map<string, string>()
  if (supplierNumbers.size > 0 || supplierNames.size > 0) {
    let query = supabase
      .from("erp_md_suppliers")
      .select("id,name,supplier_number")
      .eq("company_id", activeCompanyId)
    const filters: string[] = []
    if (supplierNumbers.size > 0) {
      filters.push(`supplier_number.in.(${Array.from(supplierNumbers).map((s) => `"${s}"`).join(",")})`)
    }
    if (supplierNames.size > 0) {
      filters.push(`name.in.(${Array.from(supplierNames).map((s) => `"${s}"`).join(",")})`)
    }
    if (filters.length > 0) {
      query = query.or(filters.join(","))
      const { data, error } = await query
      if (error) {
        return NextResponse.json({ error: `Supplier lookup failed: ${error.message}` }, { status: 500 })
      }
      for (const s of data ?? []) {
        if (s.supplier_number) supplierByNumber.set(s.supplier_number, s.id)
        if (s.name) supplierByName.set(s.name, s.id)
      }
    }
  }

  // ── Step 4: insert לפי שורה
  const outcomes: RowOutcome[] = []
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]
    const idx = typeof r.rowIndex === "number" ? r.rowIndex : i
    const sku = sanitizeOptionalString(r.sku)
    const description = sanitizeOptionalString(r.description)
    const foreignDescription = sanitizeOptionalString(r.foreignDescription)
    const familyCode = sanitizeOptionalString(r.familyCode)
    const itemTypeRaw = sanitizeOptionalString(r.itemType)?.toUpperCase()
    const itemType = itemTypeRaw && ITEM_TYPES.has(itemTypeRaw) ? itemTypeRaw : "R"
    const uom = sanitizeOptionalString(r.unitOfMeasure)
    const factoryUom = sanitizeOptionalString(r.factoryUom)
    const conversionFactor =
      sanitizeDecimalString(r.conversionFactor, { maxDecimals: 4, minValueExclusive: 0 }) ?? "1"
    const supplierNumber = sanitizeOptionalString(r.supplierNumber)
    const supplierName = sanitizeOptionalString(r.supplierName)
    const defaultPrice = sanitizeDecimalString(r.defaultPrice, {
      maxDecimals: 4,
      minValueInclusive: 0,
    })
    const isInventoryManaged = normalizeBoolean(r.isInventoryManaged, true)
    const statusRaw = sanitizeOptionalString(r.status)?.toUpperCase()
    const status = statusRaw && ITEM_STATUSES.has(statusRaw) ? statusRaw : "ACTIVE"

    if (!sku || !description || !uom || !familyCode) {
      outcomes.push({
        rowIndex: idx,
        sku,
        status: "error",
        error: "missing required: sku, description, unitOfMeasure, familyCode",
      })
      continue
    }

    const productFamilyId = familyMap.get(familyCode)
    if (!productFamilyId) {
      outcomes.push({
        rowIndex: idx,
        sku,
        status: "error",
        error: `family_code "${familyCode}" not found in active company`,
      })
      continue
    }

    let preferredSupplierId: string | null = null
    if (supplierNumber) {
      preferredSupplierId = supplierByNumber.get(supplierNumber) ?? null
      if (!preferredSupplierId) {
        outcomes.push({
          rowIndex: idx,
          sku,
          status: "error",
          error: `supplier_number "${supplierNumber}" not found`,
        })
        continue
      }
    } else if (supplierName) {
      preferredSupplierId = supplierByName.get(supplierName) ?? null
      if (!preferredSupplierId) {
        outcomes.push({
          rowIndex: idx,
          sku,
          status: "error",
          error: `supplier_name "${supplierName}" not found`,
        })
        continue
      }
    }

    const insertResult = await supabase
      .from("erp_md_items")
      .insert({
        company_id: activeCompanyId,
        item_number: sku,
        description,
        foreign_description: foreignDescription,
        unit_of_measure: uom,
        product_family_id: productFamilyId,
        is_inventory_managed: isInventoryManaged,
        status,
        item_type: itemType,
        factory_uom: factoryUom ?? uom,
        conversion_factor: conversionFactor,
        preferred_supplier_id: preferredSupplierId,
        default_price: defaultPrice,
        legacy_default_price: defaultPrice,
        min_order_quantity: 1,
      })
      .select("id")
      .single()

    if (insertResult.error || !insertResult.data) {
      outcomes.push({
        rowIndex: idx,
        sku,
        status: "error",
        error: insertResult.error?.message ?? "insert failed",
      })
      continue
    }

    outcomes.push({
      rowIndex: idx,
      sku,
      status: "created",
      itemId: insertResult.data.id,
    })
  }

  const succeeded = outcomes.filter((o) => o.status === "created").length
  const failed = outcomes.filter((o) => o.status === "error").length
  return NextResponse.json({
    data: {
      totalProcessed: outcomes.length,
      succeeded,
      failed,
      outcomes,
    },
  })
}
