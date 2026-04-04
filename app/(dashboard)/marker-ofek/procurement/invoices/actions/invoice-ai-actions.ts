"use server"

/**
 * סריקת חשבונית ב־Gemini והכנסה ל־supplier_invoices + supplier_invoice_items (service role).
 */
import { GoogleGenerativeAI } from "@google/generative-ai"
import { revalidatePath } from "next/cache"

import { extractModelJsonPayload } from "@/lib/ocr-invoice/parse-model-json"
import { formatError } from "@/lib/format-error"
import {
  isMissingSuppliersLegalIdColumnError,
} from "@/lib/marker-ofek/supabase-fields"
import { createSupabaseServerAuthClient } from "@/lib/supabase/server-auth"
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role"

const PROCUREMENT_PATH = "/marker-ofek/procurement"
const INVOICES_NEW_PATH = "/marker-ofek/procurement/invoices/new"

const STORAGE_BUCKET =
  process.env.TENDER_DOCUMENTS_STORAGE_BUCKET?.trim() || "tender_documents"

const SECURITY_KEY_ERROR =
  "שגיאת אבטחה: המפתח הסודי אינו נגיש. אנא ודא שהגדרות השרת תקינות."

const INVOICE_AI_PROMPT = `Extract supplier_name, supplier_tax_id, invoice_number, invoice_date, total_amount, and an array of 'items' (description, quantity, unit_price, total_price). Return strictly as a JSON object.

Rules:
- supplier_name: string or null
- supplier_tax_id: supplier legal tax id (ח.פ/ע.מ), string or null
- invoice_number: string or null
- invoice_date: "YYYY-MM-DD" string or null
- total_amount: number (invoice total)
- items: array of objects, each with description (string), supplier_sku (string|null), quantity (number), unit_price (number), total_price (number)
- For text fields (supplier_name, description, unit), return professional Hebrew when text is inferable from the document.
- Output must stay strict JSON and be suitable for "טבלת התאמות וביקורת" workflows.

Output ONLY the raw JSON object. No markdown, no code fences, no explanation.`

async function getPreviousAccountData(
  db: ReturnType<ReturnType<typeof createSupabaseServiceRoleClient>["schema"]>,
  projectId: string,
  currentAccountNum: number
): Promise<
  "אין נתונים קודמים מאושרים." | Array<{
    id: string
    desc: string
    prevTotalPercent: number
  }>
> {
  const previousAccountNum = currentAccountNum - 1
  if (!Number.isFinite(previousAccountNum) || previousAccountNum <= 0) {
    return "אין נתונים קודמים מאושרים."
  }
  const previousAccount = await db
    .from("partial_accounts")
    .select("snapshot_payload")
    .eq("project_id", projectId)
    .eq("account_number", previousAccountNum)
    .eq("status", "approved")
    .limit(1)
    .maybeSingle()

  const snapshot = (
    previousAccount.data as { snapshot_payload?: Record<string, unknown> | null } | null
  )?.snapshot_payload
  const items = Array.isArray(snapshot?.items) ? snapshot.items : []
  if (!items.length) return "אין נתונים קודמים מאושרים."

  return items.map((item, i) => {
    const row =
      item && typeof item === "object" && !Array.isArray(item)
        ? (item as Record<string, unknown>)
        : {}
    return {
      id: String(row.section_number ?? row.item_id ?? `line-${i + 1}`).trim(),
      desc: String(row.description ?? "").trim(),
      prevTotalPercent: Number(row.cumulative_execution_percent ?? 0),
    }
  })
}

function buildInvoicePromptWithHistory(params: {
  currentAccountNum: number
  history: "אין נתונים קודמים מאושרים." | Array<{
    id: string
    desc: string
    prevTotalPercent: number
  }>
  projectLabel: string
}): string {
  return `${INVOICE_AI_PROMPT}

אתה סורק חשבון חלקי מס' ${params.currentAccountNum} לפרויקט ${params.projectLabel}.

### נתוני היסטוריה מאושרים (חשבון קודם):
${JSON.stringify(params.history)}

### המשימה:
חלץ מהקובץ המצורף את ה"ביצוע הנוכחי".
עבור כל סעיף, חשב: מצטבר חדש = (נתון היסטורי + ביצוע נוכחי).
וודא שהחישוב עוקב אחרי הנוסחה: Total% = Previous% + Current%

אם המצטבר עולה על 100%, סמן זאת ב-JSON תחת "alert".`
}

export type InvoiceAiItem = {
  description: string
  supplier_sku?: string | null
  quantity: number
  unit_price: number
  total_price: number
}

export type InvoiceAiParsed = {
  supplier_name: string | null
  supplier_tax_id?: string | null
  invoice_number: string | null
  invoice_date: string | null
  total_amount: number | null
  items: InvoiceAiItem[]
}

/** מיקום הקובץ המקורי ב-Storage (אחרי שמירה ב-DB) */
export type InvoiceAiSourceFile = {
  bucket: string
  path: string
  mimeType: string
}

export type ProcessInvoiceAiResult =
  | {
      success: true
      parsed: InvoiceAiParsed
      invoiceId: string | null
      sourceFile: InvoiceAiSourceFile | null
      syncSummary: {
        updatedItems: number
        newItemsAdded: number
        updatedSkus: number
        supplierActionLabel: "הוקם" | "עודכן"
        priceIncreases: Array<{
          lineIndex: number
          description: string
          previousPrice: number
          newPrice: number
          increasePct: number
        }>
      }
      requiresConfirmation: boolean
    }
  | { success: false; error: string }

function safeStorageFileName(name: string): string {
  const t = name.trim().replace(/[^\w.\u0590-\u05FF-]+/g, "_")
  return t.slice(0, 180) || "invoice"
}

function mimeFromInvoiceFileName(name: string): string {
  const n = name.toLowerCase()
  if (n.endsWith(".pdf")) return "application/pdf"
  if (n.endsWith(".png")) return "image/png"
  if (n.endsWith(".jpg") || n.endsWith(".jpeg")) return "image/jpeg"
  if (n.endsWith(".webp")) return "image/webp"
  throw new Error("נתמכים PDF או תמונה (png, jpg, webp)")
}

function isAllowedInvoiceFile(file: File): boolean {
  const n = file.name.toLowerCase()
  return /\.(pdf|png|jpg|jpeg|webp)$/.test(n)
}

function parseIsoDate(s: unknown): string | null {
  if (typeof s !== "string") return null
  const t = s.trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t
  const d = new Date(t)
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10)
}

function num(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v
  if (typeof v === "string") {
    const t = v.trim().replace(/\s/g, "").replace(/,/g, "")
    if (t === "") return 0
    const n = Number(t)
    return Number.isFinite(n) ? n : 0
  }
  return 0
}

function pctIncrease(prev: number, next: number): number {
  if (prev <= 0) return 0
  return ((next - prev) / prev) * 100
}

function safeInternalSku(value: string, index: number): string {
  const cleaned = value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9-_]+/g, "-")
    .replace(/^-+|-+$/g, "")
  if (cleaned) return cleaned.slice(0, 64)
  return `AUTO-SKU-${Date.now().toString().slice(-6)}-${index + 1}`
}

/** שדות מפורשים מתוך JSON המודל — בלי העברת המפתח הגולמי ל-Supabase */
type ExtractedInvoiceFields = {
  supplier_name: string | null
  supplier_tax_id: string | null
  invoice_number: string | null
  invoice_date: string | null
  total_amount: number | null
  amount: number
  items: unknown[]
}

async function removeInvoiceSourceFile(
  supabase: Awaited<ReturnType<typeof createSupabaseServerAuthClient>>,
  bucket: string,
  path: string
) {
  await supabase.storage.from(bucket).remove([path])
}

async function getNextInternalSkuNumber(
  db: ReturnType<ReturnType<typeof createSupabaseServiceRoleClient>["schema"]>
): Promise<number> {
  const readRecent = await db
    .from("items_catalog")
    .select("internal_sku")
    .order("created_at", { ascending: false })
    .limit(500)

  const rows =
    readRecent.error || !Array.isArray(readRecent.data) ? [] : readRecent.data
  let maxFound = 0
  for (const row of rows) {
    const n = parseTrailingNumber(
      (row as { internal_sku?: string | null }).internal_sku ?? null
    )
    if (n > maxFound) maxFound = n
  }
  return maxFound + 1
}

function formatSequentialInternalSku(n: number): string {
  return `MKT-${String(Math.max(1, n)).padStart(6, "0")}`
}

function isUniqueViolation(err: { code?: string | null; message?: string | null } | null | undefined): boolean {
  const code = String(err?.code ?? "").trim()
  const msg = String(err?.message ?? "").toLowerCase()
  return code === "23505" || msg.includes("duplicate key")
}

async function createCatalogItemWithRetry(
  db: ReturnType<ReturnType<typeof createSupabaseServiceRoleClient>["schema"]>,
  params: {
    sequenceStart: number
    description: string
    unit: string
    unitPrice: number
  }
): Promise<
  | { ok: true; catalogId: string; internalSku: string; nextSequence: number }
  | { ok: false; error: string }
> {
  const maxAttempts = 25
  for (let offset = 0; offset < maxAttempts; offset++) {
    const skuNum = params.sequenceStart + offset
    const internalSku = formatSequentialInternalSku(skuNum)
    const created = await db
      .from("items_catalog")
      .insert({
        internal_sku: internalSku,
        sku: internalSku,
        description: params.description,
        unit: params.unit,
        default_price: params.unitPrice,
        last_price: params.unitPrice,
        is_inventory: true,
      })
      .select("id")
      .single()
    if (!created.error && created.data?.id) {
      return {
        ok: true,
        catalogId: String(created.data.id),
        internalSku,
        nextSequence: skuNum + 1,
      }
    }
    if (!isUniqueViolation(created.error)) {
      return { ok: false, error: created.error?.message ?? "יצירת פריט בקטלוג נכשלה" }
    }
  }

  // Fallback only if many concurrent collisions happened.
  const fallbackSku = `MKT-${Date.now()}-${Math.floor(Math.random() * 9000 + 1000)}`
  const fallback = await db
    .from("items_catalog")
    .insert({
      internal_sku: fallbackSku,
      sku: fallbackSku,
      description: params.description,
      unit: params.unit,
      default_price: params.unitPrice,
      last_price: params.unitPrice,
      is_inventory: true,
    })
    .select("id")
    .single()
  if (fallback.error || !fallback.data?.id) {
    return { ok: false, error: fallback.error?.message ?? "יצירת פריט בקטלוג נכשלה" }
  }
  return {
    ok: true,
    catalogId: String(fallback.data.id),
    internalSku: fallbackSku,
    nextSequence: params.sequenceStart + maxAttempts,
  }
}

async function insertInvoiceLinesWithFallback(
  db: ReturnType<ReturnType<typeof createSupabaseServiceRoleClient>["schema"]>,
  invoiceId: string,
  supplierId: string,
  projectId: string,
  lines: ProcessedInvoiceLine[]
): Promise<{ ok: true } | { ok: false; error: string }> {
  const extendedRows = lines.map((line) => ({
    invoice_id: invoiceId,
    project_id: projectId,
    supplier_id: supplierId,
    supplier_item_id: line.supplierItemId,
    item_catalog_id: line.catalogId,
    internal_sku: line.internalSku,
    supplier_sku: line.supplierSku,
    line_index: line.lineIndex,
    description: line.description,
    quantity: line.quantity,
    unit_price: line.unitPrice,
    total_price: line.totalPrice,
  }))

  const leanRows = lines.map((line) => ({
    invoice_id: invoiceId,
    project_id: projectId,
    description: line.description,
    quantity: line.quantity,
    unit_price: line.unitPrice,
    total_price: line.totalPrice,
  }))

  const minimalRows = lines.map((line) => ({
    invoice_id: invoiceId,
    description: line.description,
    quantity: line.quantity,
    unit_price: line.unitPrice,
    total_price: line.totalPrice,
  }))

  const attempts: Array<{
    table: "invoice_items" | "supplier_invoice_items" | "mo_supplier_invoice_items"
    rows: Array<Record<string, unknown>>
  }> = [
    { table: "invoice_items", rows: extendedRows },
    { table: "invoice_items", rows: leanRows },
    { table: "supplier_invoice_items", rows: extendedRows },
    { table: "supplier_invoice_items", rows: leanRows },
    { table: "supplier_invoice_items", rows: minimalRows },
    { table: "mo_supplier_invoice_items", rows: extendedRows },
    { table: "mo_supplier_invoice_items", rows: leanRows },
    { table: "mo_supplier_invoice_items", rows: minimalRows },
  ]

  let lastError = "שמירת שורות חשבונית נכשלה"
  for (const attempt of attempts) {
    const { error } = await db.from(attempt.table).insert(attempt.rows)
    if (!error) return { ok: true }
    lastError = error.message || lastError
  }
  return { ok: false, error: lastError }
}

function extractInvoiceFields(raw: Record<string, unknown>): ExtractedInvoiceFields {
  const itemsRaw = raw.items
  const supplier =
    raw.supplier_name != null ? String(raw.supplier_name).trim() : ""
  const supplierTaxId =
    raw.supplier_tax_id != null ? String(raw.supplier_tax_id).trim() : ""
  const invNo =
    raw.invoice_number != null ? String(raw.invoice_number).trim() : ""
  const total =
    raw.total_amount != null && raw.total_amount !== ""
      ? num(raw.total_amount)
      : null

  return {
    supplier_name: supplier || null,
    supplier_tax_id: normalizeTaxId(supplierTaxId),
    invoice_number: invNo || null,
    invoice_date: parseIsoDate(raw.invoice_date),
    total_amount: total,
    amount: num(raw.amount),
    items: Array.isArray(itemsRaw) ? itemsRaw : [],
  }
}

function normalizeTaxId(value: string | null | undefined): string | null {
  const raw = String(value ?? "").trim()
  if (!raw) return null
  const digitsOnly = raw.replace(/[^\d]/g, "")
  if (!digitsOnly) return null
  return digitsOnly
}

function parseTrailingNumber(value: string | null | undefined): number {
  const raw = String(value ?? "").trim()
  if (!raw) return 0
  const m = raw.match(/(\d+)\s*$/)
  if (!m) return 0
  return Number(m[1] ?? "0") || 0
}

type ProcessedInvoiceLine = {
  lineIndex: number
  description: string
  quantity: number
  unitPrice: number
  totalPrice: number
  supplierSku: string
  internalSku: string
  catalogId: string
  supplierItemId: string | null
}

export async function processInvoiceAI(
  formData: FormData,
  poId?: string,
  options?: {
    previewOnly?: boolean
    projectId?: string | null
  }
): Promise<ProcessInvoiceAiResult> {
  try {
    const apiKey = process.env.GEMINI_API_KEY?.trim()
    if (!apiKey) {
      return {
        success: false,
        error: SECURITY_KEY_ERROR,
      }
    }
    const genAI = new GoogleGenerativeAI(apiKey)

    const file = formData.get("file")
    if (!(file instanceof File) || file.size === 0) {
      return { success: false, error: "לא נבחר קובץ" }
    }
    if (!isAllowedInvoiceFile(file)) {
      return { success: false, error: "נתמכים PDF או תמונה (png, jpg, webp)" }
    }

  const poIdTrim = poId?.trim() || ""
  const previewOnly = Boolean(options?.previewOnly)
  const explicitProjectId = String(options?.projectId ?? "").trim() || null
  const formProjectId = String(formData.get("projectId") ?? "").trim()
  const currentAccountNum = Number(formData.get("accountNum"))
  const projectLabel = String(formData.get("projectName") ?? "עיר היין").trim() || "עיר היין"

  let mime: string
  try {
    mime = mimeFromInvoiceFileName(file.name)
  } catch (e) {
    return { success: false, error: formatError(e) }
  }

  const supabaseAuth = await createSupabaseServerAuthClient()
  const filePath = `invoice-ai/${Date.now()}-${safeStorageFileName(file.name)}`
  const buf = Buffer.from(await file.arrayBuffer())

  const { error: upErr } = await supabaseAuth.storage
    .from(STORAGE_BUCKET)
    .upload(filePath, buf, {
      upsert: false,
      contentType: mime,
    })

  if (upErr) {
    return { success: false, error: upErr.message }
  }

  const base64Data = buf.toString("base64")
  const mimeForPart = mime === "image/jpg" ? "image/jpeg" : mime
  const admin = createSupabaseServiceRoleClient()
  const db = admin.schema("public")
  const historyProjectId = formProjectId || explicitProjectId || ""
  const history =
    historyProjectId && Number.isFinite(currentAccountNum)
      ? await getPreviousAccountData(db, historyProjectId, currentAccountNum)
      : "אין נתונים קודמים מאושרים."
  const prompt = buildInvoicePromptWithHistory({
    currentAccountNum: Number.isFinite(currentAccountNum) ? currentAccountNum : 0,
    history,
    projectLabel,
  })

  let extractedData: ExtractedInvoiceFields | null = null
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" })
    const result = await model.generateContent([
      { text: prompt },
      {
        inlineData: {
          mimeType: mimeForPart,
          data: base64Data,
        },
      },
    ])
    const text = result.response.text()?.trim() ?? ""
    if (!text) {
      await removeInvoiceSourceFile(supabaseAuth, STORAGE_BUCKET, filePath)
      return { success: false, error: "תשובת מודל ריקה" }
    }

    let rawJson: unknown
    try {
      rawJson = extractModelJsonPayload(text)
    } catch (e) {
      await removeInvoiceSourceFile(supabaseAuth, STORAGE_BUCKET, filePath)
      return { success: false, error: `JSON: ${formatError(e)}` }
    }

    if (!rawJson || typeof rawJson !== "object" || Array.isArray(rawJson)) {
      await removeInvoiceSourceFile(supabaseAuth, STORAGE_BUCKET, filePath)
      return { success: false, error: "המודל לא החזיר אובייקט JSON" }
    }

    extractedData = extractInvoiceFields(rawJson as Record<string, unknown>)
  } catch (error) {
    await removeInvoiceSourceFile(supabaseAuth, STORAGE_BUCKET, filePath)
    const message =
      typeof error === "object" && error !== null && "message" in error
        ? String((error as { message?: unknown }).message ?? "Unknown error")
        : formatError(error)
    console.error("AI ERROR:", error)
    return { success: false, error: `שגיאת AI: ${message}` }
  }

  let resolvedProjectId: string | null = explicitProjectId

  if (poIdTrim) {
    const { data: poRow, error: poErr } = await db
      .from("purchase_orders")
      .select("id, project_id")
      .eq("id", poIdTrim)
      .eq("is_deleted", false)
      .maybeSingle()
    if (poErr || !poRow) {
      await removeInvoiceSourceFile(supabaseAuth, STORAGE_BUCKET, filePath)
      return { success: false, error: "הזמנת הרכש שנבחרה לא נמצאה" }
    }
    resolvedProjectId = String((poRow as { project_id?: string | null }).project_id ?? "").trim() || null
  }

  if (!resolvedProjectId) {
    await removeInvoiceSourceFile(supabaseAuth, STORAGE_BUCKET, filePath)
    return { success: false, error: "חובה לבחור פרויקט לשמירת החשבונית" }
  }

  const supplierName = extractedData.supplier_name?.trim() || "ספק לא מזוהה"
  const supplierTaxId = normalizeTaxId(extractedData.supplier_tax_id)
  let supplierId: string | null = null
  let supplierActionLabel = "עודכן"
  /** false כש־public.suppliers עדיין ללא legal_id בפרודקשן */
  let suppliersLegalIdColumn = true

  // שלב 1: איתור ספק לפי ח.פ. אם קיים - עדכון שם במידת הצורך.
  if (supplierTaxId) {
    const supplierByTaxId = await db
      .from("suppliers")
      .select("id, name")
      .eq("legal_id", supplierTaxId)
      .maybeSingle()
    if (supplierByTaxId.error) {
      if (isMissingSuppliersLegalIdColumnError(supplierByTaxId.error)) {
        suppliersLegalIdColumn = false
      }
    } else if (supplierByTaxId.data?.id) {
      supplierId = String(supplierByTaxId.data.id)
      const existingName = String(supplierByTaxId.data.name ?? "").trim()
      if (
        !previewOnly &&
        existingName !== supplierName &&
        supplierName !== "ספק לא מזוהה"
      ) {
        await db
          .from("suppliers")
          .update({ name: supplierName })
          .eq("id", supplierId)
      }
    }
  }

  // שלב 2: גיבוי לפי שם ספק.
  if (!supplierId) {
    let supplierByName = await db
      .from("suppliers")
      .select("id, legal_id")
      .ilike("name", supplierName)
      .maybeSingle()
    if (supplierByName.error && isMissingSuppliersLegalIdColumnError(supplierByName.error)) {
      suppliersLegalIdColumn = false
      supplierByName = await db
        .from("suppliers")
        .select("id, name")
        .ilike("name", supplierName)
        .maybeSingle()
    }
    if (!supplierByName.error && supplierByName.data?.id) {
      supplierId = String(supplierByName.data.id)
      const rowLegal = (supplierByName.data as { legal_id?: string | null }).legal_id
      if (!previewOnly && supplierTaxId && suppliersLegalIdColumn && !String(rowLegal ?? "").trim()) {
        const up = await db
          .from("suppliers")
          .update({ legal_id: supplierTaxId })
          .eq("id", supplierId)
        if (up.error && isMissingSuppliersLegalIdColumnError(up.error)) {
          suppliersLegalIdColumn = false
        }
      }
    }
  }

  // שלב 3: יצירת ספק חדש אוטומטית.
  if (!supplierId && !previewOnly) {
    const insertRow: { name: string; legal_id?: string | null } = { name: supplierName }
    if (supplierTaxId && suppliersLegalIdColumn) {
      insertRow.legal_id = supplierTaxId
    }
    let inserted = await db.from("suppliers").insert(insertRow).select("id").single()
    if (
      inserted.error &&
      suppliersLegalIdColumn &&
      isMissingSuppliersLegalIdColumnError(inserted.error)
    ) {
      suppliersLegalIdColumn = false
      inserted = await db
        .from("suppliers")
        .insert({ name: supplierName })
        .select("id")
        .single()
    }
    if (inserted.error || !inserted.data?.id) {
      await removeInvoiceSourceFile(supabaseAuth, STORAGE_BUCKET, filePath)
      return { success: false, error: inserted.error?.message ?? "יצירת ספק נכשלה" }
    }
    supplierId = String(inserted.data.id)
    supplierActionLabel = "הוקם"
  }

  if (!supplierId && !previewOnly) {
    await removeInvoiceSourceFile(supabaseAuth, STORAGE_BUCKET, filePath)
    return { success: false, error: "לא ניתן לזהות ספק לחשבונית" }
  }

  let updatedItems = 0
  let newItemsAdded = 0
  let updatedSkus = 0
  let nextInternalSkuNumber = await getNextInternalSkuNumber(db)
  const processedLines: ProcessedInvoiceLine[] = []
  const priceIncreases: Array<{
    lineIndex: number
    description: string
    previousPrice: number
    newPrice: number
    increasePct: number
  }> = []

  for (let i = 0; i < extractedData.items.length; i++) {
    const raw = extractedData.items[i] as Record<string, unknown>
    const description = String(raw.description ?? "").trim()
    if (!description) continue
    const supplierSkuRaw =
      raw.supplier_sku == null ? "" : String(raw.supplier_sku).trim()
    const normalizedSupplierSku = safeInternalSku(supplierSkuRaw, i)
    const newUnitPrice = num(raw.unit_price)
    const quantity = num(raw.quantity) || 1
    const totalPrice = num(raw.total_price) || quantity * newUnitPrice
    const unit = (raw.unit == null ? "" : String(raw.unit).trim()) || "יחידה"

    let catalogId: string | null = null
    let previousPrice: number | null = null
    let internalSku = ""
    let supplierItemId: string | null = null
    let supplierSku = normalizedSupplierSku

    // a) מיפוי ספק קיים לפי (supplier_id + supplier_sku)
    if (supplierId && normalizedSupplierSku) {
      const mapExisting = await db
        .from("supplier_items")
        .select("id, master_item_id, unit_price, last_price")
        .eq("supplier_id", supplierId)
        .eq("supplier_sku", normalizedSupplierSku)
        .maybeSingle()
      if (!mapExisting.error && mapExisting.data?.master_item_id) {
        supplierItemId = String(mapExisting.data.id)
        catalogId = String(mapExisting.data.master_item_id)
        supplierSku = normalizedSupplierSku
        previousPrice = Number(
          mapExisting.data.last_price ?? mapExisting.data.unit_price ?? 0
        )
      }
    }

    // b/c) איתור קטלוג ע"פ מקט פנימי (נגזר ממקט ספק) או תיאור.
    if (!catalogId) {
      const candidateInternalSku =
        normalizedSupplierSku || safeInternalSku(description, i)
      const byInternalSku = await db
        .from("items_catalog")
        .select("id, internal_sku, default_price, last_price")
        .eq("internal_sku", candidateInternalSku)
        .limit(1)
        .maybeSingle()
      if (!byInternalSku.error && byInternalSku.data?.id) {
        catalogId = String(byInternalSku.data.id)
        internalSku = String(
          byInternalSku.data.internal_sku ?? candidateInternalSku
        )
        previousPrice = Number(
          byInternalSku.data.last_price ?? byInternalSku.data.default_price ?? 0
        )
      }
    }

    if (!catalogId) {
      const byDesc = await db
        .from("items_catalog")
        .select("id, internal_sku, default_price, last_price")
        .ilike("description", description)
        .limit(1)
        .maybeSingle()
      if (!byDesc.error && byDesc.data?.id) {
        catalogId = String(byDesc.data.id)
        internalSku = String(
          byDesc.data.internal_sku ?? safeInternalSku(description, i)
        )
        previousPrice = Number(
          byDesc.data.last_price ?? byDesc.data.default_price ?? 0
        )
      }
    }

    // d) יצירת מקט פנימי חדש סדרתי כאשר אין התאמה.
    if (!catalogId) {
      if (!previewOnly) {
        const created = await createCatalogItemWithRetry(db, {
          sequenceStart: nextInternalSkuNumber,
          description,
          unit,
          unitPrice: newUnitPrice,
        })
        if (!created.ok) {
          await removeInvoiceSourceFile(supabaseAuth, STORAGE_BUCKET, filePath)
          return { success: false, error: created.error }
        }
        catalogId = created.catalogId
        internalSku = created.internalSku
        nextInternalSkuNumber = created.nextSequence
      } else {
        internalSku = formatSequentialInternalSku(nextInternalSkuNumber++)
        catalogId = `preview-${i}`
      }
      newItemsAdded += 1
    }

    if (!internalSku && catalogId) {
      const readCatalog = await db
        .from("items_catalog")
        .select("internal_sku")
        .eq("id", catalogId)
        .maybeSingle()
      internalSku = String(readCatalog.data?.internal_sku ?? safeInternalSku(description, i))
    }

    if (!supplierSku) {
      supplierSku = internalSku
    }

    // b) עדכון/יצירת mapping בין מקט ספק למקט פנימי ועדכון מחירים.
    if (catalogId && previewOnly === false && supplierId) {
      const mapRes = await db
        .from("supplier_items")
        .select("id, unit_price, last_price")
        .eq("supplier_id", supplierId)
        .eq("supplier_sku", supplierSku)
        .maybeSingle()
      if (!mapRes.error && mapRes.data?.id) {
        supplierItemId = String(mapRes.data.id)
        const updateSupplierItemRes = await db
          .from("supplier_items")
          .update({
            master_item_id: catalogId,
            supplier_sku: supplierSku,
            unit_price: newUnitPrice,
            last_price: newUnitPrice,
          })
          .eq("id", mapRes.data.id)
        if (updateSupplierItemRes.error) {
          await removeInvoiceSourceFile(supabaseAuth, STORAGE_BUCKET, filePath)
          return {
            success: false,
            error: `עדכון מקט ספק נכשל: ${updateSupplierItemRes.error.message}`,
          }
        }
        if (previousPrice == null) {
          previousPrice = Number(mapRes.data.last_price ?? mapRes.data.unit_price ?? 0)
        }
      } else {
        const insertedMap = await db.from("supplier_items").insert({
          supplier_id: supplierId,
          master_item_id: catalogId,
          supplier_sku: supplierSku,
          unit_price: newUnitPrice,
          last_price: newUnitPrice,
        }).select("id").single()
        if (!insertedMap.error && insertedMap.data?.id) {
          supplierItemId = String(insertedMap.data.id)
        }
      }
      const updateCatalogRes = await db
        .from("items_catalog")
        .update({
          internal_sku: internalSku || safeInternalSku(description, i),
          default_price: newUnitPrice,
          last_price: newUnitPrice,
        })
        .eq("id", catalogId)
      if (updateCatalogRes.error) {
        await removeInvoiceSourceFile(supabaseAuth, STORAGE_BUCKET, filePath)
        return {
          success: false,
          error: `עדכון קטלוג פריטים נכשל: ${updateCatalogRes.error.message}`,
        }
      }
      updatedSkus += 1
      updatedItems += 1
    }

    if (previousPrice != null && previousPrice > 0) {
      const rise = pctIncrease(previousPrice, newUnitPrice)
      if (rise > 5) {
        priceIncreases.push({
          lineIndex: i,
          description,
          previousPrice,
          newPrice: newUnitPrice,
          increasePct: Math.round(rise * 100) / 100,
        })
      }
    }

    if (catalogId) {
      processedLines.push({
        lineIndex: i,
        description,
        quantity,
        unitPrice: newUnitPrice,
        totalPrice,
        supplierSku,
        internalSku: internalSku || safeInternalSku(description, i),
        catalogId,
        supplierItemId,
      })
    }
  }

  if (previewOnly) {
    const parsedPreview: InvoiceAiParsed = {
      supplier_name: extractedData.supplier_name,
      supplier_tax_id: extractedData.supplier_tax_id,
      invoice_number: extractedData.invoice_number,
      invoice_date: extractedData.invoice_date || new Date().toISOString().split("T")[0],
      total_amount: extractedData.total_amount || extractedData.amount || 0,
      items: extractedData.items.map((item: any) => ({
        description: item.description || "ללא תיאור",
        supplier_sku: item.supplier_sku ?? null,
        quantity: item.quantity || 1,
        unit_price: item.unit_price || item.price || 0,
        total_price:
          item.total_price ||
          item.amount ||
          (item.quantity * (item.unit_price || item.price || 0)) ||
          0,
      })),
    }
    await removeInvoiceSourceFile(supabaseAuth, STORAGE_BUCKET, filePath)
    return {
      success: true,
      parsed: parsedPreview,
      invoiceId: null,
      sourceFile: null,
      syncSummary: {
        updatedItems,
        newItemsAdded,
        updatedSkus,
        supplierActionLabel: supplierActionLabel as "הוקם" | "עודכן",
        priceIncreases,
      },
      requiresConfirmation: true,
    }
  }

  if (!supplierId) {
    await removeInvoiceSourceFile(supabaseAuth, STORAGE_BUCKET, filePath)
    return { success: false, error: "לא ניתן לזהות ספק לחשבונית" }
  }

  const invoicePayload = {
    supplier_id: supplierId,
    project_id: resolvedProjectId,
    invoice_number: extractedData.invoice_number || "N/A",
    invoice_date:
      extractedData.invoice_date ||
      new Date().toISOString().split("T")[0],
    total_amount:
      extractedData.total_amount || extractedData.amount || 0,
    amount: extractedData.total_amount || extractedData.amount || 0,
    description: `חשבונית ספק ${supplierName}`,
    due_date:
      extractedData.invoice_date ||
      new Date().toISOString().split("T")[0],
    status: "pending",
    source_storage_bucket: STORAGE_BUCKET,
    source_file_path: filePath,
    source_mime_type: mime,
  }

  const totalAmount = Number(invoicePayload.total_amount)
  if (totalAmount < 0 || !Number.isFinite(totalAmount)) {
    await removeInvoiceSourceFile(supabaseAuth, STORAGE_BUCKET, filePath)
    return { success: false, error: "סכום חשבונית לא תקין" }
  }

  const { data: invRow, error: invErr } = await db
    .from("invoices")
    .insert(invoicePayload)
    .select("id")
    .single()

  if (invErr || !invRow?.id) {
    await removeInvoiceSourceFile(supabaseAuth, STORAGE_BUCKET, filePath)
    return {
      success: false,
      error: invErr?.message ?? "שמירת חשבונית נכשלה",
    }
  }

  const invoiceId = invRow.id as string

  const linesSave = await insertInvoiceLinesWithFallback(
    db,
    invoiceId,
    supplierId,
    resolvedProjectId,
    processedLines
  )
  if (!linesSave.ok) {
    await db.from("invoices").delete().eq("id", invoiceId)
    await removeInvoiceSourceFile(supabaseAuth, STORAGE_BUCKET, filePath)
    return {
      success: false,
      error: `שמירת שורות חשבונית נכשלה: ${linesSave.error}`,
    }
  }

  const parsed: InvoiceAiParsed = {
    supplier_name: extractedData.supplier_name,
    supplier_tax_id: extractedData.supplier_tax_id,
    invoice_number: extractedData.invoice_number,
    invoice_date: invoicePayload.invoice_date,
    total_amount: totalAmount,
    items: extractedData.items.map((item: any) => ({
      description: item.description || "ללא תיאור",
      supplier_sku: item.supplier_sku ?? null,
      quantity: item.quantity || 1,
      unit_price: item.unit_price || item.price || 0,
      total_price:
        item.total_price ||
        item.amount ||
        (item.quantity * (item.unit_price || item.price || 0)) ||
        0,
    })),
  }

  revalidatePath(PROCUREMENT_PATH)
  revalidatePath(INVOICES_NEW_PATH)
  revalidatePath("/marker-ofek/procurement/aging")

  return {
    success: true,
    parsed,
    invoiceId,
    sourceFile: {
      bucket: STORAGE_BUCKET,
      path: filePath,
      mimeType: mime,
    },
    syncSummary: {
      updatedItems,
      newItemsAdded,
      updatedSkus,
      supplierActionLabel: supplierActionLabel as "הוקם" | "עודכן",
      priceIncreases,
    },
    requiresConfirmation: false,
  }
  } catch (e) {
    return { success: false, error: formatError(e) }
  }
}
