"use server"

import { revalidatePath } from "next/cache"
import { cookies } from "next/headers"

import { COMPANY_COOKIE_KEY, resolveCompanyContext } from "@/lib/company-context"
import { normalizeProcurementCategory } from "@/lib/marker-ofek/procurement-categories"
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role"
import { createSupabaseServerAuthClient } from "@/lib/supabase/server-auth"

export type OcrImportSaveMetadata = {
  document_type?: string | null
  document_date?: string | null
  supplier_name?: string | null
}

export type SaveOcrImportLineInput = {
  makat?: string | null
  original_name: string
  normalized_name: string
  quantity: number
  unit_of_measure: string
  unit_price: number
  total_line_price: number
  category_name: string
  additional_attributes?: Record<string, string | number | boolean | null>
}

export type CopilotIssueType =
  | "missing_category"
  | "new_master_item"
  | "categories_unavailable"

export type CopilotItemSnapshot = {
  makat: string | null
  original_name: string
  normalized_name: string
  category_name_suggested: string
  quantity: number
  unit_of_measure: string
}

export type SaveRequiresHumanResolution = {
  status: "requires_human_resolution"
  issueType: CopilotIssueType
  lineIndex: number
  item: CopilotItemSnapshot
  suggestedFix: string
  knownCategoryNames?: string[]
}

export type SaveOcrImportResult =
  | {
      ok: true
      importId: string
      needsAdminLineCount?: number
      invoicesSaved: number
      newItemsAdded: number
      pricesUpdated: number
      newItemCreationRequiredCount?: number
    }
  | { ok: false; error: string }
  | SaveRequiresHumanResolution

export type CategoryLineResolution = {
  lineIndex: number
  categoryName: string
}

type SupabaseServer = Awaited<
  ReturnType<typeof createSupabaseServerAuthClient>
>

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100
}

/** ערכי מצג מה-API (למשל "—") לא נחשבים תוכן אמיתי */
function stripDisplayPlaceholder(value: string): string {
  const t = value.trim()
  if (t === "—" || t === "-" || t === "–") return ""
  return t
}

function parseIssueDateForDb(
  value: string | null | undefined
): string | null {
  if (!value?.trim()) return null
  const d = new Date(value.trim())
  if (Number.isNaN(d.getTime())) return null
  return d.toISOString().slice(0, 10)
}

function isUniqueViolation(err: { code?: string; message?: string }): boolean {
  return err.code === "23505"
}

async function resolveActiveCompanyId(): Promise<string> {
  const cookieStore = await cookies()
  const companyId = resolveCompanyContext(cookieStore.get(COMPANY_COOKIE_KEY)?.value)
  if (!companyId) {
    throw new Error("Missing active company context")
  }
  return companyId
}

function toOcrTokens(values: Array<string | null | undefined>): string[] {
  return Array.from(
    new Set(
      values
        .map((value) => String(value ?? "").trim())
        .filter((value) => value.length > 0)
    )
  )
}

const FALLBACK_SKU_PREFIX = "GEN"

/** מק״ט זמני לשורות שממתינות לסיווג אדמין (עובד ללא הרשאת קטלוג) */
const TEMP_IMPORT_MAKAT_PREFIX = "TEMP-IMPORT-PENDING"

type MoCategoryRow = { id: string; prefix: string; name: string }

function categoryOverrideForLine(
  resolutions: CategoryLineResolution[] | undefined,
  lineIndex: number
): string | undefined {
  const hit = resolutions?.find((r) => r.lineIndex === lineIndex)
  const n = hit?.categoryName?.trim()
  return n || undefined
}

function buildCopilotItemSnapshot(
  row: SaveOcrImportLineInput,
  makat: string,
  original_name: string,
  normalized_name: string,
  categoryLabel: string
): CopilotItemSnapshot {
  return {
    makat: makat || null,
    original_name,
    normalized_name,
    category_name_suggested: categoryLabel,
    quantity: row.quantity,
    unit_of_measure: row.unit_of_measure,
  }
}

/**
 * ללא fallback שקט — אם אין התאמה, מחזירים missing_category ל-Copilot.
 */
async function resolveCategoryStrict(
  supabase: SupabaseServer,
  categoryName: string
): Promise<
  | { type: "ok"; categoryId: string; skuPrefix: string }
  | {
      type: "missing_category"
      safeCategoryName: string
      normalizedLabel: string
      knownNames: string[]
    }
  | { type: "categories_unavailable"; message: string }
> {
  const safeCategoryName = (categoryName ?? "").trim() || "שונות"
  const normalizedLabel = normalizeProcurementCategory(safeCategoryName)

  const { data: rows, error } = await supabase
    .from("mo_categories")
    .select("id, prefix, name")

  if (error) {
    console.warn("[ai-import] mo_categories query failed", {
      message: error.message,
      safeCategoryName,
    })
    return {
      type: "categories_unavailable",
      message: error.message,
    }
  }

  const list = (rows ?? []) as MoCategoryRow[]

  if (list.length === 0) {
    console.warn("[ai-import] mo_categories is empty", { safeCategoryName })
    return {
      type: "categories_unavailable",
      message: "טבלת mo_categories ריקה — הריצו marker_ofek_shadow_catalog.sql",
    }
  }

  const matched =
    list.find((r) => r.name.trim() === safeCategoryName) ??
    list.find((r) => r.name.trim() === normalizedLabel) ??
    null

  if (matched) {
    const skuPrefix =
      (matched.prefix && String(matched.prefix).trim()) || FALLBACK_SKU_PREFIX
    return {
      type: "ok",
      categoryId: matched.id,
      skuPrefix,
    }
  }

  console.warn("[ai-import] category mismatch — requires human resolution", {
    safeCategoryName,
    normalizedLabel,
    knownNames: list.map((r) => r.name),
  })

  return {
    type: "missing_category",
    safeCategoryName,
    normalizedLabel,
    knownNames: list.map((r) => r.name),
  }
}

async function allocateNextSku(
  supabase: SupabaseServer,
  categoryId: string,
  prefix: string
): Promise<string> {
  const { data: rows, error } = await supabase
    .from("mo_master_catalog")
    .select("sku")
    .eq("category_id", categoryId)

  if (error) {
    throw new Error(`ספירת SKU: ${error.message}`)
  }

  const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const re = new RegExp(`^${escaped}-(\\d+)$`)
  let max = 0
  for (const row of rows ?? []) {
    const sku = String((row as { sku?: string }).sku ?? "")
    const m = re.exec(sku)
    if (m) max = Math.max(max, parseInt(m[1], 10))
  }
  return `${prefix}-${String(max + 1).padStart(5, "0")}`
}

async function insertMasterWithRetries(
  supabase: SupabaseServer,
  categoryId: string,
  prefix: string,
  normalizedName: string
): Promise<string> {
  for (let attempt = 0; attempt < 8; attempt++) {
    const { data: existing, error: exErr } = await supabase
      .from("mo_master_catalog")
      .select("id")
      .eq("normalized_name", normalizedName)
      .maybeSingle()

    if (exErr) {
      throw new Error(exErr.message)
    }
    if (existing && typeof (existing as { id?: string }).id === "string") {
      return (existing as { id: string }).id
    }

    const sku = await allocateNextSku(supabase, categoryId, prefix)
    const { data: ins, error: insErr } = await supabase
      .from("mo_master_catalog")
      .insert({
        category_id: categoryId,
        sku,
        normalized_name: normalizedName,
      })
      .select("id")
      .single()

    if (!insErr && ins && typeof (ins as { id?: string }).id === "string") {
      return (ins as { id: string }).id
    }

    if (insErr && isUniqueViolation(insErr)) {
      continue
    }
    throw new Error(insErr?.message ?? "יצירת פריט מאסטר נכשלה")
  }
  throw new Error("לא ניתן להקצות SKU ייחודי אחרי ניסיונות חוזרים")
}

async function resolveMasterItemIdForLine(
  supabase: SupabaseServer,
  ctx: {
    lineIndex: number
    row: SaveOcrImportLineInput
    supplierName: string
    makatKey: string
    normalizedName: string
    displayOriginal: string
    displayNormalized: string
    effectiveCategoryName: string
    baseCategoryLabel: string
  },
  gates: {
    /** רק אדמין: Copilot, יצירת מאסטר, קטגוריות, קישור חדש ל-mo_supplier_catalog */
    isAdmin: boolean
    confirmNewMasterForLineIndices?: number[]
  }
): Promise<
  | { ok: true; masterItemId: string; createdNewMaster: boolean }
  | { ok: false; copilot: SaveRequiresHumanResolution }
  | { ok: false; deferForAdmin: true }
> {
  const {
    lineIndex,
    row,
    supplierName,
    makatKey,
    normalizedName,
    displayOriginal,
    displayNormalized,
    effectiveCategoryName,
    baseCategoryLabel,
  } = ctx

  const snap = () =>
    buildCopilotItemSnapshot(
      row,
      makatKey,
      displayOriginal,
      displayNormalized,
      baseCategoryLabel
    )

  if (supplierName && makatKey) {
    const { data: sc, error: scErr } = await supabase
      .from("mo_supplier_catalog")
      .select("master_item_id")
      .eq("supplier_name", supplierName)
      .eq("supplier_makat", makatKey)
      .maybeSingle()

    if (scErr) {
      throw new Error(`קטלוג ספק: ${scErr.message}`)
    }
    if (sc && typeof (sc as { master_item_id?: string }).master_item_id === "string") {
      return {
        ok: true,
        masterItemId: (sc as { master_item_id: string }).master_item_id,
        createdNewMaster: false,
      }
    }
  }

  const { data: master, error: mErr } = await supabase
    .from("mo_master_catalog")
    .select("id")
    .eq("normalized_name", normalizedName)
    .maybeSingle()

  if (mErr) {
    throw new Error(`חיפוש מאסטר: ${mErr.message}`)
  }

  if (master && typeof (master as { id?: string }).id === "string") {
    const mid = (master as { id: string }).id
    if (gates.isAdmin && supplierName && makatKey) {
      const { error: linkErr } = await supabase
        .from("mo_supplier_catalog")
        .insert({
          supplier_name: supplierName,
          supplier_makat: makatKey,
          master_item_id: mid,
        })
      if (linkErr && !isUniqueViolation(linkErr)) {
        throw new Error(`קישור ספק-מאסטר: ${linkErr.message}`)
      }
    }
    return { ok: true, masterItemId: mid, createdNewMaster: false }
  }

  if (!gates.isAdmin) {
    return { ok: false, deferForAdmin: true }
  }

  const catRes = await resolveCategoryStrict(supabase, effectiveCategoryName)

  if (catRes.type === "categories_unavailable") {
    return {
      ok: false,
      copilot: {
        status: "requires_human_resolution",
        issueType: "categories_unavailable",
        lineIndex,
        item: snap(),
        suggestedFix: catRes.message,
      },
    }
  }

  if (catRes.type === "missing_category") {
    return {
      ok: false,
      copilot: {
        status: "requires_human_resolution",
        issueType: "missing_category",
        lineIndex,
        item: snap(),
        suggestedFix:
          "בחרו סיווג תחת «שונות» או הגדירו קטגוריה חדשה במסד, ואז נמשיך בשמירה.",
        knownCategoryNames: catRes.knownNames,
      },
    }
  }

  if (!gates.confirmNewMasterForLineIndices?.includes(lineIndex)) {
    return {
      ok: false,
      copilot: {
        status: "requires_human_resolution",
        issueType: "new_master_item",
        lineIndex,
        item: snap(),
        suggestedFix:
          "לאחר אישורכם ניווצר פריט מאסטר חדש בקטלוג (מק״ט פנימי רציף) וייקשר למק״ט הספק.",
      },
    }
  }

  const newId = await insertMasterWithRetries(
    supabase,
    catRes.categoryId,
    catRes.skuPrefix,
    normalizedName
  )

  if (supplierName && makatKey) {
    const { error: linkErr } = await supabase
      .from("mo_supplier_catalog")
      .insert({
        supplier_name: supplierName,
        supplier_makat: makatKey,
        master_item_id: newId,
      })
    if (linkErr && !isUniqueViolation(linkErr)) {
      throw new Error(`קישור ספק-מאסטר: ${linkErr.message}`)
    }
  }

  return { ok: true, masterItemId: newId, createdNewMaster: true }
}

const CATEGORY_PREFIX_RE = /^[A-Z0-9]{2,8}$/

/**
 * יוצר קטגוריה ב-mo_categories (אדמין). לשימוש ה-Copilot אחרי אישור משתמש.
 */
export async function createProcurementCategory(input: {
  name: string
  prefix: string
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const name = String(input.name ?? "").trim()
  const prefix = String(input.prefix ?? "").trim().toUpperCase()

  if (name.length < 2) {
    return { ok: false, error: "שם קטגוריה קצר מדי" }
  }
  if (!CATEGORY_PREFIX_RE.test(prefix)) {
    return {
      ok: false,
      error: "קידומת חייבת להיות 2–8 תווים באנגלית או ספרות (A–Z, 0–9)",
    }
  }

  try {
    const supabase = await createSupabaseServerAuthClient()
    const companyId = await resolveActiveCompanyId()
    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser()

    if (userErr || !user) {
      return { ok: false, error: "נדרשת התחברות" }
    }

    const { data: profile, error: profileErr } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle()

    if (profileErr) {
      return { ok: false, error: profileErr.message }
    }

    if ((profile as { role?: string } | null)?.role !== "admin") {
      return { ok: false, error: "רק מנהל מערכת יכול ליצור קטגוריה" }
    }

    const { data: maxRow } = await supabase
      .from("mo_categories")
      .select("sort_order")
      .order("sort_order", { ascending: false })
      .limit(1)
      .maybeSingle()

    const nextSort =
      typeof (maxRow as { sort_order?: number } | null)?.sort_order === "number"
        ? (maxRow as { sort_order: number }).sort_order + 1
        : 100

    const { error: insErr } = await supabase.from("mo_categories").insert({
      name,
      prefix,
      sort_order: nextSort,
    })

    if (insErr) {
      if (isUniqueViolation(insErr)) {
        return { ok: false, error: "קטגוריה או קידומת כבר קיימים במסד" }
      }
      return { ok: false, error: insErr.message }
    }

    revalidatePath("/marker-ofek/procurement")
    revalidatePath("/marker-ofek/procurement/ai-import")
    return { ok: true }
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    }
  }
}

export async function listMarkerOfekProjectsForImport(): Promise<
  | {
      ok: true
      projects: Array<{
        id: string
        name: string
        internal_project_code: string
      }>
    }
  | { ok: false; error: string }
> {
  try {
    const supabase = await createSupabaseServerAuthClient()
    const companyId = await resolveActiveCompanyId()
    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser()

    if (userErr || !user) {
      return { ok: false, error: "נדרשת התחברות" }
    }

    const { data, error } = await supabase
      .from("projects")
      .select("id, name, internal_project_code")
      .order("name")

    if (error) {
      return { ok: false, error: error.message }
    }

    return {
      ok: true,
      projects: (data ?? []) as Array<{
        id: string
        name: string
        internal_project_code: string
      }>,
    }
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    }
  }
}

/**
 * שומר קליטת מסמך + בונה Shadow Catalog (מאסטר + מיפוי ספק).
 * כיווני עתיד ERP+AI (קטלוג מאסטר, סוכנים, API): `lib/marker-ofek/erp-evolution-insights.ts`.
 */
export async function saveSupplierInvoiceOcrImport(input: {
  metadata: OcrImportSaveMetadata
  document_title: string
  profit_center_id?: string | null
  project_name?: string | null
  direct_project_purchase?: boolean
  currency?: string | null
  lines: SaveOcrImportLineInput[]
  /** החלטות Copilot מצטברות בין ניסיונות שמירה */
  categoryLineResolutions?: CategoryLineResolution[]
  confirmNewMasterForLineIndices?: number[]
}): Promise<SaveOcrImportResult> {
  const lines = input.lines ?? []
  if (lines.length === 0) {
    return { ok: false, error: "אין שורות לשמירה" }
  }

  const titleTrim = String(input.document_title ?? "").trim()
  if (!titleTrim) {
    return { ok: false, error: "חסר כותרת מסמך" }
  }

  try {
    const supabase = await createSupabaseServerAuthClient()
    const companyId = await resolveActiveCompanyId()
    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser()

    if (userErr || !user) {
      return { ok: false, error: "נדרשת התחברות לשמירה" }
    }

    const { data: profile, error: profileErr } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle()

    if (profileErr) {
      return { ok: false, error: profileErr.message }
    }

    const role = (profile as { role?: string } | null)?.role
    /**
     * RBAC: אדמין — Copilot + יצירת מאסטר/קטגוריה.
     * property_manager — שמירת קליטה בלבד; שורות ללא מאסטר ידוע → needs_admin_classification.
     */
    const isAdmin = role === "admin"
    const canSaveImport = isAdmin || role === "property_manager"
    if (!canSaveImport) {
      return {
        ok: false,
        error: "אין הרשאה לשמירת קליטת מסמך AI",
      }
    }

    const categoryLineResolutions = isAdmin
      ? input.categoryLineResolutions
      : undefined
    const confirmNewMasterForLineIndices = isAdmin
      ? input.confirmNewMasterForLineIndices
      : undefined

    const meta = input.metadata ?? {}
    const supplierForCatalog = stripDisplayPlaceholder(
      String(meta.supplier_name ?? "")
    )
    if (!supplierForCatalog) {
      return {
        ok: false,
        error: "חסר שם ספק — נדרש לשיוך Shadow Catalog",
      }
    }

    let subtotal = 0
    let needsAdminLineCount = 0
    let newItemsAdded = 0
    let pricesUpdated = 0
    let newItemCreationRequiredCount = 0
    const serviceRole = createSupabaseServiceRoleClient()
    const lineRows: Array<{
      line_index: number
      name: string
      makat: string | null
      original_name: string | null
      normalized_name: string | null
      unit_of_measure: string
      quantity: number
      unit_price: number
      line_total: number
      additional_attributes: Record<string, string | number | boolean | null>
      master_item_id: string | null
      category_name: string
      needs_admin_classification: boolean
    }> = []

    for (let i = 0; i < lines.length; i++) {
      const row = lines[i]
      const original_name = stripDisplayPlaceholder(
        String(row.original_name ?? "")
      )
      const normalized_name = stripDisplayPlaceholder(
        String(row.normalized_name ?? "")
      )
      const makat = stripDisplayPlaceholder(String(row.makat ?? ""))
      const name = normalized_name || original_name || makat
      if (!name) {
        return { ok: false, error: `שורה ${i + 1}: חסר תיאור פריט` }
      }

      const qty = Number(row.quantity)
      const unit = Number(row.unit_price)
      let lineTotal = Number(row.total_line_price)
      if (!Number.isFinite(qty) || qty < 0) {
        return { ok: false, error: `שורה ${i + 1}: כמות לא תקינה` }
      }
      if (!Number.isFinite(unit) || unit < 0) {
        return { ok: false, error: `שורה ${i + 1}: מחיר ליחידה לא תקין` }
      }
      if (!Number.isFinite(lineTotal) || lineTotal < 0) {
        lineTotal = roundMoney(qty * unit)
      } else {
        lineTotal = roundMoney(lineTotal)
        const expected = roundMoney(qty * unit)
        if (qty > 0 && Math.abs(lineTotal - expected) > 0.05) {
          lineTotal = expected
        }
      }
      if (qty === 0) lineTotal = 0

      const uom = String(row.unit_of_measure ?? "יח").trim() || "יח"
      const category_name = normalizeProcurementCategory(row.category_name)
      const effectiveCategoryName =
        categoryOverrideForLine(categoryLineResolutions, i) ?? category_name

      let master_item_id: string | null = null
      try {
        const resolved = await resolveMasterItemIdForLine(
          supabase,
          {
            lineIndex: i,
            row,
            supplierName: supplierForCatalog,
            makatKey: makat,
            normalizedName: normalized_name || name,
            displayOriginal: original_name,
            displayNormalized: normalized_name,
            effectiveCategoryName,
            baseCategoryLabel: category_name,
          },
          {
            isAdmin,
            confirmNewMasterForLineIndices,
          }
        )
        if (!resolved.ok) {
          if ("copilot" in resolved) {
            return resolved.copilot
          }
          needsAdminLineCount += 1
          const tempMakat =
            makat ||
            `${TEMP_IMPORT_MAKAT_PREFIX}-${String(i + 1).padStart(4, "0")}`
          subtotal += lineTotal
          lineRows.push({
            line_index: i,
            name,
            makat: tempMakat,
            original_name: original_name || null,
            normalized_name: normalized_name || null,
            unit_of_measure: uom,
            quantity: qty,
            unit_price: roundMoney(unit),
            line_total: lineTotal,
            additional_attributes: row.additional_attributes ?? {},
            master_item_id: null,
            category_name: effectiveCategoryName,
            needs_admin_classification: true,
          })
          continue
        }
        master_item_id = resolved.masterItemId
        if (resolved.createdNewMaster) {
          newItemsAdded += 1
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        return {
          ok: false,
          error: `שורה ${i + 1} (קטלוג): ${msg}`,
        }
      }

      subtotal += lineTotal
      lineRows.push({
        line_index: i,
        name,
        makat: makat || null,
        original_name: original_name || null,
        normalized_name: normalized_name || null,
        unit_of_measure: uom,
        quantity: qty,
        unit_price: roundMoney(unit),
        line_total: lineTotal,
        additional_attributes: row.additional_attributes ?? {},
        master_item_id,
        category_name: effectiveCategoryName,
        needs_admin_classification: false,
      })
      if (master_item_id) {
        pricesUpdated += 1
      }

      // Data integrity gate (erp_md_items): always check supplier SKU against canonical catalog.
      const supplierSku = makat
      const catalogName = normalized_name || original_name || name
      let matchedCatalogId: string | null = null
      if (supplierSku) {
        const bySku = await serviceRole
          .from("erp_md_items")
          .select("id, ai_metadata, ocr_match_tokens")
          .eq("company_id", companyId)
          .or(`item_number.eq.${supplierSku},internal_sku.eq.${supplierSku}`)
          .limit(1)
          .maybeSingle()
        if (!bySku.error && bySku.data?.id) {
          matchedCatalogId = String(bySku.data.id)
        }
      }
      if (!matchedCatalogId && catalogName) {
        const byName = await serviceRole
          .from("erp_md_items")
          .select("id, ai_metadata, ocr_match_tokens")
          .eq("company_id", companyId)
          .ilike("description", catalogName)
          .limit(1)
          .maybeSingle()
        if (!byName.error && byName.data?.id) {
          matchedCatalogId = String(byName.data.id)
        }
      }
      if (matchedCatalogId) {
        const current = await serviceRole
          .from("erp_md_items")
          .select("ai_metadata")
          .eq("company_id", companyId)
          .eq("id", matchedCatalogId)
          .maybeSingle()
        const attrs =
          ((current.data as { ai_metadata?: Record<string, unknown> } | null)
            ?.ai_metadata as Record<string, unknown> | undefined) ?? {}
        await serviceRole
          .from("erp_md_items")
          .update({
            legacy_default_price: roundMoney(unit),
            legacy_last_price: roundMoney(unit),
            ai_metadata: {
              ...attrs,
              supplier_sku: supplierSku || attrs.supplier_sku || null,
              last_purchase_price: roundMoney(unit),
              last_purchase_date:
                parseIssueDateForDb(meta.document_date ?? undefined) ??
                new Date().toISOString().slice(0, 10),
            },
            ocr_match_tokens: toOcrTokens([catalogName, supplierSku, supplierForCatalog]),
          })
          .eq("company_id", companyId)
          .eq("id", matchedCatalogId)
      } else {
        newItemCreationRequiredCount += 1
      }
    }

    subtotal = roundMoney(subtotal)

    const docType = String(meta.document_type ?? "").trim() || null
    const projectName = String(input.project_name ?? "").trim() || null
    const profitCenterId = String(input.profit_center_id ?? "").trim() || null
    const directProjectPurchase = Boolean(input.direct_project_purchase)
    if (!profitCenterId) {
      return { ok: false, error: "שיוך לפרויקט / מרכז רווח הוא שדה חובה" }
    }
    const { data: project, error: projectErr } = await serviceRole
      .from("projects")
      .select("id")
      .eq("id", profitCenterId)
      .eq("is_deleted", false)
      .maybeSingle()
    if (projectErr || !project?.id) {
      return { ok: false, error: "פרויקט / מרכז רווח לא נמצא" }
    }

    const supplierHit = await serviceRole
      .from("entities")
      .select("id")
      .eq("type", "supplier")
      .eq("is_deleted", false)
      .ilike("name", supplierForCatalog)
      .maybeSingle()
    if (supplierHit.error || !supplierHit.data?.id) {
      const created = await serviceRole
        .from("entities")
        .insert({
          name: supplierForCatalog,
          type: "supplier",
          contact_info: {},
          is_deleted: false,
        })
        .select("id")
        .single()
      if (created.error) {
        return { ok: false, error: created.error.message }
      }
    }

    const { data: header, error: insertHeaderErr } = await supabase
      .from("mo_supplier_invoice_imports")
      .insert({
        supplier_name: supplierForCatalog,
        supplier_invoice_number: null,
        issue_date: parseIssueDateForDb(meta.document_date ?? undefined),
        currency: (input.currency?.trim() || "ILS").slice(0, 8),
        subtotal,
        source: "ai_ocr",
        notes: null,
        created_by: user.id,
        document_type: docType,
        document_title: titleTrim,
        profit_center_id: profitCenterId,
        allocation_status: profitCenterId ? "allocated" : "pending",
        cost_update_applied: false,
        project_name: projectName,
      })
      .select("id")
      .single()

    if (insertHeaderErr || !header) {
      return {
        ok: false,
        error:
          insertHeaderErr?.message ??
          "שמירת כותרת המסמך נכשלה (בדקו שהורצה marker_ofek_shadow_catalog.sql)",
      }
    }

    const importId = (header as { id: string }).id

    const { error: linesErr } = await supabase
      .from("mo_supplier_invoice_import_lines")
      .insert(
        lineRows.map((r) => ({
          import_id: importId,
          line_index: r.line_index,
          name: r.name,
          makat: r.makat,
          original_name: r.original_name,
          normalized_name: r.normalized_name,
          unit_of_measure: r.unit_of_measure,
          quantity: r.quantity,
          unit_price: r.unit_price,
          line_total: r.line_total,
          additional_attributes: r.additional_attributes,
          master_item_id: r.master_item_id,
          category_name: r.category_name,
          needs_admin_classification: r.needs_admin_classification,
        }))
      )

    if (linesErr) {
      await supabase
        .from("mo_supplier_invoice_imports")
        .delete()
        .eq("id", importId)
      return {
        ok: false,
        error:
          linesErr.message ||
          "שמירת שורות נכשלה (בדקו עמודות master_item_id / category_name)",
      }
    }

    // Optional PO matching unblock: direct project purchase is stored as invoice with po_id=null.
    const invoiceHeaderInsert = await serviceRole
      .from("supplier_invoices")
      .insert({
        po_id: null,
        project_id: profitCenterId,
        direct_project_purchase: directProjectPurchase,
        supplier_name: supplierForCatalog,
        invoice_number: `AI-IMPORT-${importId.slice(0, 8).toUpperCase()}`,
        invoice_date:
          parseIssueDateForDb(meta.document_date ?? undefined) ??
          new Date().toISOString().slice(0, 10),
        total_amount: subtotal,
        status: directProjectPurchase ? "pending" : "pending_match",
      })
      .select("id")
      .single()

    if (invoiceHeaderInsert.error || !invoiceHeaderInsert.data?.id) {
      return {
        ok: false,
        error:
          invoiceHeaderInsert.error?.message ??
          "שמירת חשבונית למסלול רכש ישיר נכשלה",
      }
    }

    const invoiceId = String(invoiceHeaderInsert.data.id)
    const invoiceLinesInsert = await serviceRole.from("supplier_invoice_items").insert(
      lineRows.map((r) => ({
        invoice_id: invoiceId,
        description: r.name,
        quantity: r.quantity,
        unit_price: r.unit_price,
        total_price: r.line_total,
      }))
    )
    if (invoiceLinesInsert.error) {
      await serviceRole.from("supplier_invoices").delete().eq("id", invoiceId)
      return { ok: false, error: invoiceLinesInsert.error.message }
    }

    revalidatePath("/marker-ofek/procurement")
    revalidatePath("/marker-ofek/procurement/ai-import")
    return {
      ok: true,
      importId,
      invoicesSaved: 1,
      newItemsAdded,
      pricesUpdated,
      newItemCreationRequiredCount:
        newItemCreationRequiredCount > 0 ? newItemCreationRequiredCount : undefined,
      needsAdminLineCount:
        needsAdminLineCount > 0 ? needsAdminLineCount : undefined,
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { ok: false, error: msg }
  }
}

export async function assignImportProfitCenter(input: {
  importId: string
  profitCenterId: string
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const importId = String(input.importId ?? "").trim()
  const profitCenterId = String(input.profitCenterId ?? "").trim()
  if (!importId || !profitCenterId) {
    return { ok: false, error: "חסרים מזהי מסמך או מרכז רווח" }
  }
  try {
    const supabase = await createSupabaseServerAuthClient()
    const { data: project, error: pErr } = await supabase
      .from("projects")
      .select("id")
      .eq("id", profitCenterId)
      .eq("is_deleted", false)
      .maybeSingle()
    if (pErr || !project?.id) {
      return { ok: false, error: "מרכז רווח / פרויקט לא נמצא" }
    }

    const { error: upErr } = await supabase
      .from("mo_supplier_invoice_imports")
      .update({
        profit_center_id: profitCenterId,
        allocation_status: "allocated",
        // Cost update gate: only becomes true in downstream process after allocation.
        cost_update_applied: false,
      })
      .eq("id", importId)
    if (upErr) return { ok: false, error: upErr.message }

    revalidatePath("/marker-ofek/procurement/ai-import")
    revalidatePath("/marker-ofek/procurement/ai-import/pending-allocation")
    return { ok: true }
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    }
  }
}

export async function createRetroPurchaseOrderFromDeliveryScan(input: {
  supplierName: string
  profitCenterId: string
  lines: SaveOcrImportLineInput[]
}): Promise<
  | { ok: true; poId: string; poNumber: string; newCatalogItemsCreated: number }
  | { ok: false; error: string }
> {
  const supplierName = String(input.supplierName ?? "").trim()
  const profitCenterId = String(input.profitCenterId ?? "").trim()
  const lines = input.lines ?? []
  if (!supplierName) return { ok: false, error: "חסר שם ספק" }
  if (!profitCenterId) {
    return {
      ok: false,
      error: "נדרש שיוך מרכז רווח לפני יצירת הזמנת רכש רטרואקטיבית",
    }
  }
  if (lines.length === 0) return { ok: false, error: "אין שורות ליצירת הזמנה" }

  try {
    const supabase = await createSupabaseServerAuthClient()
    const serviceRole = createSupabaseServiceRoleClient()
    const companyId = await resolveActiveCompanyId()

    const {
      data: { user },
    } = await supabase.auth.getUser()

    const project = await serviceRole
      .from("projects")
      .select("id")
      .eq("id", profitCenterId)
      .eq("is_deleted", false)
      .maybeSingle()
    if (project.error || !project.data?.id) {
      return { ok: false, error: "מרכז רווח / פרויקט לא קיים" }
    }

    let supplierId: string | null = null
    const existingSupplier = await serviceRole
      .from("entities")
      .select("id")
      .eq("type", "supplier")
      .eq("is_deleted", false)
      .ilike("name", supplierName)
      .maybeSingle()
    if (!existingSupplier.error && existingSupplier.data?.id) {
      supplierId = String(existingSupplier.data.id)
    } else {
      const createdSupplier = await serviceRole
        .from("entities")
        .insert({
          name: supplierName,
          type: "supplier",
          contact_info: {},
          is_deleted: false,
        })
        .select("id")
        .single()
      if (createdSupplier.error || !createdSupplier.data?.id) {
        return { ok: false, error: createdSupplier.error?.message ?? "יצירת ספק נכשלה" }
      }
      supplierId = String(createdSupplier.data.id)
    }

    const poTotal = roundMoney(
      lines.reduce((s, row) => {
        const q = Number(row.quantity) || 0
        const u = Number(row.unit_price) || 0
        return s + q * u
      }, 0)
    )

    const poInsert = await serviceRole
      .from("purchase_orders")
      .insert({
        project_id: profitCenterId,
        tender_id: null,
        supplier_id: supplierId,
        status: "approved",
        total_amount: poTotal,
        internal_notes: "נוצר רטרואקטיבית מתעודת משלוח סרוקה",
        created_by: user?.id ?? null,
      })
      .select("id, po_number")
      .single()
    if (poInsert.error || !poInsert.data?.id) {
      return { ok: false, error: poInsert.error?.message ?? "יצירת הזמנה נכשלה" }
    }
    const poId = String(poInsert.data.id)

    let newCatalogItemsCreated = 0
    const poLines: Array<Record<string, unknown>> = []
    for (const row of lines) {
      const name = stripDisplayPlaceholder(row.normalized_name || row.original_name || "")
      const supplierSku = stripDisplayPlaceholder(row.makat ?? "")
      const quantity = Number(row.quantity) || 0
      const unitPrice = Number(row.unit_price) || 0
      if (!name || quantity <= 0) continue

      let itemId: string | null = null
      if (supplierSku) {
        const bySku = await serviceRole
          .from("erp_md_items")
          .select("id")
          .eq("company_id", companyId)
          .or(`item_number.eq.${supplierSku},internal_sku.eq.${supplierSku}`)
          .maybeSingle()
        if (!bySku.error && bySku.data?.id) itemId = String(bySku.data.id)
      }
      if (!itemId) {
        const byName = await serviceRole
          .from("erp_md_items")
          .select("id")
          .eq("company_id", companyId)
          .ilike("description", name)
          .limit(1)
          .maybeSingle()
        if (!byName.error && byName.data?.id) itemId = String(byName.data.id)
      }
      if (!itemId) {
        const sku = supplierSku || `AUTO-${Date.now().toString().slice(-5)}`
        const createdItem = await serviceRole
          .from("erp_md_items")
          .insert({
            company_id: companyId,
            item_number: sku,
            internal_sku: sku,
            description: name,
            unit_of_measure: row.unit_of_measure || "יחידה",
            is_inventory_managed: true,
            status: "ACTIVE",
            ai_metadata: {
              supplier_sku: supplierSku || null,
              source: "delivery_note_retro_po",
            },
            ocr_match_tokens: toOcrTokens([name, supplierSku, supplierName]),
            legacy_default_price: roundMoney(unitPrice),
            legacy_last_price: roundMoney(unitPrice),
          })
          .select("id")
          .single()
        if (createdItem.error || !createdItem.data?.id) {
          return {
            ok: false,
            error: createdItem.error?.message ?? "יצירת פריט בקטלוג נכשלה",
          }
        }
        itemId = String(createdItem.data.id)
        newCatalogItemsCreated += 1
      }

      poLines.push({
        po_id: poId,
        item_id: itemId,
        description: name,
        quantity,
        unit: row.unit_of_measure || "יחידה",
        unit_price: roundMoney(unitPrice),
        total_price: roundMoney(quantity * unitPrice),
        additional_attributes: {
          source: "delivery_note_scan",
          supplier_sku: supplierSku || null,
        },
      })
    }

    if (poLines.length === 0) {
      await serviceRole.from("purchase_orders").delete().eq("id", poId)
      return { ok: false, error: "לא נמצאו שורות תקינות ליצירת הזמנה" }
    }

    const lineInsert = await serviceRole.from("po_line_items").insert(poLines)
    if (lineInsert.error) {
      await serviceRole.from("purchase_orders").delete().eq("id", poId)
      return { ok: false, error: lineInsert.error.message }
    }

    revalidatePath("/marker-ofek/procurement")
    revalidatePath("/marker-ofek/procurement/purchase-orders/new")
    revalidatePath("/marker-ofek/items")
    return {
      ok: true,
      poId,
      poNumber: String(poInsert.data.po_number ?? ""),
      newCatalogItemsCreated,
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

/**
 * השלמת שמירה אחרי החלטות Copilot — **אדמין בלבד** (יצירת מאסטר/קטגוריה).
 * עובדים חייבים להשתמש ב־`saveSupplierInvoiceOcrImport` בלבד (ללא Copilot).
 */
export async function completeProcurementAiCopilotSave(
  input: Parameters<typeof saveSupplierInvoiceOcrImport>[0]
): Promise<SaveOcrImportResult> {
  const supabase = await createSupabaseServerAuthClient()
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser()

  if (userErr || !user) {
    return { ok: false, error: "נדרשת התחברות" }
  }

  const { data: profile, error: profileErr } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle()

  if (profileErr) {
    return { ok: false, error: profileErr.message }
  }

  if ((profile as { role?: string } | null)?.role !== "admin") {
    return {
      ok: false,
      error:
        "רק מנהל מערכת יכול להשלים פעולות Copilot (קטלוג מאסטר / קטגוריות)",
    }
  }

  return saveSupplierInvoiceOcrImport(input)
}
