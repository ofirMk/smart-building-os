"use server"

import { revalidatePath } from "next/cache"

import {
  embedTextForContractVault,
  extractContractPlainText,
  vectorToPgString,
} from "@/lib/marker-ofek/contract-vault/gemini-contract-ingest"
import {
  CONTRACT_VAULT_BUCKET,
  type VaultDocumentRow,
  type VaultSensitiveLevel,
} from "@/lib/marker-ofek/contract-vault/vault-constants"
import { createSupabaseServerAuthClient } from "@/lib/supabase/server-auth"
import { formatError } from "@/lib/utils"

export async function listContractVaultDocuments(projectId: string): Promise<
  { ok: true; rows: VaultDocumentRow[] } | { ok: false; error: string }
> {
  try {
    const pid = projectId.trim()
    if (!pid) return { ok: false, error: "חסר פרויקט" }
    const supabase = await createSupabaseServerAuthClient()
    const { data, error } = await supabase
      .from("mo_contract_vault_documents")
      .select(
        "id, project_id, storage_path, file_name, mime_type, file_size_bytes, sensitive_level, viewer_admin, viewer_manager, viewer_partner, ingest_status, ocr_text, ingest_error, created_at"
      )
      .eq("project_id", pid)
      .order("created_at", { ascending: false })
      .limit(100)

    if (error) {
      if (/relation|does not exist/i.test(error.message)) {
        return { ok: true, rows: [] }
      }
      throw error
    }
    return { ok: true, rows: (data ?? []) as VaultDocumentRow[] }
  } catch (e) {
    return { ok: false, error: formatError(e) }
  }
}

/**
 * אחרי העלאה ל-Storage: רישום שורה + הרצת חילוץ טקסט ו-embedding (Gemini).
 */
export async function finalizeContractVaultUpload(input: {
  projectId: string
  storagePath: string
  fileName: string
  mimeType: string
  fileSizeBytes: number
  sensitiveLevel: VaultSensitiveLevel
  viewerAdmin: boolean
  viewerManager: boolean
  viewerPartner: boolean
}): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  if (
    !input.viewerAdmin &&
    !input.viewerManager &&
    !input.viewerPartner
  ) {
    return { ok: false, error: "נדרשת לפחות קבוצת צפייה אחת" }
  }

  try {
    const supabase = await createSupabaseServerAuthClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user?.id) return { ok: false, error: "נדרשת התחברות" }

    const { data: row, error: insErr } = await supabase
      .from("mo_contract_vault_documents")
      .insert({
        project_id: input.projectId.trim(),
        storage_path: input.storagePath.trim(),
        file_name: input.fileName.trim(),
        mime_type: input.mimeType.trim() || "application/octet-stream",
        file_size_bytes: Math.max(0, Math.floor(input.fileSizeBytes)),
        sensitive_level: input.sensitiveLevel,
        viewer_admin: input.viewerAdmin,
        viewer_manager: input.viewerManager,
        viewer_partner: input.viewerPartner,
        ingest_status: "processing",
        uploaded_by: user.id,
      })
      .select("id")
      .single()

    if (insErr) throw insErr
    const id = (row as { id: string }).id

    /** Gemini OCR / embedding — לא חוסם את תגובת המשתמש */
    void runContractVaultIngestionInternal(id).catch(() => {})

    revalidatePath("/marker-ofek/finance/contract-vault")
    return { ok: true, id }
  } catch (e) {
    return { ok: false, error: formatError(e) }
  }
}

async function runContractVaultIngestionInternal(documentId: string): Promise<void> {
  const supabase = await createSupabaseServerAuthClient()
  const { data: doc, error: fetchErr } = await supabase
    .from("mo_contract_vault_documents")
    .select("id, storage_path, mime_type")
    .eq("id", documentId)
    .single()

  if (fetchErr || !doc) return

  const row = doc as {
    id: string
    storage_path: string
    mime_type: string
  }

  try {
    const { data: blob, error: dlErr } = await supabase.storage
      .from(CONTRACT_VAULT_BUCKET)
      .download(row.storage_path)

    if (dlErr || !blob) throw dlErr ?? new Error("הורדה נכשלה")

    const buf = await blob.arrayBuffer()
    const base64 = Buffer.from(buf).toString("base64")
    const mime = row.mime_type || "application/pdf"

    let text = ""
    try {
      text = await extractContractPlainText({ mimeType: mime, base64 })
    } catch {
      text =
        mime.startsWith("text/") || mime === "application/json"
          ? new TextDecoder("utf-8", { fatal: false }).decode(buf)
          : ""
    }

    let embeddingStr: string | null = null
    if (text.length > 0) {
      try {
        const vec = await embedTextForContractVault(text)
        if (vec.length > 0) embeddingStr = vectorToPgString(vec)
      } catch {
        /* embedding אופציונלי */
      }
    }

    const basePatch = {
      ingest_status: "ready" as const,
      ocr_text: text || null,
      ingest_error: null,
      updated_at: new Date().toISOString(),
    }

    if (embeddingStr) {
      const { error: embErr } = await supabase
        .from("mo_contract_vault_documents")
        .update({ ...basePatch, embedding: embeddingStr })
        .eq("id", row.id)
      if (!embErr) return
    }

    const { error: upErr } = await supabase
      .from("mo_contract_vault_documents")
      .update(basePatch)
      .eq("id", row.id)

    if (upErr) throw upErr
  } catch (e) {
    await supabase
      .from("mo_contract_vault_documents")
      .update({
        ingest_status: "failed",
        ingest_error: formatError(e).slice(0, 2000),
        updated_at: new Date().toISOString(),
      })
      .eq("id", documentId)
  }
}
