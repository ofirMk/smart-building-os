"use server"

import { randomUUID } from "node:crypto"

import { revalidatePath } from "next/cache"

import { createSupabaseServerClient } from "@/lib/supabase/server"
import type { DocumentRelatedTo, DocumentType } from "@/types/documents"

export type DocumentUploadState = {
  ok: boolean
  message: string
}

const DOC_TYPES: DocumentType[] = [
  "lease",
  "warranty",
  "building_plans",
  "general",
]

const RELATED: DocumentRelatedTo[] = [
  "tenant",
  "vendor",
  "building",
  "general",
]

function isDocType(v: string): v is DocumentType {
  return DOC_TYPES.includes(v as DocumentType)
}

function isRelated(v: string): v is DocumentRelatedTo {
  return RELATED.includes(v as DocumentRelatedTo)
}

/** סיומת קובץ ASCII בלבד לנתיב אחסון (ללא שם המקור — מונע "Invalid key" ב-Supabase). */
function getAsciiFileExtension(originalName: string): string {
  const lastDot = originalName.lastIndexOf(".")
  if (lastDot <= 0 || lastDot === originalName.length - 1) {
    return "bin"
  }
  const raw = originalName.slice(lastDot + 1)
  const ascii = raw.replace(/[^a-zA-Z0-9]/g, "")
  if (!ascii) {
    return "bin"
  }
  return ascii.slice(0, 32).toLowerCase()
}

export async function uploadDocument(
  _prev: DocumentUploadState,
  formData: FormData
): Promise<DocumentUploadState> {
  const title = String(formData.get("title") ?? "").trim()
  const documentType = String(formData.get("document_type") ?? "").trim()
  const relatedTo = String(formData.get("related_to") ?? "").trim()
  const file = formData.get("file")

  if (!title) {
    return { ok: false, message: "נא למלא כותרת למסמך." }
  }
  if (!isDocType(documentType)) {
    return { ok: false, message: "סוג מסמך לא חוקי." }
  }
  if (!isRelated(relatedTo)) {
    return { ok: false, message: "שיוך לא חוקי." }
  }
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, message: "נא לבחור קובץ להעלאה." }
  }

  const maxBytes = 50 * 1024 * 1024
  if (file.size > maxBytes) {
    return { ok: false, message: "הקובץ גדול מדי (מקסימום 50 מ״ב)." }
  }

  const ext = getAsciiFileExtension(file.name)
  const storagePath = `${randomUUID()}.${ext}`

  const supabase = createSupabaseServerClient()

  const { error: uploadError } = await supabase.storage
    .from("documents")
    .upload(storagePath, file, {
      contentType: file.type || "application/octet-stream",
      upsert: false,
    })

  if (uploadError) {
    return {
      ok: false,
      message: `העלאה נכשלה: ${uploadError.message}`,
    }
  }

  const { data: pub } = supabase.storage.from("documents").getPublicUrl(storagePath)
  const fileUrl = pub.publicUrl

  const { error: insertError } = await supabase.from("documents").insert({
    title,
    document_type: documentType,
    related_to: relatedTo,
    file_url: fileUrl,
    storage_path: storagePath,
    file_name: file.name,
    content_type: file.type || null,
  })

  if (insertError) {
    await supabase.storage.from("documents").remove([storagePath])
    return {
      ok: false,
      message: `שמירת הרשומה נכשלה: ${insertError.message}`,
    }
  }

  revalidatePath("/documents")
  return { ok: true, message: "המסמך הועלה ונרשם בהצלחה." }
}
