"use server"

/**
 * ייבוא כתב כמויות (BoQ) מ־Excel/PDF דרך Gemini → `tender_boq_items`.
 */
import { GoogleGenerativeAI } from "@google/generative-ai"
import { revalidatePath } from "next/cache"

import { extractModelJsonPayload } from "@/lib/ocr-invoice/parse-model-json"
import { formatError } from "@/lib/format-error"
import { createSupabaseServerAuthClient } from "@/lib/supabase/server-auth"
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role"

const TENDER_PRICING_PATH = "/marker-ofek/pre-construction/tender-pricing"

const STORAGE_BUCKET =
  process.env.TENDER_DOCUMENTS_STORAGE_BUCKET?.trim() || "tender_documents"

const GEMINI_BOQ_MODEL = "gemini-1.5-flash"

const BOQ_EXTRACTION_PROMPT = `You are an expert Chief Estimator in Israel. Extract the Bill of Quantities (BoQ) from this document. Ignore headers, cover pages, and summary totals. Return ONLY a valid JSON Array of objects. Each object MUST have these exact keys: 'section' (string, the chapter/category name), 'item_number' (string), 'description' (string, the detailed task), 'unit' (string), and 'quantity' (number). If a value is missing, use null. Prefer Hebrew for all textual fields when inferable from the source.`

function safeStorageFileName(name: string): string {
  const t = name.trim().replace(/[^\w.\u0590-\u05FF-]+/g, "_")
  return t.slice(0, 180) || "boq-upload"
}

function mimeFromBoqFileName(name: string): string {
  const n = name.toLowerCase()
  if (n.endsWith(".pdf")) return "application/pdf"
  if (n.endsWith(".xlsx"))
    return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  if (n.endsWith(".xls")) return "application/vnd.ms-excel"
  throw new Error("נתמכים רק PDF או Excel (.pdf, .xlsx, .xls)")
}

function isAllowedBoqFile(file: File): boolean {
  const n = file.name.toLowerCase()
  return /\.(pdf|xlsx|xls)$/.test(n)
}

type GeminiBoqItem = {
  section?: string | null
  item_number?: string | null
  description?: string | null
  unit?: string | null
  quantity?: number | null
}

function normalizeQuantity(q: unknown): number | null {
  if (q === null || q === undefined) return null
  if (typeof q === "number" && Number.isFinite(q)) return q
  if (typeof q === "string") {
    const t = q.trim().replace(/\s/g, "").replace(/,/g, "")
    if (t === "") return null
    const n = Number(t)
    return Number.isFinite(n) ? n : null
  }
  return null
}

function mapRowToInsert(tenderId: string, raw: unknown) {
  const o = raw as GeminiBoqItem
  return {
    tender_id: tenderId,
    section: o.section != null ? String(o.section) : null,
    item_number: o.item_number != null ? String(o.item_number) : null,
    description: o.description != null ? String(o.description) : null,
    unit: o.unit != null ? String(o.unit) : null,
    quantity: normalizeQuantity(o.quantity),
  }
}

const INSERT_CHUNK = 300

/**
 * מעלה את הקובץ ל-bucket `tender_documents`, שולח ל-Gemini 1.5 Flash, ומבצע batch insert ל־`tender_boq_items` (service role).
 */
export async function processBoQFileAI(
  tenderId: string,
  formData: FormData
): Promise<
  { success: true; inserted: number } | { success: false; error: string }
> {
  const tid = tenderId?.trim()
  if (!tid) {
    return { success: false, error: "חסר מזהה מכרז" }
  }

  const apiKey = process.env.GEMINI_API_KEY?.trim()
  if (!apiKey) {
    return {
      success: false,
      error:
        "שגיאת אבטחה: המפתח הסודי אינו נגיש. אנא ודא שהגדרות השרת תקינות.",
    }
  }

  const file = formData.get("file")
  if (!(file instanceof File) || file.size === 0) {
    return { success: false, error: "לא נבחר קובץ" }
  }
  if (!isAllowedBoqFile(file)) {
    return { success: false, error: "נתמכים רק PDF או Excel" }
  }

  let mime: string
  try {
    mime = mimeFromBoqFileName(file.name)
  } catch (e) {
    return { success: false, error: formatError(e) }
  }

  const supabaseAuth = await createSupabaseServerAuthClient()
  const filePath = `${tid}/boq-${Date.now()}-${safeStorageFileName(file.name)}`
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

  try {
    const genAI = new GoogleGenerativeAI(apiKey)
    const model = genAI.getGenerativeModel({ model: GEMINI_BOQ_MODEL })

    const result = await model.generateContent([
      { text: BOQ_EXTRACTION_PROMPT },
      {
        inlineData: {
          mimeType: mimeForPart,
          data: base64Data,
        },
      },
    ])

    const text = result.response.text()?.trim()
    if (!text) {
      return { success: false, error: "תשובת מודל ריקה" }
    }

    let parsed: unknown
    try {
      parsed = extractModelJsonPayload(text)
    } catch (e) {
      return { success: false, error: `JSON: ${formatError(e)}` }
    }

    if (!Array.isArray(parsed)) {
      return { success: false, error: "המודל לא החזיר מערך JSON" }
    }

    const rows = parsed.map((item) => mapRowToInsert(tid, item))
    if (rows.length === 0) {
      revalidatePath(TENDER_PRICING_PATH)
      return { success: true, inserted: 0 }
    }

    const admin = createSupabaseServiceRoleClient()
    let inserted = 0
    for (let i = 0; i < rows.length; i += INSERT_CHUNK) {
      const chunk = rows.slice(i, i + INSERT_CHUNK)
      const { error: insErr } = await admin.from("tender_boq_items").insert(chunk)

      if (insErr) {
        return { success: false, error: insErr.message }
      }
      inserted += chunk.length
    }

    revalidatePath(TENDER_PRICING_PATH)
    return { success: true, inserted }
  } catch (e) {
    console.error("[tender-boq] שגיאה בתהליך עיבוד כתב כמויות:", e)
    return { success: false, error: formatError(e) }
  }
}
