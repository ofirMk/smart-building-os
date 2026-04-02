/**
 * Gemini extraction for tender documents via @google/generative-ai (server-only).
 * Uses GEMINI_API_KEY — see .env.example
 */
import { GoogleGenerativeAI } from "@google/generative-ai"

import { extractModelJsonPayload } from "@/lib/ocr-invoice/parse-model-json"

import type {
  BuildingStructureRawData,
  MoTenderDocumentStatus,
  MoTenderDocumentType,
  SingleDocumentAiExtraction,
} from "@/lib/marker-ofek/tender-intake-types"

const GEMINI_MODEL = "gemini-1.5-flash"
export const MAX_TENDER_FILE_BYTES = 15 * 1024 * 1024

const SINGLE_DOC_PROMPT = `You are an expert Israeli construction / tender document analyst. Analyze this engineering drawing, specification, or bill of quantities (PDF page or image).

Focus on:
1) **Title block / legend** (usually bottom-right or right strip on drawings): extract Project Name (שם הפרויקט), drawing/document date, and consultant or engineer name (יועץ / מהנדס / משרד).
2) **Status stamps or handwritten/printed markings** in Hebrew:
   - "לביצוע" or similar → status "to_execution"
   - "לעיון" or similar → status "for_review"
   - "למכרז" or similar → status "for_tender"
   If unclear, use "unknown".
3) **Document type** (choose one):
   - "boq" — bill of quantities / כתב כמויות
   - "tech_spec" — technical specification / מפרט טכני
   - "sale_spec" — sales / marketing spec / מפרט שיווקי
   - "drawing_electrical" — electrical drawing
   - "drawing_general" — architectural / structural / general plan
   If unclear, use "unknown".
4) **Floors** mentioned in titles or notes (e.g. "קומה 3", "B-1", "גג", "מרתף") as a string array floors_mentioned.
5) **Tags**: short Hebrew keywords (discipline, systems). Use English only when no Hebrew equivalent exists in the source.
6) **vertical_hints**: short Hebrew phrases about vertical composition if inferable from this doc only (e.g. "חניון תת-קרקעי", "קומות מגורים").

Return ONLY valid JSON (no markdown fences):
{
  "project_name": "string",
  "document_date": "YYYY-MM-DD or empty string",
  "consultant_or_engineer": "string",
  "status": "to_execution" | "for_review" | "for_tender" | "unknown",
  "status_evidence": "short quote from document",
  "document_type": "boq" | "tech_spec" | "sale_spec" | "drawing_electrical" | "drawing_general" | "unknown",
  "floors_mentioned": ["string"],
  "tags": ["string"],
  "vertical_hints": ["string"]
}`

const SYNTHESIS_PROMPT = `You synthesize a **vertical building model** for a tender package from multiple document extractions (JSON array input). Each item has project_name, document_date, consultant_or_engineer, document_type, floors_mentioned, vertical_hints.

Tasks:
1) Pick the best consensus for **summary_he** (one Hebrew sentence describing the building).
2) Build **segments** ordered from **roof to basement** (order_from_top: 0 = top/roof, increment downward). Use segment_type: roof | parking | ground | residential | commercial | basement | mechanical | other.
3) Each segment needs: id (slug), label_he (Hebrew), order_from_top, optional floor_range, optional notes.
4) Keep all narrative output in Hebrew (summary_he, label_he, notes).

Return ONLY valid JSON:
{
  "summary_he": "string",
  "segments": [
    {
      "id": "roof",
      "label_he": "גג",
      "segment_type": "roof",
      "order_from_top": 0,
      "floor_range": "",
      "notes": ""
    }
  ]
}`

function normalizeStatus(s: unknown): MoTenderDocumentStatus {
  const v = String(s ?? "").trim()
  if (v === "to_execution" || v === "for_review" || v === "for_tender") return v
  return "for_review"
}

function normalizeDocType(s: unknown): MoTenderDocumentType {
  const v = String(s ?? "").trim()
  const ok: MoTenderDocumentType[] = [
    "boq",
    "tech_spec",
    "sale_spec",
    "drawing_electrical",
    "drawing_general",
  ]
  if (ok.includes(v as MoTenderDocumentType)) return v as MoTenderDocumentType
  return "tech_spec"
}

function coerceExtraction(o: Record<string, unknown>): SingleDocumentAiExtraction {
  const statusRaw = String(o.status ?? "unknown").trim()
  const status =
    statusRaw === "to_execution" ||
    statusRaw === "for_review" ||
    statusRaw === "for_tender" ||
    statusRaw === "unknown"
      ? (statusRaw as SingleDocumentAiExtraction["status"])
      : "unknown"

  const docTypeRaw = String(o.document_type ?? "unknown").trim()
  const allowedDoc: MoTenderDocumentType[] = [
    "boq",
    "tech_spec",
    "sale_spec",
    "drawing_electrical",
    "drawing_general",
  ]
  const document_type: SingleDocumentAiExtraction["document_type"] =
    docTypeRaw === "unknown" || !allowedDoc.includes(docTypeRaw as MoTenderDocumentType)
      ? "unknown"
      : (docTypeRaw as MoTenderDocumentType)

  const floors = Array.isArray(o.floors_mentioned)
    ? (o.floors_mentioned as unknown[]).map((x) => String(x).trim()).filter(Boolean)
    : []
  const tags = Array.isArray(o.tags)
    ? (o.tags as unknown[]).map((x) => String(x).trim()).filter(Boolean)
    : []
  const vertical_hints = Array.isArray(o.vertical_hints)
    ? (o.vertical_hints as unknown[]).map((x) => String(x).trim()).filter(Boolean)
    : []

  return {
    project_name: String(o.project_name ?? "").trim(),
    document_date: String(o.document_date ?? "").trim(),
    consultant_or_engineer: String(o.consultant_or_engineer ?? "").trim(),
    status,
    status_evidence: String(o.status_evidence ?? "").trim(),
    document_type: document_type === "unknown" ? "unknown" : normalizeDocType(document_type),
    floors_mentioned: floors,
    tags,
    vertical_hints,
  }
}

async function generateTextFromParts(
  apiKey: string,
  parts: Array<string | { inlineData: { mimeType: string; data: string } }>
): Promise<string> {
  const genAI = new GoogleGenerativeAI(apiKey)
  const model = genAI.getGenerativeModel({ model: GEMINI_MODEL })
  const result = await model.generateContent(parts)
  const text = result.response.text()?.trim()
  if (!text) {
    throw new Error("תשובה ריקה מ-Gemini")
  }
  return text
}

export async function analyzeSingleTenderDocumentFromBuffer(
  buffer: Buffer,
  mimeType: string
): Promise<SingleDocumentAiExtraction> {
  const apiKey = process.env.GEMINI_API_KEY?.trim()
  if (!apiKey) {
    throw new Error(
      "שגיאת אבטחה: המפתח הסודי אינו נגיש. אנא ודא שהגדרות השרת תקינות."
    )
  }
  if (buffer.length === 0) throw new Error("קובץ ריק")
  if (buffer.length > MAX_TENDER_FILE_BYTES) {
    throw new Error(
      `קובץ גדול מדי (מקסימום ${Math.round(MAX_TENDER_FILE_BYTES / (1024 * 1024))}MB)`
    )
  }

  const fileType = mimeType.trim().toLowerCase()
  const isPdf = fileType === "application/pdf"
  const isImage =
    fileType === "image/png" ||
    fileType === "image/jpeg" ||
    fileType === "image/jpg"
  if (!isPdf && !isImage) {
    throw new Error("נתמכים רק PDF או תמונות PNG/JPEG")
  }

  const base64String = buffer.toString("base64")

  const mimeForGemini = fileType === "image/jpg" ? "image/jpeg" : fileType
  const text = await generateTextFromParts(apiKey, [
    SINGLE_DOC_PROMPT,
    { inlineData: { mimeType: mimeForGemini, data: base64String } },
  ])

  const parsed = extractModelJsonPayload(text)
  if (!parsed || typeof parsed !== "object") {
    throw new Error("מבנה JSON לא תקין מתשובת המודל")
  }
  return coerceExtraction(parsed as Record<string, unknown>)
}

export async function analyzeSingleTenderDocument(
  file: File
): Promise<SingleDocumentAiExtraction> {
  if (file.size === 0) throw new Error("קובץ ריק")
  if (file.size > MAX_TENDER_FILE_BYTES) {
    throw new Error(
      `קובץ גדול מדי (מקסימום ${Math.round(MAX_TENDER_FILE_BYTES / (1024 * 1024))}MB)`
    )
  }
  const mime = resolveTenderFileMediaType(file)
  const buf = Buffer.from(await file.arrayBuffer())
  return analyzeSingleTenderDocumentFromBuffer(buf, mime)
}

/** Strict: .pdf, .png, .jpg, .jpeg only */
export function resolveMimeFromFileName(name: string): string {
  const n = name.toLowerCase()
  if (n.endsWith(".pdf")) return "application/pdf"
  if (n.endsWith(".png")) return "image/png"
  if (n.endsWith(".jpg") || n.endsWith(".jpeg")) return "image/jpeg"
  throw new Error("יש להעלות PDF או תמונה (PNG, JPEG) בלבד")
}

export function resolveTenderFileMediaType(file: File): string {
  const t = file.type?.trim().toLowerCase()
  if (t && t !== "application/octet-stream") {
    const allowed =
      t === "application/pdf" ||
      t === "image/png" ||
      t === "image/jpeg" ||
      t === "image/jpg"
    if (allowed) return t === "image/jpg" ? "image/jpeg" : t
  }
  return resolveMimeFromFileName(file.name)
}

export async function synthesizeBuildingStructure(
  extractions: SingleDocumentAiExtraction[]
): Promise<BuildingStructureRawData> {
  const apiKey = process.env.GEMINI_API_KEY?.trim()
  if (!apiKey) {
    throw new Error("שגיאת אבטחה: המפתח הסודי אינו נגיש. אנא ודא שהגדרות השרת תקינות.")
  }

  const payload = extractions.map((e) => ({
    project_name: e.project_name,
    document_date: e.document_date,
    consultant_or_engineer: e.consultant_or_engineer,
    document_type: e.document_type,
    floors_mentioned: e.floors_mentioned,
    vertical_hints: e.vertical_hints,
    tags: e.tags,
  }))

  const text = await generateTextFromParts(apiKey, [
    `${SYNTHESIS_PROMPT}\n\nINPUT (JSON array):\n${JSON.stringify(payload, null, 2)}`,
  ])

  const parsed = extractModelJsonPayload(text) as Record<string, unknown>
  const summary_he = String(parsed.summary_he ?? "").trim()
  const rawSegs = Array.isArray(parsed.segments) ? parsed.segments : []
  const segments: BuildingStructureRawData["segments"] = []
  let i = 0
  for (const row of rawSegs) {
    if (!row || typeof row !== "object") continue
    const r = row as Record<string, unknown>
    const id = String(r.id ?? `seg-${i}`).trim() || `seg-${i}`
    const label_he = String(r.label_he ?? r.label ?? "").trim() || `קטע ${i + 1}`
    const segment_type = String(r.segment_type ?? "other").trim() || "other"
    const order =
      typeof r.order_from_top === "number" && Number.isFinite(r.order_from_top)
        ? r.order_from_top
        : i
    segments.push({
      id,
      label_he,
      segment_type,
      order_from_top: order,
      floor_range:
        typeof r.floor_range === "string" ? r.floor_range : undefined,
      notes: typeof r.notes === "string" ? r.notes : undefined,
    })
    i += 1
  }

  segments.sort((a, b) => a.order_from_top - b.order_from_top)

  if (segments.length === 0) {
    return {
      summary_he: summary_he || "לא נמצא מודל אנכי — נסו להעלות שרטוטים או מפרטים נוספים.",
      segments: [
        {
          id: "unknown",
          label_he: "מבנה (לא מפורט)",
          segment_type: "other",
          order_from_top: 0,
        },
      ],
    }
  }

  return { summary_he, segments }
}

function parseIsoDate(s: unknown): string | null {
  const raw = typeof s === "string" ? s.trim() : ""
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw
  if (!raw) return null
  const d = new Date(raw)
  if (Number.isNaN(d.getTime())) return null
  return d.toISOString().slice(0, 10)
}

/** מיפוי לשמירה ב-DB */
export function extractionToDbFields(e: SingleDocumentAiExtraction): {
  ai_inferred_name: string | null
  ai_inferred_date: string | null
  status: MoTenderDocumentStatus
  document_type: MoTenderDocumentType
  floors_data: {
    labels: string[]
    vertical_hints?: string[]
    ai_consultant?: string
  }
  tags: string[]
} {
  const c = e.consultant_or_engineer?.trim()
  return {
    ai_inferred_name: e.project_name || null,
    ai_inferred_date: parseIsoDate(e.document_date),
    status:
      e.status === "unknown" ? "for_review" : normalizeStatus(e.status),
    document_type:
      e.document_type === "unknown"
        ? "tech_spec"
        : normalizeDocType(e.document_type),
    floors_data: {
      labels: e.floors_mentioned,
      vertical_hints: e.vertical_hints.length ? e.vertical_hints : undefined,
      ai_consultant: c || undefined,
    },
    tags: e.tags.slice(0, 24),
  }
}

export function aggregateTenderHeaderFromExtractions(
  extractions: SingleDocumentAiExtraction[]
): {
  project_name_from_ai: string | null
  tender_date_target: string | null
  consultant_name_from_ai: string | null
} {
  const names = extractions.map((e) => e.project_name).filter(Boolean)
  const project_name_from_ai =
    names.length > 0
      ? names.reduce((a, b) =>
          a.length >= b.length ? a : b
        )
      : null

  const dates = extractions
    .map((e) => parseIsoDate(e.document_date))
    .filter((d): d is string => d != null)
    .sort()
  const tender_date_target = dates.length > 0 ? dates[dates.length - 1] : null

  const consultants = extractions
    .map((e) => e.consultant_or_engineer.trim())
    .filter(Boolean)
  const consultant_name_from_ai =
    consultants.length > 0
      ? consultants.reduce((a, b) => (a.length >= b.length ? a : b))
      : null

  return {
    project_name_from_ai,
    tender_date_target,
    consultant_name_from_ai,
  }
}
