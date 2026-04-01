"use server"

/**
 * סריקת חשבונית ב־Gemini והכנסה ל־supplier_invoices + supplier_invoice_items (service role).
 */
import { GoogleGenerativeAI } from "@google/generative-ai"
import { revalidatePath } from "next/cache"

import { extractModelJsonPayload } from "@/lib/ocr-invoice/parse-model-json"
import { formatError } from "@/lib/format-error"
import { createSupabaseServerAuthClient } from "@/lib/supabase/server-auth"
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role"

const PROCUREMENT_PATH = "/marker-ofek/procurement"
const INVOICES_NEW_PATH = "/marker-ofek/procurement/invoices/new"

const STORAGE_BUCKET =
  process.env.TENDER_DOCUMENTS_STORAGE_BUCKET?.trim() || "tender_documents"

const GEMINI_MODEL = "gemini-2.5-flash"

const INVOICE_AI_PROMPT = `Extract supplier_name, invoice_number, invoice_date, total_amount, and an array of 'items' (description, quantity, unit_price, total_price). Return strictly as a JSON object.

Rules:
- supplier_name: string or null
- invoice_number: string or null
- invoice_date: "YYYY-MM-DD" string or null
- total_amount: number (invoice total)
- items: array of objects, each with description (string), supplier_sku (string|null), quantity (number), unit_price (number), total_price (number)

Output ONLY the raw JSON object. No markdown, no code fences, no explanation.`

export type InvoiceAiItem = {
  description: string
  supplier_sku?: string | null
  quantity: number
  unit_price: number
  total_price: number
}

export type InvoiceAiParsed = {
  supplier_name: string | null
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

function extractInvoiceFields(raw: Record<string, unknown>): ExtractedInvoiceFields {
  const itemsRaw = raw.items
  const supplier =
    raw.supplier_name != null ? String(raw.supplier_name).trim() : ""
  const invNo =
    raw.invoice_number != null ? String(raw.invoice_number).trim() : ""
  const total =
    raw.total_amount != null && raw.total_amount !== ""
      ? num(raw.total_amount)
      : null

  return {
    supplier_name: supplier || null,
    invoice_number: invNo || null,
    invoice_date: parseIsoDate(raw.invoice_date),
    total_amount: total,
    amount: num(raw.amount),
    items: Array.isArray(itemsRaw) ? itemsRaw : [],
  }
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
      error: "מפתח AI חסר - אנא הגדר GEMINI_API_KEY בקובץ ה-env",
    }
  }

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

  let extractedData: ExtractedInvoiceFields
  try {
    const genAI = new GoogleGenerativeAI(apiKey)
    const model = genAI.getGenerativeModel({ model: GEMINI_MODEL })

    const result = await model.generateContent([
      { text: INVOICE_AI_PROMPT },
      {
        inlineData: {
          mimeType: mimeForPart,
          data: base64Data,
        },
      },
    ])

    const text = result.response.text()?.trim()
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
  } catch (e) {
    await removeInvoiceSourceFile(supabaseAuth, STORAGE_BUCKET, filePath)
    return { success: false, error: formatError(e) }
  }

  const admin = createSupabaseServiceRoleClient()
  const db = admin.schema("public")
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
  let supplierId: string | null = null
  const supplierLookup = await db
    .from("suppliers")
    .select("id")
    .ilike("name", supplierName)
    .maybeSingle()
  if (!supplierLookup.error && supplierLookup.data?.id) {
    supplierId = String(supplierLookup.data.id)
  } else {
    const inserted = await db
      .from("suppliers")
      .insert({
        name: supplierName,
      })
      .select("id")
      .single()
    if (inserted.error || !inserted.data?.id) {
      await removeInvoiceSourceFile(supabaseAuth, STORAGE_BUCKET, filePath)
      return { success: false, error: inserted.error?.message ?? "יצירת ספק נכשלה" }
    }
    supplierId = String(inserted.data.id)
  }

  if (!supplierId) {
    await removeInvoiceSourceFile(supabaseAuth, STORAGE_BUCKET, filePath)
    return { success: false, error: "לא ניתן לזהות ספק לחשבונית" }
  }

  let updatedItems = 0
  let newItemsAdded = 0
  let updatedSkus = 0
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
    const internalSku = safeInternalSku(supplierSkuRaw || description, i)
    const supplierSku = supplierSkuRaw || internalSku
    const newUnitPrice = num(raw.unit_price)
    const unit = (raw.unit == null ? "" : String(raw.unit).trim()) || "יחידה"

    let catalogId: string | null = null
    let previousPrice: number | null = null

    // STEP A: check if item exists in items_catalog by internal_sku.
    const byInternalSku = await db
      .from("items_catalog")
      .select("id, default_price, last_price")
      .eq("internal_sku", internalSku)
      .limit(1)
      .maybeSingle()
    if (!byInternalSku.error && byInternalSku.data?.id) {
      catalogId = String(byInternalSku.data.id)
      previousPrice = Number(
        byInternalSku.data.last_price ?? byInternalSku.data.default_price ?? 0
      )
    }

    // F1 fallback: lookup by description.
    if (!catalogId) {
      const byDesc = await db
        .from("items_catalog")
        .select("id, default_price, last_price")
        .ilike("description", description)
        .limit(1)
        .maybeSingle()
      if (!byDesc.error && byDesc.data?.id) {
        catalogId = String(byDesc.data.id)
        previousPrice = Number(
          byDesc.data.last_price ?? byDesc.data.default_price ?? 0
        )
      }
    }

    // STEP D: create missing item in catalog
    if (!catalogId) {
      if (!previewOnly) {
        const created = await db
          .from("items_catalog")
          .insert({
            internal_sku: internalSku,
            sku: internalSku,
            description,
            unit,
            default_price: newUnitPrice,
            last_price: newUnitPrice,
            is_inventory: true,
          })
          .select("id")
          .single()
        if (created.error || !created.data?.id) {
          await removeInvoiceSourceFile(supabaseAuth, STORAGE_BUCKET, filePath)
          return { success: false, error: created.error?.message ?? "יצירת פריט בקטלוג נכשלה" }
        }
        catalogId = String(created.data.id)
      } else {
        catalogId = `preview-${i}`
      }
      newItemsAdded += 1
    }

    // STEP B: mapping upsert in supplier_items by supplier_id + supplier_sku.
    // Always update last_price in both tables.
    if (catalogId && previewOnly === false) {
      const mapRes = await db
        .from("supplier_items")
        .select("id, unit_price")
        .eq("supplier_id", supplierId)
        .eq("supplier_sku", supplierSku)
        .maybeSingle()
      if (!mapRes.error && mapRes.data?.id) {
        await db
          .from("supplier_items")
          .update({
            master_item_id: catalogId,
            supplier_sku: supplierSku,
            unit_price: newUnitPrice,
            last_price: newUnitPrice,
          })
          .eq("id", mapRes.data.id)
        if (previousPrice == null) {
          previousPrice = Number(mapRes.data.unit_price ?? 0)
        }
      } else {
        await db.from("supplier_items").insert({
          supplier_id: supplierId,
          master_item_id: catalogId,
          supplier_sku: supplierSku,
          unit_price: newUnitPrice,
          last_price: newUnitPrice,
        })
      }
      await db
        .from("items_catalog")
        .update({
          internal_sku: internalSku,
          default_price: newUnitPrice,
          last_price: newUnitPrice,
        })
        .eq("id", catalogId)
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
  }

  if (previewOnly) {
    const parsedPreview: InvoiceAiParsed = {
      supplier_name: extractedData.supplier_name,
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
        priceIncreases,
      },
      requiresConfirmation: true,
    }
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

  const parsed: InvoiceAiParsed = {
    supplier_name: extractedData.supplier_name,
    invoice_number: extractedData.invoice_number,
    invoice_date: invoicePayload.invoice_date,
    total_amount: totalAmount,
    items: extractedData.items.map((item: any) => ({
      description: item.description || "No description",
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
      priceIncreases,
    },
    requiresConfirmation: false,
  }
  } catch (e) {
    return { success: false, error: formatError(e) }
  }
}
