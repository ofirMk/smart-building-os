"use server"

/**
 * ניתוח מסמכי מכרז ב-Google Gemini (@google/generative-ai).
 *
 * דרישות סביבה: GEMINI_API_KEY (ראו .env.example)
 * מודל: gemini-2.5-flash (@google/generative-ai)
 */
import { GoogleGenerativeAI } from "@google/generative-ai"
import { revalidatePath } from "next/cache"

import { extractModelJsonPayload } from "@/lib/ocr-invoice/parse-model-json"
import { formatError } from "@/lib/format-error"
import type {
  BuildingStructureRawData,
  MoTenderDocumentStatus,
  MoTenderDocumentType,
  TenderDocumentFloorsData,
} from "@/lib/marker-ofek/tender-intake-types"
import {
  analyzeSingleTenderDocument,
  resolveMimeFromFileName,
  synthesizeBuildingStructure,
} from "@/lib/marker-ofek/tender-intake-gemini-sdk"
import type { SingleDocumentAiExtraction } from "@/lib/marker-ofek/tender-intake-types"
import { createSupabaseServerAuthClient } from "@/lib/supabase/server-auth"

const TENDER_INTAKE_PATH = "/marker-ofek/pre-construction/tender-intake"

const STORAGE_BUCKET =
  process.env.TENDER_DOCUMENTS_STORAGE_BUCKET?.trim() || "tender_documents"

const ESTIMATOR_PROMPT = `You are a Chief Estimator and Civil Engineer. Analyze this construction document or engineering drawing.

Your reply must be ONLY a single valid JSON object — raw text, no markdown, no code fences, no prose before or after.
Never use \`\`\`json or \`\`\` or any wrapper. Never add labels like "Here is the JSON".

Use exactly this JSON shape (types as described):
{
  "project_name": string | null,
  "consultant_name": string | null,
  "document_date": "YYYY-MM-DD" | null,
  "document_type": "boq" | "tech_spec" | "sale_spec" | "drawing_electrical" | "drawing_general" | null,
  "status": "to_execution" | "for_review" | "for_tender",
  "floors_data": string[]
}

Rules:
- project_name: from title block / project title when visible.
- consultant_name: engineer / consultant office if shown.
- document_date: ISO date only if you can infer a single date; else null.
- document_type: classify strictly as one of the six literals above (use null only if impossible).
- status: map Hebrew stamps/text to: to_execution (לביצוע / execution), for_review (לעיון / review), for_tender (למכרז / tender). If unclear, use "for_review".
- floors_data: vertical structure mentioned (e.g. roof, floors, basement levels). Use short English or Hebrew strings as found. Empty array if none.

If a field cannot be determined, use null or [] as appropriate.

Output: print only the JSON object, nothing else.`

function parseIsoDate(s: unknown): string | null {
  if (typeof s !== "string") return null
  const t = s.trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t
  const d = new Date(t)
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10)
}

function coerceDocType(s: unknown): MoTenderDocumentType {
  const v = String(s ?? "").trim()
  const ok: MoTenderDocumentType[] = [
    "boq",
    "tech_spec",
    "sale_spec",
    "drawing_electrical",
    "drawing_general",
  ]
  return ok.includes(v as MoTenderDocumentType)
    ? (v as MoTenderDocumentType)
    : "tech_spec"
}

function coerceStatus(s: unknown): MoTenderDocumentStatus {
  const v = String(s ?? "").trim()
  if (v === "to_execution" || v === "for_review" || v === "for_tender") return v
  return "for_review"
}

/** MIME ל-Gemini inlineData — לפי סיומת בלבד (Gemini מחמיר; Storage עלול להחזיר octet-stream). */
function mimeFromTenderStoragePath(filePath: string): string {
  const base = filePath.split("/").pop()?.trim() || "document.pdf"
  const lower = base.toLowerCase()
  if (lower.endsWith(".pdf")) return "application/pdf"
  if (lower.endsWith(".png")) return "image/png"
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg"
  return resolveMimeFromFileName(base)
}

function slugSegmentId(label: string, order: number): string {
  const slug = label
    .trim()
    .toLowerCase()
    .replace(/[^\w\u0590-\u05ff-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
  return slug || `seg-${order}`
}

function mergeBuildingStructureRaw(
  existing: unknown,
  floorLabels: string[]
): BuildingStructureRawData {
  const prev =
    existing &&
    typeof existing === "object" &&
    Array.isArray((existing as BuildingStructureRawData).segments)
      ? { ...(existing as BuildingStructureRawData) }
      : ({ segments: [] } satisfies BuildingStructureRawData)

  const segments = [...(prev.segments ?? [])]
  const seen = new Set(
    segments.map((s) => s.label_he.trim().toLowerCase())
  )
  let orderNext =
    segments.length > 0
      ? Math.max(...segments.map((s) => s.order_from_top), -1) + 1
      : 0

  for (const raw of floorLabels) {
    const label = String(raw).trim()
    if (!label) continue
    const key = label.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    segments.push({
      id: slugSegmentId(label, orderNext),
      label_he: label,
      segment_type: "other",
      order_from_top: orderNext,
    })
    orderNext += 1
  }

  const summary_he =
    (typeof prev.summary_he === "string" && prev.summary_he.trim()) ||
    (segments.length
      ? `מבנה אנכי (מסמכים): ${segments
          .slice(0, 10)
          .map((s) => s.label_he)
          .join(" · ")}`
      : "")

  return { ...prev, summary_he, segments }
}

type GeminiTenderJson = {
  project_name?: string | null
  consultant_name?: string | null
  document_date?: string | null
  document_type?: string | null
  status?: string | null
  floors_data?: unknown
}

function parseGeminiTenderPayload(
  raw: unknown
): {
  ai_inferred_name: string | null
  ai_inferred_date: string | null
  status: MoTenderDocumentStatus
  document_type: MoTenderDocumentType
  floors_data: TenderDocumentFloorsData
} {
  const o = raw as GeminiTenderJson
  const floors = Array.isArray(o.floors_data)
    ? (o.floors_data as unknown[])
        .map((x) => String(x).trim())
        .filter(Boolean)
    : []

  return {
    ai_inferred_name:
      typeof o.project_name === "string" && o.project_name.trim()
        ? o.project_name.trim()
        : null,
    ai_inferred_date: parseIsoDate(o.document_date),
    status: coerceStatus(o.status),
    document_type: coerceDocType(o.document_type),
    floors_data: {
      labels: floors,
      ai_consultant:
        typeof o.consultant_name === "string" && o.consultant_name.trim()
          ? o.consultant_name.trim()
          : undefined,
    },
  }
}

async function markDocumentAiFailed(documentId: string): Promise<void> {
  const supabase = await createSupabaseServerAuthClient()
  await supabase
    .from("tender_documents")
    .update({ status: "ai_failed" })
    .eq("id", documentId)
}

/**
 * ניתוח מלא: הורדה מ-Storage → Gemini → עדכון tender_documents ו-tenders (מיזוג מודל אנכי).
 */
export async function processTenderDocumentAI(
  documentId: string,
  tenderId: string,
  filePath: string
): Promise<{ success: true } | { success: false; error: string }> {
  const apiKey = process.env.GEMINI_API_KEY?.trim()
  if (!apiKey) {
    await markDocumentAiFailed(documentId)
    revalidatePath(TENDER_INTAKE_PATH)
    return { success: false, error: "חסר GEMINI_API_KEY" }
  }

  const supabase = await createSupabaseServerAuthClient()

  try {
    const { data: blob, error: dlErr } = await supabase.storage
      .from(STORAGE_BUCKET)
      .download(filePath)

    if (dlErr || !blob) {
      const msg = dlErr?.message ?? "הורדת קובץ נכשלה"
      await markDocumentAiFailed(documentId)
      revalidatePath(TENDER_INTAKE_PATH)
      return { success: false, error: msg }
    }

    const buf = Buffer.from(await blob.arrayBuffer())
    let mime: string
    try {
      mime = mimeFromTenderStoragePath(filePath)
    } catch (e) {
      const err = formatError(e)
      await markDocumentAiFailed(documentId)
      revalidatePath(TENDER_INTAKE_PATH)
      return { success: false, error: err }
    }

    const genAI = new GoogleGenerativeAI(apiKey)
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" })
    const base64Data = buf.toString("base64")
    const mimeForPart = mime === "image/jpg" ? "image/jpeg" : mime

    const result = await model.generateContent([
      { text: ESTIMATOR_PROMPT },
      {
        inlineData: {
          mimeType: mimeForPart,
          data: base64Data,
        },
      },
    ])

    const text = result.response.text()?.trim()

    if (!text) {
      await markDocumentAiFailed(documentId)
      revalidatePath(TENDER_INTAKE_PATH)
      return { success: false, error: "תשובת מודל ריקה" }
    }

    let extracted: {
      ai_inferred_name: string | null
      ai_inferred_date: string | null
      status: MoTenderDocumentStatus
      document_type: MoTenderDocumentType
      floors_data: TenderDocumentFloorsData
    }

    try {
      const parsed = extractModelJsonPayload(text)
      if (!parsed || typeof parsed !== "object") {
        throw new Error("מבנה JSON לא תקין")
      }
      extracted = parseGeminiTenderPayload(parsed)
    } catch (_parseErr) {
      extracted = {
        ai_inferred_name: null,
        ai_inferred_date: null,
        status: "for_review",
        document_type: "tech_spec",
        floors_data: { labels: [] },
      }
    }

    const { error: docErr } = await supabase
      .from("tender_documents")
      .update({
        ai_inferred_name: extracted.ai_inferred_name,
        ai_inferred_date: extracted.ai_inferred_date,
        status: extracted.status,
        document_type: extracted.document_type,
        floors_data: extracted.floors_data as unknown as Record<
          string,
          unknown
        >,
      })
      .eq("id", documentId)
      .eq("tender_id", tenderId)

    if (docErr) {
      await markDocumentAiFailed(documentId)
      revalidatePath(TENDER_INTAKE_PATH)
      return { success: false, error: docErr.message }
    }

    const { data: tenderRow, error: tErr } = await supabase
      .from("tenders")
      .select(
        "id, project_name_from_ai, consultant_name_from_ai, tender_date_target, building_structure_raw_data"
      )
      .eq("id", tenderId)
      .maybeSingle()

    if (tErr || !tenderRow) {
      revalidatePath(TENDER_INTAKE_PATH)
      return { success: true }
    }

    const t = tenderRow as {
      project_name_from_ai: string | null
      consultant_name_from_ai: string | null
      tender_date_target: string | null
      building_structure_raw_data: unknown
    }

    const patch: Record<string, unknown> = {}

    if (!t.project_name_from_ai?.trim() && extracted.ai_inferred_name) {
      patch.project_name_from_ai = extracted.ai_inferred_name
    }
    if (
      !t.consultant_name_from_ai?.trim() &&
      extracted.floors_data.ai_consultant
    ) {
      patch.consultant_name_from_ai = extracted.floors_data.ai_consultant
    }
    if (!t.tender_date_target && extracted.ai_inferred_date) {
      patch.tender_date_target = extracted.ai_inferred_date
    }

    const merged = mergeBuildingStructureRaw(
      t.building_structure_raw_data,
      extracted.floors_data.labels
    )
    patch.building_structure_raw_data = merged as unknown as Record<
      string,
      unknown
    >

    if (Object.keys(patch).length > 0) {
      await supabase.from("tenders").update(patch).eq("id", tenderId)
    }

    revalidatePath("/marker-ofek/pre-construction/tender-intake")
    return { success: true }
  } catch (e) {
    console.error("[tender-ai] Fatal Error in processTenderDocumentAI:", e)
    const err = formatError(e)
    await markDocumentAiFailed(documentId)
    revalidatePath(TENDER_INTAKE_PATH)
    return { success: false, error: err }
  }
}

/** ניתוח קובץ בודד מהטופס (שדה `file`) — לשימוש בדיקות / זרימות מותאמות */
export async function extractTenderDocumentGeminiFromFormAction(
  formData: FormData
): Promise<
  | { ok: true; extraction: SingleDocumentAiExtraction }
  | { ok: false; error: string }
> {
  try {
    const f = formData.get("file")
    if (!(f instanceof File) || f.size === 0) {
      return { ok: false, error: "לא נבחר קובץ" }
    }
    const extraction = await analyzeSingleTenderDocument(f)
    return { ok: true, extraction }
  } catch (e) {
    return { ok: false, error: formatError(e) }
  }
}

/**
 * ניתוח מנתיב אחסון: מוריד את הקובץ בשרת (ללא שמירת buffer ב-DB) ושולח ל-Gemini.
 * דורש הרשאת קריאה ל-bucket (משתמש מחובר).
 */
export async function extractTenderDocumentGeminiFromStoragePathAction(input: {
  storagePath: string
  fileName: string
}): Promise<
  | { ok: true; extraction: SingleDocumentAiExtraction }
  | { ok: false; error: string }
> {
  try {
    const bucket = STORAGE_BUCKET
    const supabase = await createSupabaseServerAuthClient()
    const { data, error } = await supabase.storage
      .from(bucket)
      .download(input.storagePath)
    if (error) return { ok: false, error: error.message }
    if (!data) return { ok: false, error: "הורדה ריקה" }

    const buf = Buffer.from(await data.arrayBuffer())
    const t = data.type?.trim()
    let mime: string
    try {
      mime =
        t && t !== "application/octet-stream"
          ? t
          : resolveMimeFromFileName(input.fileName)
    } catch (e) {
      return { ok: false, error: formatError(e) }
    }
    const { analyzeSingleTenderDocumentFromBuffer } = await import(
      "@/lib/marker-ofek/tender-intake-gemini-sdk"
    )
    const extraction = await analyzeSingleTenderDocumentFromBuffer(buf, mime)
    return { ok: true, extraction }
  } catch (e) {
    return { ok: false, error: formatError(e) }
  }
}

export async function synthesizeTenderBuildingFromExtractionsAction(
  extractions: SingleDocumentAiExtraction[]
): Promise<
  | { ok: true; building: Awaited<ReturnType<typeof synthesizeBuildingStructure>> }
  | { ok: false; error: string }
> {
  try {
    if (extractions.length === 0) {
      return { ok: false, error: "אין חילוצים לסינתזה" }
    }
    const building = await synthesizeBuildingStructure(extractions)
    return { ok: true, building }
  } catch (e) {
    return { ok: false, error: formatError(e) }
  }
}
