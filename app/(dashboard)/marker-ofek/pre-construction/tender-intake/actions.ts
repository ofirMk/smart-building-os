"use server"

import { randomUUID } from "crypto"
import { revalidatePath } from "next/cache"

import { formatError } from "@/lib/format-error"
import {
  aggregateTenderHeaderFromExtractions,
  analyzeSingleTenderDocument,
  extractionToDbFields,
  resolveTenderFileMediaType,
  synthesizeBuildingStructure,
} from "@/lib/marker-ofek/tender-intake-gemini"
import type {
  BuildingStructureRawData,
  MoTenderDocumentStatus,
  MoTenderDocumentType,
  SingleDocumentAiExtraction,
} from "@/lib/marker-ofek/tender-intake-types"
import { createSupabaseServerAuthClient } from "@/lib/supabase/server-auth"

const REVALIDATE = "/marker-ofek/pre-construction/tender-intake"

const TENDER_DOCUMENTS_BUCKET =
  process.env.TENDER_DOCUMENTS_STORAGE_BUCKET?.trim() || "tender_documents"

function sanitizeFileName(name: string): string {
  const t = name.trim().replace(/[^\w.\u0590-\u05FF-]+/g, "_")
  return t.slice(0, 180) || "document"
}

function rowToExtraction(row: {
  ai_inferred_name: string | null
  ai_inferred_date: string | null
  status: string
  document_type: string
  floors_data: unknown
  tags: string[] | null
}): SingleDocumentAiExtraction {
  const fd = row.floors_data as {
    labels?: string[]
    vertical_hints?: string[]
    ai_consultant?: string
  } | null
  const st = row.status as SingleDocumentAiExtraction["status"]
  const dt = row.document_type as SingleDocumentAiExtraction["document_type"]
  return {
    project_name: row.ai_inferred_name ?? "",
    document_date: row.ai_inferred_date ?? "",
    consultant_or_engineer:
      typeof fd?.ai_consultant === "string" ? fd.ai_consultant.trim() : "",
    status:
      st === "to_execution" || st === "for_review" || st === "for_tender"
        ? st
        : "unknown",
    status_evidence: "",
    document_type:
      dt === "boq" ||
      dt === "tech_spec" ||
      dt === "sale_spec" ||
      dt === "drawing_electrical" ||
      dt === "drawing_general"
        ? dt
        : "unknown",
    floors_mentioned: Array.isArray(fd?.labels) ? fd!.labels! : [],
    tags: row.tags ?? [],
    vertical_hints: Array.isArray(fd?.vertical_hints) ? fd!.vertical_hints! : [],
  }
}

export async function createTenderSession(): Promise<
  { ok: true; tenderId: string } | { ok: false; error: string }
> {
  try {
    const supabase = await createSupabaseServerAuthClient()
    const { data, error } = await supabase
      .from("tenders")
      .insert({})
      .select("id")
      .single()

    if (error) return { ok: false, error: error.message }
    revalidatePath(REVALIDATE)
    return { ok: true, tenderId: data.id as string }
  } catch (e) {
    return { ok: false, error: formatError(e) }
  }
}

export async function listRecentTenders(limit = 20): Promise<
  | {
      ok: true
      tenders: Array<{
        id: string
        project_name_from_ai: string | null
        created_at: string
        updated_at: string
      }>
    }
  | { ok: false; error: string }
> {
  try {
    const supabase = await createSupabaseServerAuthClient()
    const { data, error } = await supabase
      .from("tenders")
      .select("id, project_name_from_ai, created_at, updated_at")
      .order("updated_at", { ascending: false })
      .limit(limit)

    if (error) return { ok: false, error: error.message }
    return { ok: true, tenders: (data ?? []) as never[] }
  } catch (e) {
    return { ok: false, error: formatError(e) }
  }
}

export async function getTenderBundle(tenderId: string): Promise<
  | {
      ok: true
      tender: {
        id: string
        project_name_from_ai: string | null
        tender_date_target: string | null
        consultant_name_from_ai: string | null
        building_structure_raw_data: BuildingStructureRawData | Record<string, unknown>
        created_at: string
        updated_at: string
      }
      documents: Array<{
        id: string
        tender_id: string
        file_path: string
        file_name: string
        ai_inferred_name: string | null
        ai_inferred_date: string | null
        status: MoTenderDocumentStatus
        floors_data: { labels: string[]; vertical_hints?: string[] }
        document_type: MoTenderDocumentType
        tags: string[]
      }>
    }
  | { ok: false; error: string }
> {
  try {
    const supabase = await createSupabaseServerAuthClient()
    const { data: tender, error: tErr } = await supabase
      .from("tenders")
      .select("*")
      .eq("id", tenderId)
      .maybeSingle()
    if (tErr) return { ok: false, error: tErr.message }
    if (!tender) return { ok: false, error: "מכרז לא נמצא" }

    const { data: docs, error: dErr } = await supabase
      .from("tender_documents")
      .select("*")
      .eq("tender_id", tenderId)
      .order("file_name", { ascending: true })

    if (dErr) return { ok: false, error: dErr.message }

    return {
      ok: true,
      tender: tender as never,
      documents: (docs ?? []) as never[],
    }
  } catch (e) {
    return { ok: false, error: formatError(e) }
  }
}

/**
 * קובץ בודד: העלאה ל-Object Storage תחילה, ניתוח Gemini בזיכרון, שורה ב-Postgres עם path + מטא-דאטה בלבד.
 */
export async function uploadAndProcessOneTenderDocument(
  tenderId: string,
  formData: FormData
): Promise<
  { ok: true; documentId: string } | { ok: false; error: string }
> {
  try {
    const supabase = await createSupabaseServerAuthClient()
    const f = formData.get("file")
    if (!(f instanceof File) || f.size === 0) {
      return { ok: false, error: "לא נבחר קובץ" }
    }

    try {
      resolveTenderFileMediaType(f)
    } catch (e) {
      return { ok: false, error: formatError(e) }
    }

    const { data: tenderRow, error: tCheck } = await supabase
      .from("tenders")
      .select("id")
      .eq("id", tenderId)
      .maybeSingle()
    if (tCheck) return { ok: false, error: tCheck.message }
    if (!tenderRow) return { ok: false, error: "מכרז לא נמצא" }

    const storagePath = `${tenderId}/${randomUUID()}-${sanitizeFileName(f.name)}`
    const contentType = resolveTenderFileMediaType(f)

    const { error: upErr } = await supabase.storage
      .from(TENDER_DOCUMENTS_BUCKET)
      .upload(storagePath, f, {
        upsert: false,
        contentType,
      })
    if (upErr) {
      return { ok: false, error: `העלאת קובץ נכשלה: ${upErr.message}` }
    }

    let extraction: SingleDocumentAiExtraction
    try {
      extraction = await analyzeSingleTenderDocument(f)
    } catch (e) {
      await supabase.storage.from(TENDER_DOCUMENTS_BUCKET).remove([storagePath])
      return { ok: false, error: formatError(e) }
    }

    const dbFields = extractionToDbFields(extraction)

    const { data: inserted, error: insErr } = await supabase
      .from("tender_documents")
      .insert({
        tender_id: tenderId,
        file_path: storagePath,
        file_name: f.name,
        ai_inferred_name: dbFields.ai_inferred_name,
        ai_inferred_date: dbFields.ai_inferred_date,
        status: dbFields.status,
        document_type: dbFields.document_type,
        floors_data: dbFields.floors_data,
        tags: dbFields.tags,
      })
      .select("id")
      .single()

    if (insErr) {
      await supabase.storage.from(TENDER_DOCUMENTS_BUCKET).remove([storagePath])
      return { ok: false, error: insErr.message }
    }

    revalidatePath(REVALIDATE)
    return { ok: true, documentId: inserted.id as string }
  } catch (e) {
    return { ok: false, error: formatError(e) }
  }
}

/** לאחר סיום עיבוד אצווה — סיכום כותרת מכרז + מודל בניין מכל המסמכים */
export async function finalizeTenderIntakeSession(
  tenderId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const supabase = await createSupabaseServerAuthClient()
    const { data: allDocRows, error: listErr } = await supabase
      .from("tender_documents")
      .select(
        "ai_inferred_name, ai_inferred_date, status, document_type, floors_data, tags"
      )
      .eq("tender_id", tenderId)
    if (listErr) return { ok: false, error: listErr.message }

    const extractions = (allDocRows ?? []).map((r) =>
      rowToExtraction(r as never)
    )
    if (extractions.length === 0) {
      revalidatePath(REVALIDATE)
      return { ok: true }
    }

    const header = aggregateTenderHeaderFromExtractions(extractions)
    const building = await synthesizeBuildingStructure(extractions)

    const { error: upTenderErr } = await supabase
      .from("tenders")
      .update({
        project_name_from_ai: header.project_name_from_ai,
        tender_date_target: header.tender_date_target,
        consultant_name_from_ai: header.consultant_name_from_ai,
        building_structure_raw_data: building as unknown as Record<
          string,
          unknown
        >,
      })
      .eq("id", tenderId)

    if (upTenderErr) return { ok: false, error: upTenderErr.message }

    revalidatePath(REVALIDATE)
    return { ok: true }
  } catch (e) {
    return { ok: false, error: formatError(e) }
  }
}

/**
 * מעלה עד 15 קבצים בבת אחת (אותה לוגיקה כמו לולאת קבצים בודדים + סינתזה בסוף).
 */
export async function analyzeTenderDocuments(
  tenderId: string,
  formData: FormData
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const raw = formData.getAll("files")
    const files = raw.filter((x): x is File => x instanceof File && x.size > 0)
    if (files.length === 0) return { ok: false, error: "לא נבחרו קבצים" }
    if (files.length > 15) {
      return { ok: false, error: "ניתן להעלות עד 15 קבצים בבת אחת" }
    }

    for (const file of files) {
      const fd = new FormData()
      fd.append("file", file)
      const one = await uploadAndProcessOneTenderDocument(tenderId, fd)
      if (!one.ok) return { ok: false, error: one.error }
    }

    const fin = await finalizeTenderIntakeSession(tenderId)
    if (!fin.ok) return { ok: false, error: fin.error }
    return { ok: true }
  } catch (e) {
    return { ok: false, error: formatError(e) }
  }
}

export async function updateTenderDocumentManual(input: {
  documentId: string
  tenderId: string
  ai_inferred_name?: string | null
  ai_inferred_date?: string | null
  status?: MoTenderDocumentStatus
  document_type?: MoTenderDocumentType
  floor_labels?: string[]
  tags?: string[]
}): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const supabase = await createSupabaseServerAuthClient()
    const patch: Record<string, unknown> = {}
    if (input.ai_inferred_name !== undefined)
      patch.ai_inferred_name = input.ai_inferred_name
    if (input.ai_inferred_date !== undefined)
      patch.ai_inferred_date = input.ai_inferred_date || null
    if (input.status !== undefined) patch.status = input.status
    if (input.document_type !== undefined)
      patch.document_type = input.document_type
    if (input.floor_labels !== undefined) {
      const { data: cur, error: curErr } = await supabase
        .from("tender_documents")
        .select("floors_data")
        .eq("id", input.documentId)
        .eq("tender_id", input.tenderId)
        .maybeSingle()
      if (curErr) return { ok: false, error: curErr.message }
      const prev =
        cur?.floors_data && typeof cur.floors_data === "object"
          ? (cur.floors_data as Record<string, unknown>)
          : {}
      patch.floors_data = {
        ...prev,
        labels: input.floor_labels,
      }
    }
    if (input.tags !== undefined) patch.tags = input.tags

    const { error } = await supabase
      .from("tender_documents")
      .update(patch)
      .eq("id", input.documentId)
      .eq("tender_id", input.tenderId)

    if (error) return { ok: false, error: error.message }
    revalidatePath(REVALIDATE)
    return { ok: true }
  } catch (e) {
    return { ok: false, error: formatError(e) }
  }
}

/** לאחר תיקון ידני — לחשב מחדש מודל בניין מכל המסמכים */
export async function rebuildTenderBuildingModel(
  tenderId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const supabase = await createSupabaseServerAuthClient()
    const { data: allDocRows, error: listErr } = await supabase
      .from("tender_documents")
      .select(
        "ai_inferred_name, ai_inferred_date, status, document_type, floors_data, tags"
      )
      .eq("tender_id", tenderId)
    if (listErr) return { ok: false, error: listErr.message }

    const extractions = (allDocRows ?? []).map((r) =>
      rowToExtraction(r as never)
    )
    if (extractions.length === 0) {
      return { ok: false, error: "אין מסמכים לחישוב מודל" }
    }

    const header = aggregateTenderHeaderFromExtractions(extractions)
    const building = await synthesizeBuildingStructure(extractions)

    const { error } = await supabase
      .from("tenders")
      .update({
        project_name_from_ai: header.project_name_from_ai,
        tender_date_target: header.tender_date_target,
        consultant_name_from_ai: header.consultant_name_from_ai,
        building_structure_raw_data: building as unknown as Record<
          string,
          unknown
        >,
      })
      .eq("id", tenderId)

    if (error) return { ok: false, error: error.message }
    revalidatePath(REVALIDATE)
    return { ok: true }
  } catch (e) {
    return { ok: false, error: formatError(e) }
  }
}
