"use server"

import { createSupabaseServerAuthClient } from "@/lib/supabase/server-auth"
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role"
import { revalidatePath } from "next/cache"
import type { SupabaseClient } from "@supabase/supabase-js"

import type { MarkerOfekProjectDocumentRow } from "@/types/marker-ofek"
import type { PlanLinkRow } from "@/lib/marker-ofek/wbs-plan-link-types"
import {
  VAULT_DEFAULT_FOLDERS,
  vaultFolderKeyOrder,
} from "@/lib/marker-ofek/vault-default-folders"

const DOCS_BUCKET =
  process.env.NEXT_PUBLIC_PROJECT_DOCUMENTS_BUCKET?.trim() || "project_documents"

/** יוצר את ארבע תיקיות הכספת אם חסרות (אידמפוטנטי). */
export async function ensureProjectVaultDefaultFolders(projectId: string): Promise<void> {
  const pid = String(projectId ?? "").trim()
  if (!pid) return
  try {
    // Bootstrap folders are system-level defaults; use service role to bypass RLS safely.
    const supabase = createSupabaseServiceRoleClient()

    // Preflight: silently skip "ghost" projects (FK target missing). Avoids
    // noisy 23503 foreign-key-violation logs on demo / hardcoded UUIDs that
    // do not exist in `projects` for the current environment. This protects
    // the investor pitch from spurious console.error noise.
    const { data: projectExists, error: existsErr } = await supabase
      .schema("public")
      .from("projects")
      .select("id")
      .eq("id", pid)
      .maybeSingle()
    if (existsErr) throw existsErr
    if (!projectExists) return

    await ensureDefaultVaultFoldersForProjectId(supabase, pid)
  } catch (error) {
    // Never crash Project Hub for vault bootstrap drift; log a single rich
    // line and continue. The payload is guaranteed to be human-readable
    // even when `error` is not a standard PostgrestError.
    const sbError = toSupabaseErrorPayload(error)
    console.warn("[vault:init] failed to ensure default folders", {
      projectId: pid,
      message: sbError.message,
      code: sbError.code,
      details: sbError.details,
      hint: sbError.hint,
      status: sbError.status,
    })
  }
}

/**
 * Normalise *anything* (PostgrestError / Error / string / random object) into a
 * single payload that always contains a non-empty `message`. This is what makes
 * the dev console show meaningful text instead of a confusing `{}`.
 */
function toSupabaseErrorPayload(error: unknown): {
  message: string
  code: string | null
  details: string | null
  hint: string | null
  status: number | null
} {
  // Primitive / null / undefined → stringify directly.
  if (error == null) {
    return {
      message: "unknown error (null/undefined)",
      code: null,
      details: null,
      hint: null,
      status: null,
    }
  }
  if (typeof error !== "object") {
    return {
      message: String(error),
      code: null,
      details: null,
      hint: null,
      status: null,
    }
  }

  const row = error as Record<string, unknown>
  const code = typeof row.code === "string" ? row.code : null
  const details = typeof row.details === "string" ? row.details : null
  const hint = typeof row.hint === "string" ? row.hint : null
  const status = typeof row.status === "number" ? row.status : null

  // Resolve a meaningful `message` even when the object is opaque.
  let message: string
  if (error instanceof Error && error.message) {
    message = error.message
  } else if (typeof row.message === "string" && row.message) {
    message = row.message
  } else if (details) {
    message = details
  } else {
    // Last resort: serialize the object so the dev console never sees `{}`.
    try {
      message = JSON.stringify(error)
      if (message === "{}") message = error.constructor?.name ?? "unknown error"
    } catch {
      message = error.constructor?.name ?? "unknown error"
    }
  }

  return { message, code, details, hint, status }
}

async function ensureDefaultVaultFoldersForProjectId(
  supabase: SupabaseClient,
  projectId: string
) {
  const pid = String(projectId ?? "").trim()
  if (!pid) return
  const defaultFolderRows = VAULT_DEFAULT_FOLDERS.map((folder) => ({
    project_id: pid,
    file_path: null,
    title: folder.title,
    document_kind: folder.title,
    mime_type: "application/x-directory",
    size: null,
    is_folder: true,
    vault_folder_key: folder.key,
    version_group_id: crypto.randomUUID(),
    version_number: 1,
    is_current: true,
    parent_document_id: null,
  }))

  const upsertResult = await supabase
    .schema("public")
    .from("project_documents")
    .upsert(defaultFolderRows, {
      onConflict: "project_id,vault_folder_key",
      ignoreDuplicates: true,
    })

  if (!upsertResult.error) return
  // Fallback path when `onConflict` is unsupported/missing unique index.
  if (upsertResult.error.code !== "42P10") {
    if (upsertResult.error.code === "23505") return
    throw upsertResult.error
  }

  const { data: existingRows, error: exErr } = await supabase
    .schema("public")
    .from("project_documents")
    .select("vault_folder_key")
    .eq("project_id", pid)
    .eq("is_folder", true)
    .not("vault_folder_key", "is", null)

  if (exErr) throw exErr

  const existingKeys = new Set(
    (existingRows ?? [])
      .map((row) =>
        (row as { vault_folder_key?: string | null }).vault_folder_key == null
          ? ""
          : String((row as { vault_folder_key?: string | null }).vault_folder_key).trim()
      )
      .filter(Boolean)
  )

  const missingFolders = VAULT_DEFAULT_FOLDERS.filter(
    (folder) => !existingKeys.has(folder.key)
  )

  for (const f of missingFolders) {
    const versionGroupId = crypto.randomUUID()
    const { error: insErr } = await supabase.schema("public").from("project_documents").insert({
      project_id: pid,
      file_path: null,
      title: f.title,
      document_kind: f.title,
      mime_type: "application/x-directory",
      size: null,
      is_folder: true,
      vault_folder_key: f.key,
      version_group_id: versionGroupId,
      version_number: 1,
      is_current: true,
      parent_document_id: null,
    })
    if (insErr) {
      // Race-safe idempotency: another request inserted this folder first.
      if (insErr.code === "23505") continue
      throw insErr
    }
  }
}

async function structureProjectIdForNode(
  supabase: Awaited<ReturnType<typeof createSupabaseServerAuthClient>>,
  wbsNodeId: string
): Promise<{ projectId: string | null; isTemplate: boolean } | null> {
  const { data: node, error: nErr } = await supabase
    .schema("public")
    .from("wbs_nodes")
    .select("id, structure_id")
    .eq("id", wbsNodeId)
    .maybeSingle()
  if (nErr || !node?.structure_id) return null
  const { data: st, error: sErr } = await supabase
    .schema("public")
    .from("wbs_structures")
    .select("id, project_id, is_template")
    .eq("id", String(node.structure_id))
    .maybeSingle()
  if (sErr || !st) return null
  return {
    projectId: st.project_id == null ? null : String(st.project_id),
    isTemplate: Boolean(st.is_template),
  }
}

export async function listVaultDocumentsForProject(
  projectId: string
): Promise<MarkerOfekProjectDocumentRow[]> {
  const pid = String(projectId ?? "").trim()
  if (!pid) return []
  await ensureProjectVaultDefaultFolders(pid)
  const supabase = await createSupabaseServerAuthClient()
  const { data, error } = await supabase
    .schema("public")
    .from("project_documents")
    .select(
      "id, project_id, title, file_path, document_kind, mime_type, created_at, version_group_id, version_number, is_current, parent_document_id, updated_at, is_folder, vault_folder_key"
    )
    .eq("project_id", pid)
    .order("created_at", { ascending: false })
  if (error) throw new Error(error.message)
  const rows = (data ?? []) as MarkerOfekProjectDocumentRow[]
  return [...rows].sort((a, b) => {
    const fa = Boolean(a.is_folder)
    const fb = Boolean(b.is_folder)
    if (fa !== fb) return fa ? -1 : 1
    if (fa && fb) {
      return vaultFolderKeyOrder(a.vault_folder_key) - vaultFolderKeyOrder(b.vault_folder_key)
    }
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  })
}

/** All `wbs_node_id` values under this structure that have ≥1 vault link. */
export async function listWbsNodeIdsWithPlanLinksForStructure(structureId: string): Promise<string[]> {
  const sid = String(structureId ?? "").trim()
  if (!sid) return []
  const supabase = await createSupabaseServerAuthClient()
  const { data: nodes, error: nErr } = await supabase
    .schema("public")
    .from("wbs_nodes")
    .select("id")
    .eq("structure_id", sid)
  if (nErr) throw new Error(nErr.message)
  const nodeIds = (nodes ?? []).map((r: { id: string }) => String(r.id)).filter(Boolean)
  if (nodeIds.length === 0) return []

  const { data: links, error: lErr } = await supabase
    .schema("public")
    .from("project_plan_links")
    .select("wbs_node_id")
    .in("wbs_node_id", nodeIds)
  if (lErr) throw new Error(lErr.message)
  const withLinks = new Set<string>()
  for (const row of links ?? []) {
    const id = String((row as { wbs_node_id?: string }).wbs_node_id ?? "").trim()
    if (id) withLinks.add(id)
  }
  return [...withLinks]
}

export async function listPlanLinksForWbsNode(wbsNodeId: string): Promise<PlanLinkRow[]> {
  const nid = String(wbsNodeId ?? "").trim()
  if (!nid) return []
  const supabase = await createSupabaseServerAuthClient()
  const { data, error } = await supabase
    .schema("public")
    .from("project_plan_links")
    .select(
      "id, document_id, project_documents ( id, project_id, title, file_path, document_kind, mime_type, created_at, version_group_id, version_number, is_current, parent_document_id, updated_at, is_folder, vault_folder_key )"
    )
    .eq("wbs_node_id", nid)
  if (error) throw new Error(error.message)
  const out: PlanLinkRow[] = []
  for (const row of data ?? []) {
    const doc = (row as { id: string; document_id: string; project_documents: unknown })
      .project_documents
    const d = Array.isArray(doc) ? doc[0] : doc
    if (d && typeof d === "object" && "id" in d) {
      out.push({ link_id: String((row as { id: string }).id), document: d as MarkerOfekProjectDocumentRow })
    }
  }
  return out
}

export async function addPlanLink(wbsNodeId: string, documentId: string) {
  const nid = String(wbsNodeId ?? "").trim()
  const did = String(documentId ?? "").trim()
  if (!nid || !did) throw new Error("חסר צומת או מסמך")
  const supabase = await createSupabaseServerAuthClient()

  const ctx = await structureProjectIdForNode(supabase, nid)
  if (!ctx) throw new Error("צומת WBS לא נמצא")
  if (ctx.isTemplate || !ctx.projectId) {
    throw new Error("קישור מסמכים זמין רק למבנה משויך לפרויקט (לא תבנית)")
  }

  const { data: doc, error: dErr } = await supabase
    .schema("public")
    .from("project_documents")
    .select("id, project_id, is_folder, file_path")
    .eq("id", did)
    .maybeSingle()
  if (dErr || !doc) throw new Error("מסמך לא נמצא")
  if (Boolean((doc as { is_folder?: boolean }).is_folder) || (doc as { file_path?: string | null }).file_path == null) {
    throw new Error("לא ניתן לצרף תיקייה — בחרו קובץ")
  }
  if (String(doc.project_id) !== ctx.projectId) {
    throw new Error("המסמך אינו שייך לאותו פרויקט כמו המבנה")
  }

  const { error } = await supabase.schema("public").from("project_plan_links").insert({
    wbs_node_id: nid,
    document_id: did,
  })
  if (error) {
    if (error.code === "23505") return { ok: true as const, duplicate: true as const }
    throw new Error(error.message)
  }
  revalidatePath("/marker-ofek/tenders/wbs")
  return { ok: true as const, duplicate: false as const }
}

export async function removePlanLink(wbsNodeId: string, documentId: string) {
  const nid = String(wbsNodeId ?? "").trim()
  const did = String(documentId ?? "").trim()
  if (!nid || !did) throw new Error("חסר צומת או מסמך")
  const supabase = await createSupabaseServerAuthClient()
  const { error } = await supabase
    .schema("public")
    .from("project_plan_links")
    .delete()
    .eq("wbs_node_id", nid)
    .eq("document_id", did)
  if (error) throw new Error(error.message)
  revalidatePath("/marker-ofek/tenders/wbs")
  return { ok: true as const }
}

export async function listPlanDocumentsForTask(taskId: string): Promise<PlanLinkRow[]> {
  const tid = String(taskId ?? "").trim()
  if (!tid) return []
  const supabase = await createSupabaseServerAuthClient()
  const { data: task, error: tErr } = await supabase
    .schema("public")
    .from("tasks")
    .select("id, project_id, source_wbs_node_id")
    .eq("id", tid)
    .maybeSingle()
  if (tErr || !task) return []
  const src = task.source_wbs_node_id == null ? null : String(task.source_wbs_node_id).trim()
  if (!src) return []
  const links = await listPlanLinksForWbsNode(src)
  const pid = String(task.project_id ?? "").trim()
  return links.filter(
    (L) =>
      String(L.document.project_id) === pid &&
      !L.document.is_folder &&
      L.document.file_path != null
  )
}

export async function getProjectDocumentSignedUrl(
  documentId: string,
  expiresSec = 3600
): Promise<{ url: string; mimeType: string | null }> {
  const did = String(documentId ?? "").trim()
  if (!did) throw new Error("מסמך לא נבחר")
  const supabase = await createSupabaseServerAuthClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error("נדרשת התחברות")

  const { data: doc, error } = await supabase
    .schema("public")
    .from("project_documents")
    .select("id, file_path, mime_type, is_folder")
    .eq("id", did)
    .maybeSingle()
  if (error || !doc) throw new Error("מסמך לא נמצא")
  if (Boolean(doc.is_folder) || doc.file_path == null || String(doc.file_path).trim() === "") {
    throw new Error("תיקייה ללא קובץ — אין קישור צפייה")
  }

  const { data: signed, error: sErr } = await supabase.storage
    .from(DOCS_BUCKET)
    .createSignedUrl(String(doc.file_path), Math.min(Math.max(expiresSec, 60), 7200))
  if (sErr || !signed?.signedUrl) throw new Error(sErr?.message ?? "לא ניתן ליצור קישור צפייה")

  return {
    url: signed.signedUrl,
    mimeType: doc.mime_type == null ? null : String(doc.mime_type),
  }
}
