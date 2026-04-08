import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"

function sanitizeFolderPart(s: string, maxLen: number): string {
  const t = s
    .trim()
    .replace(/[\\/:*?"<>|[\]]/g, "_")
    .replace(/\s+/g, "_")
    .slice(0, maxLen)
  return t || "unknown"
}

/**
 * תיקיית כספת פרויקט לחשבונית: [Date]_[Client]_[Invoice#]
 */
export function buildInvoiceVaultFolderTitle(input: {
  issueDate: string
  clientName: string
  invoiceNumber: number
}): string {
  const date = sanitizeFolderPart(input.issueDate, 12)
  const client = sanitizeFolderPart(input.clientName, 48)
  const num = String(Math.floor(input.invoiceNumber))
  return `${date}_${client}_${num}`
}

/**
 * יוצר תיקייה וירטואלית ב־project_documents (אידמפוטנטי לפי כותרת + פרויקט).
 */
export async function ensureFinanceInvoiceVaultFolder(params: {
  supabase: SupabaseClient
  projectId: string
  title: string
}): Promise<{ ok: true; documentId: string | null } | { ok: false; error: string }> {
  const pid = params.projectId.trim()
  const title = params.title.trim()
  if (!pid || !title) {
    return { ok: true, documentId: null }
  }

  try {
    const { data: existing, error: exErr } = await params.supabase
      .from("project_documents")
      .select("id")
      .eq("project_id", pid)
      .eq("is_folder", true)
      .eq("title", title)
      .maybeSingle()

    if (exErr) {
      return { ok: false, error: exErr.message }
    }
    if (existing?.id) {
      return { ok: true, documentId: String(existing.id) }
    }

    const versionGroupId = crypto.randomUUID()
    const { data: ins, error: insErr } = await params.supabase
      .from("project_documents")
      .insert({
        project_id: pid,
        file_path: null,
        title,
        document_kind: "חשבוניות",
        mime_type: null,
        is_folder: true,
        vault_folder_key: null,
        version_group_id: versionGroupId,
        version_number: 1,
        is_current: true,
        parent_document_id: null,
      })
      .select("id")
      .single()

    if (insErr || !ins?.id) {
      return { ok: false, error: insErr?.message ?? "יצירת תיקייה נכשלה" }
    }

    return { ok: true, documentId: String(ins.id) }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { ok: false, error: msg }
  }
}
