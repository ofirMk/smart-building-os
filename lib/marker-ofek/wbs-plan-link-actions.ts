"use server"

import { createSupabaseServerAuthClient } from "@/lib/supabase/server-auth"
import { revalidatePath } from "next/cache"

import type { MarkerOfekProjectDocumentRow } from "@/types/marker-ofek"
import {
  VAULT_DEFAULT_FOLDERS,
  vaultFolderKeyOrder,
} from "@/lib/marker-ofek/vault-default-folders"

const DOCS_BUCKET =
  process.env.NEXT_PUBLIC_PROJECT_DOCUMENTS_BUCKET?.trim() || "project_documents"

export type PlanLinkRow = {
  link_id: string
  document: MarkerOfekProjectDocumentRow
}

/** יוצר את ארבע תיקיות הכספת אם חסרות (אידמפוטנטי). */
export async function ensureProjectVaultDefaultFolders(projectId: string): Promise<void> {
  const pid = String(projectId ?? "").trim()
  if (!pid) return
  const supabase = await createSupabaseServerAuthClient()
  await ensureDefaultVaultFoldersForProjectId(supabase, pid)
}

async function ensureDefaultVaultFoldersForProjectId(
  supabase: Awaited<ReturnType<typeof createSupabaseServerAuthClient>>,
  projectId: string
) {
  const pid = String(projectId ?? "").trim()
  if (!pid) return
  for (const f of VAULT_DEFAULT_FOLDERS) {
    const { data: existing, error: exErr } = await supabase
      .schema("public")
      .from("project_documents")
      .select("id")
      .eq("project_id", pid)
      .eq("vault_folder_key", f.key)
      .maybeSingle()
    if (exErr) throw new Error(exErr.message)
    if (existing?.id) continue
    const versionGroupId = crypto.randomUUID()
    const { error: insErr } = await supabase.schema("public").from("project_documents").insert({
      project_id: pid,
      file_path: null,
      title: f.title,
      document_kind: f.title,
      mime_type: null,
      is_folder: true,
      vault_folder_key: f.key,
      version_group_id: versionGroupId,
      version_number: 1,
      is_current: true,
      parent_document_id: null,
    })
    if (insErr) throw new Error(insErr.message)
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
  const supabase = await createSupabaseServerAuthClient()
  await ensureDefaultVaultFoldersForProjectId(supabase, pid)
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
