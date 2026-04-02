import { NextResponse } from "next/server"

import { extractModelJsonPayload } from "@/lib/ocr-invoice/parse-model-json"
import { normalizeProcurementCategory } from "@/lib/marker-ofek/procurement-categories"

export const runtime = "nodejs"
export const maxDuration = 120

const MAX_FILE_BYTES = 15 * 1024 * 1024
/** הגנה מפני מערכי שורות/מטא-דאטה חריגים מהמודל */
const MAX_LINE_ITEMS = 5_000
const IS_PRODUCTION = process.env.NODE_ENV === "production"

function clientSafeFetchErrorMessage(err: unknown): string {
  if (!(err instanceof Error)) return String(err)
  if (IS_PRODUCTION) {
    return `${err.name}: ${err.message}`
  }
  return `${err.name}: ${err.message}${err.stack ? `\n${err.stack}` : ""}`
}

const GEMINI_REST_MODEL = "gemini-1.5-flash"

/** פלט מובנה לקליטה עתידית ב-ERP; רקע: lib/marker-ofek/erp-evolution-insights.ts */
const EXTRACTOR_PROMPT = `You are an expert Israeli procurement analyst. Extract data from this invoice/quote/delivery note for an ERP system.

Return ONLY a single JSON object (no markdown fences) with this exact shape:
{
  "document_type": "string (e.g. 'הצעת מחיר', 'תעודת משלוח', 'חשבונית מס')",
  "document_date": "string in YYYY-MM-DD format",
  "supplier_name": "string",
  "items": [
    {
      "makat": "string — supplier SKU/catalog number",
      "original_name": "string — exact description from the document",
      "normalized_name": "string — core generic product type in Hebrew",
      "quantity": number,
      "unit_of_measure": "string (e.g. 'מטר', 'יח')",
      "unit_price": number,
      "total_line_price": number,
      "category_name": "string — choose STRICTLY one of: 'כבלים ומוליכים', 'אביזרי קצה ומיתוג', 'תאורה וגופי תאורה', 'צנרת, תעלות וקופסאות', 'לוחות חשמל וציוד חלוקה', 'שונות'",
      "additional_attributes": { }
    }
  ]
}

Rules: unit_price is net price per ONE unit of measure; if only line total exists, compute unit_price = total_line_price / quantity. total_line_price must equal quantity * unit_price. additional_attributes holds brand, voltage, color, etc. Use Hebrew for document_type when appropriate.`

type OcrInvoiceMetadata = {
  document_type: string
  document_date: string
  supplier_name: string
}

type LineItem = {
  makat: string
  original_name: string
  normalized_name: string
  quantity: number
  unit_of_measure: string
  unit_price: number
  total_line_price: number
  category_name: string
  additional_attributes: Record<string, string | number | boolean | null>
}

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100
}

/**
 * Gemini `inline_data.data` must be raw base64 only (no `data:mime;base64,` prefix).
 */
function toPureBase64(raw: string): string {
  const s = raw.trim()
  const m = /^data:[^;]+;base64,([\s\S]+)$/i.exec(s)
  const payload = m ? m[1] : s
  return payload.replace(/\s/g, "")
}

function resolveMediaType(file: File): string {
  const t = file.type?.trim().toLowerCase()
  if (t && t !== "application/octet-stream") return t
  const n = file.name.toLowerCase()
  if (n.endsWith(".pdf")) return "application/pdf"
  if (n.endsWith(".png")) return "image/png"
  if (n.endsWith(".jpg") || n.endsWith(".jpeg")) return "image/jpeg"
  if (n.endsWith(".webp")) return "image/webp"
  if (n.endsWith(".gif")) return "image/gif"
  throw new Error(
    "לא ניתן לזהות סוג קובץ; יש להעלות PDF או תמונה (JPEG, PNG, WebP, GIF)"
  )
}

function coerceNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string") {
    const n = Number(value.replace(/,/g, "").replace(/\s/g, "").trim())
    return Number.isFinite(n) ? n : NaN
  }
  return NaN
}

const MAX_ADDITIONAL_ATTR_KEYS = 40
const MAX_ATTR_KEY_LEN = 80
const MAX_ATTR_STRING_LEN = 500

function normalizeAttributes(
  value: unknown
): Record<string, string | number | boolean | null> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {}
  const out: Record<string, string | number | boolean | null> = {}
  let n = 0
  for (const [k0, val] of Object.entries(value as Record<string, unknown>)) {
    if (n >= MAX_ADDITIONAL_ATTR_KEYS) break
    const k = k0.slice(0, MAX_ATTR_KEY_LEN)
    if (
      val === null ||
      typeof val === "string" ||
      typeof val === "number" ||
      typeof val === "boolean"
    ) {
      out[k] =
        typeof val === "string" && val.length > MAX_ATTR_STRING_LEN
          ? `${val.slice(0, MAX_ATTR_STRING_LEN)}…`
          : val
    } else if (val !== undefined) {
      const s = String(val)
      out[k] =
        s.length > MAX_ATTR_STRING_LEN
          ? `${s.slice(0, MAX_ATTR_STRING_LEN)}…`
          : s
    }
    n += 1
  }
  return out
}

function normalizeLineItem(row: unknown): LineItem | null {
  if (!row || typeof row !== "object") return null
  const r = row as Record<string, unknown>

  const makat = String(r.makat ?? "").trim()
  const original_name = String(
    r.original_name ?? r.name ?? ""
  ).trim()
  const normalized_name = String(r.normalized_name ?? "").trim()
  if (!original_name && !normalized_name && !makat) return null

  let quantity = coerceNumber(r.quantity)
  if (!Number.isFinite(quantity) || quantity < 0) quantity = 0

  let unit_price = coerceNumber(
    r.unit_price ?? r.unitPrice ?? r.price
  )
  let total_line_price = coerceNumber(
    r.total_line_price ?? r.totalLinePrice
  )

  if (
    (!Number.isFinite(unit_price) || unit_price <= 0) &&
    Number.isFinite(total_line_price) &&
    total_line_price > 0 &&
    quantity > 0
  ) {
    unit_price = roundMoney(total_line_price / quantity)
  }
  if (!Number.isFinite(unit_price) || unit_price < 0) unit_price = 0

  if (!Number.isFinite(total_line_price) || total_line_price < 0) {
    total_line_price = roundMoney(quantity * unit_price)
  } else {
    const expected = roundMoney(quantity * unit_price)
    if (
      quantity > 0 &&
      unit_price > 0 &&
      Math.abs(total_line_price - expected) > 0.02
    ) {
      total_line_price = expected
    }
  }

  const unit_of_measure = String(
    r.unit_of_measure ?? r.unitOfMeasure ?? "יח"
  ).trim() || "יח"

  const additional_attributes = normalizeAttributes(
    r.additional_attributes ?? r.additionalFields
  )

  if (quantity === 0) {
    total_line_price = 0
  }

  const category_name = normalizeProcurementCategory(r.category_name)

  return {
    makat: makat || "—",
    original_name: original_name || normalized_name || makat || "—",
    normalized_name: normalized_name || original_name || makat || "—",
    quantity,
    unit_of_measure,
    unit_price: roundMoney(unit_price),
    total_line_price: roundMoney(total_line_price),
    category_name,
    additional_attributes,
  }
}

function parseDocumentDate(value: unknown): string {
  const raw = typeof value === "string" ? value.trim() : ""
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw
  if (!raw) return ""
  const d = new Date(raw)
  if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10)
  return ""
}

function extractMetadata(o: Record<string, unknown>): OcrInvoiceMetadata {
  const document_type = String(o.document_type ?? "").trim()
  const document_date = parseDocumentDate(o.document_date)
  const supplier_name = String(
    o.supplier_name ?? o.supplierName ?? ""
  ).trim()
  return {
    document_type: document_type || "מסמך ספק",
    document_date,
    supplier_name,
  }
}

function parseInvoicePayload(parsed: unknown): {
  metadata: OcrInvoiceMetadata
  items: LineItem[]
} {
  if (Array.isArray(parsed)) {
    return {
      metadata: {
        document_type: "מסמך ספק",
        document_date: "",
        supplier_name: "",
      },
      items: normalizeItems(parsed),
    }
  }

  if (parsed && typeof parsed === "object" && "items" in parsed) {
    const o = parsed as Record<string, unknown>
    if (!Array.isArray(o.items)) {
      throw new Error("שדה items בתשובת המודל אינו מערך")
    }
    return {
      metadata: extractMetadata(o),
      items: normalizeItems(o.items),
    }
  }

  throw new Error(
    "תשובת המודל חייבת להיות אובייקט JSON עם שדה items (מערך)"
  )
}

function normalizeItems(rawItems: unknown[]): LineItem[] {
  if (rawItems.length > MAX_LINE_ITEMS) {
    throw new Error(
      `יותר מדי שורות בחשבונית (מקסימום ${MAX_LINE_ITEMS.toLocaleString("he-IL")})`
    )
  }
  const items: LineItem[] = []
  for (const row of rawItems) {
    const line = normalizeLineItem(row)
    if (line) items.push(line)
  }
  if (rawItems.length > 0 && items.length === 0) {
    throw new Error(
      "לא ניתן לפרסר שורות מהחשבונית — נסו קובץ ברור יותר או פורמט אחר"
    )
  }
  return items
}

type GeminiGenerateContentResponse = {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> }
    finishReason?: string
  }>
  error?: { code?: number; message?: string; status?: string }
}

/** Exact Google API payload for debugging (no silent fallback). */
function stringifyGoogleResponseForError(
  parsedBody: unknown,
  rawText: string,
  httpStatus: number
): string {
  try {
    if (parsedBody !== null && parsedBody !== undefined) {
      return `HTTP ${httpStatus} — ${JSON.stringify(parsedBody)}`
    }
  } catch {
    /* ignore */
  }
  return `HTTP ${httpStatus} — ${rawText.slice(0, 4000)}`
}

/**
 * POST /api/ocr-invoice — קליטת PDF/תמונה, חילוץ שורות דרך Gemini REST API (ללא SDK).
 * אין נתוני דמה: כשל ב-Gemini או בפרסור מחזיר 500 עם גוף השגיאה המלא מה-API.
 */
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const apiKey = process.env.GEMINI_API_KEY?.trim()
    if (!apiKey) {
      return NextResponse.json(
        {
          error:
            "שגיאת אבטחה: המפתח הסודי אינו נגיש. אנא ודא שהגדרות השרת תקינות.",
        },
        { status: 503 }
      )
    }

    let formData: FormData
    try {
      formData = await request.formData()
    } catch {
      return NextResponse.json(
        { error: "גוף הבקשה חייב להיות multipart/form-data" },
        { status: 400 }
      )
    }

    const file = formData.get("file")
    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { error: "חסר קובץ (שדה file)" },
        { status: 400 }
      )
    }

    if (file.size === 0) {
      return NextResponse.json({ error: "קובץ ריק" }, { status: 400 })
    }

    if (file.size > MAX_FILE_BYTES) {
      return NextResponse.json(
        {
          error: `הקובץ גדול מדי (מקסימום ${Math.round(MAX_FILE_BYTES / (1024 * 1024))}MB)`,
        },
        { status: 400 }
      )
    }

    let fileType: string
    try {
      fileType = resolveMediaType(file)
    } catch (e) {
      const msg = e instanceof Error ? e.message : "סוג קובץ לא נתמך"
      return NextResponse.json({ error: msg }, { status: 400 })
    }

    const isPdf = fileType === "application/pdf"
    const isImage = fileType.startsWith("image/")
    if (!isPdf && !isImage) {
      return NextResponse.json(
        { error: "נתמכים רק PDF או תמונות (JPEG, PNG, WebP, GIF)" },
        { status: 400 }
      )
    }

    const buf = Buffer.from(await file.arrayBuffer())
    const base64String = toPureBase64(buf.toString("base64"))

    const url = `https://generativelanguage.googleapis.com/v1/models/${GEMINI_REST_MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`

    const body = {
      contents: [
        {
          parts: [
            { text: EXTRACTOR_PROMPT },
            {
              inline_data: {
                mime_type: fileType,
                data: base64String,
              },
            },
          ],
        },
      ],
    }

    let geminiJson: GeminiGenerateContentResponse
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })

      const rawText = await res.text()
      let parsedBody: unknown
      try {
        parsedBody = rawText ? JSON.parse(rawText) : null
      } catch (parseErr) {
        console.error("[ocr-invoice] Gemini response not JSON", {
          status: res.status,
          snippet: rawText.slice(0, 400),
          parseErr,
        })
        return NextResponse.json(
          {
            error: stringifyGoogleResponseForError(
              { parseNote: "body not JSON", bodySnippet: rawText.slice(0, 2000) },
              rawText,
              res.status
            ),
          },
          { status: 500 }
        )
      }

      geminiJson = parsedBody as GeminiGenerateContentResponse

      if (!res.ok) {
        console.error("[ocr-invoice] Gemini HTTP error", {
          status: res.status,
          body: parsedBody,
          snippet: rawText.slice(0, 800),
        })
        return NextResponse.json(
          {
            error: stringifyGoogleResponseForError(parsedBody, rawText, res.status),
          },
          { status: 500 }
        )
      }
    } catch (err) {
      console.error("[ocr-invoice] fetch Gemini failed", err)
      return NextResponse.json(
        { error: clientSafeFetchErrorMessage(err) },
        { status: 500 }
      )
    }

    const parts = geminiJson.candidates?.[0]?.content?.parts
    const text = parts?.[0]?.text?.trim()
    if (!text) {
      const reason = geminiJson.candidates?.[0]?.finishReason
      console.error("[ocr-invoice] empty model text", {
        finishReason: reason,
        candidates: geminiJson.candidates?.length ?? 0,
        fullResponse: geminiJson,
      })
      return NextResponse.json(
        {
          error: stringifyGoogleResponseForError(
            {
              reason: "empty_or_missing_text",
              finishReason: reason ?? null,
              rawGeminiResponse: geminiJson,
            },
            JSON.stringify(geminiJson),
            200
          ),
        },
        { status: 500 }
      )
    }

    let parsed: unknown
    try {
      parsed = extractModelJsonPayload(text)
    } catch (e) {
      const msg = e instanceof Error ? e.message : "פרסור JSON נכשל"
      console.error("[ocr-invoice] line-items JSON parse", text.slice(0, 500))
      return NextResponse.json(
        {
          error: `פרסור תשובת AI נכשל: ${msg}\n--- model text ---\n${text.slice(0, 3000)}`,
        },
        { status: 500 }
      )
    }

    let payload: ReturnType<typeof parseInvoicePayload>
    try {
      payload = parseInvoicePayload(parsed)
    } catch (e) {
      const msg = e instanceof Error ? e.message : "מבנה תשובה לא תקין"
      return NextResponse.json({ error: msg }, { status: 500 })
    }

    return NextResponse.json({
      metadata: payload.metadata,
      items: payload.items,
      meta: {
        originalFileName: file.name,
        originalSizeBytes: file.size,
        originalType: fileType,
        model: `${GEMINI_REST_MODEL} (rest)`,
      },
    })
  } catch (error) {
    console.error("[ocr-invoice] unexpected", error)
    const message =
      error instanceof Error ? error.message : String(error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
