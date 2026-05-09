import { cookies } from "next/headers"

import { COMPANY_COOKIE_KEY, resolveCompanyContext } from "@/lib/company-context"
import { createSupabaseServerAuthClient } from "@/lib/supabase/server-auth"
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role"
import { formatError } from "@/lib/utils"

import {
  DMS_DEFAULT_FOLDERS,
  DMS_OWNER_CAPABILITIES,
} from "./dms-constants"
import type {
  DmsBrowserBootstrap,
  DmsCapability,
  DmsDocumentSummary,
  DmsDocumentVersion,
  DmsFolder,
} from "./dms-types"

type ProjectRow = {
  id: string
  name: string | null
  internal_project_code: string | null
}

type DmsFolderRow = {
  id: string
  company_id: string
  project_id: string
  parent_folder_id: string | null
  name: string
  path_cache: string
  kind: DmsFolder["kind"]
  vault_folder_key: string | null
  default_acl_template_id: string | null
  created_at: string
  updated_at: string
}

type DmsDocumentRow = {
  id: string
  company_id: string
  project_id: string
  folder_id: string
  title: string
  document_kind: DmsDocumentSummary["documentKind"]
  current_version_id: string | null
  confidentiality_level: DmsDocumentSummary["confidentialityLevel"]
  tags: string[] | null
  created_at: string
  updated_at: string
  current_version?: DmsDocumentVersionRow | DmsDocumentVersionRow[] | null
}

type DmsDocumentVersionRow = {
  id: string
  document_id: string
  version_number: number
  storage_bucket: DmsDocumentVersion["storageBucket"]
  storage_path: string
  mime_type: string
  size_bytes: number
  checksum_sha256: string
  original_filename: string
  uploaded_by: string | null
  uploaded_at: string
  change_note: string | null
  is_quarantined: boolean
  archived_at: string | null
}

function mapFolder(row: DmsFolderRow): DmsFolder {
  return {
    id: row.id,
    companyId: row.company_id,
    projectId: row.project_id,
    parentFolderId: row.parent_folder_id,
    name: row.name,
    pathCache: row.path_cache,
    kind: row.kind,
    vaultFolderKey: row.vault_folder_key,
    defaultAclTemplateId: row.default_acl_template_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function mapVersion(row: DmsDocumentVersionRow): DmsDocumentVersion {
  return {
    id: row.id,
    documentId: row.document_id,
    versionNumber: row.version_number,
    storageBucket: row.storage_bucket,
    storagePath: row.storage_path,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    checksumSha256: row.checksum_sha256,
    originalFilename: row.original_filename,
    uploadedBy: row.uploaded_by,
    uploadedAt: row.uploaded_at,
    changeNote: row.change_note,
    isQuarantined: row.is_quarantined,
    archivedAt: row.archived_at,
  }
}

function mapDocument(row: DmsDocumentRow): DmsDocumentSummary {
  /**
   * Supabase returns `current_version` as either an object (single FK) or an array
   * depending on the join direction. Normalize defensively.
   */
  const cv = Array.isArray(row.current_version)
    ? row.current_version[0] ?? null
    : row.current_version ?? null

  return {
    id: row.id,
    companyId: row.company_id,
    projectId: row.project_id,
    folderId: row.folder_id,
    title: row.title,
    documentKind: row.document_kind,
    currentVersionId: row.current_version_id,
    confidentialityLevel: row.confidentiality_level,
    tags: row.tags ?? [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    currentVersion: cv ? mapVersion(cv) : null,
  }
}

/**
 * Resolve active company id from the session cookie. The DMS strictly requires a
 * company context (multi-tenant safety) so this never silently falls back.
 */
async function getActiveCompanyIdFromCookie(): Promise<string | null> {
  const store = await cookies()
  const raw = store.get(COMPANY_COOKIE_KEY)?.value
  return resolveCompanyContext(raw)
}

/**
 * Bootstrap step 1 — ensure the 9 default folders exist for this project.
 * Idempotent: relies on the unique index `(project_id, parent, lower(name))`.
 * Runs as service-role so it works even before any ACL exists.
 */
async function ensureDefaultFolders(args: {
  companyId: string
  projectId: string
}): Promise<DmsFolderRow[]> {
  const admin = createSupabaseServiceRoleClient()

  /** Look up existing root folders first (fast path — no inserts on warm projects). */
  const existing = await admin
    .from("dms_folders")
    .select(
      "id, company_id, project_id, parent_folder_id, name, path_cache, kind, vault_folder_key, default_acl_template_id, created_at, updated_at"
    )
    .eq("project_id", args.projectId)
    .is("parent_folder_id", null)
    .is("deleted_at", null)

  if (existing.error) {
    throw new Error(`Failed to load DMS folders: ${existing.error.message}`)
  }

  const existingByKey = new Set(
    (existing.data ?? []).map(
      (r) => (r as DmsFolderRow).vault_folder_key ?? `__name:${(r as DmsFolderRow).name}`
    )
  )

  const missing = DMS_DEFAULT_FOLDERS.filter(
    (def) => !existingByKey.has(def.vaultFolderKey)
  )

  if (missing.length > 0) {
    const insertRows = missing.map((def) => ({
      company_id: args.companyId,
      project_id: args.projectId,
      parent_folder_id: null,
      name: def.name,
      kind: "SYSTEM" as const,
      vault_folder_key: def.vaultFolderKey,
      path_cache: "", // recalculated by trigger on insert
    }))

    const { error: insErr } = await admin
      .from("dms_folders")
      .insert(insertRows)
      .select("id")
    if (insErr && !/duplicate key/i.test(insErr.message)) {
      throw new Error(`Failed to bootstrap DMS folders: ${insErr.message}`)
    }
  }

  /** Re-read to return the canonical set including the just-inserted ones. */
  const reread = await admin
    .from("dms_folders")
    .select(
      "id, company_id, project_id, parent_folder_id, name, path_cache, kind, vault_folder_key, default_acl_template_id, created_at, updated_at"
    )
    .eq("project_id", args.projectId)
    .is("parent_folder_id", null)
    .is("deleted_at", null)
    .order("name", { ascending: true })

  if (reread.error) {
    throw new Error(`Failed to reload DMS folders: ${reread.error.message}`)
  }

  return (reread.data ?? []) as DmsFolderRow[]
}

/**
 * Bootstrap step 2 — ensure the calling user has full ACL on each root folder.
 * Idempotent: unique index `(scope_type, scope_id, principal_type, lower(principal_id))`.
 * The user is implicitly trusted because we already verified company membership upstream
 * (in master-data-api). Children inherit via `inherits_to_descendants=true`.
 */
async function ensureUserAclOnRootFolders(args: {
  companyId: string
  userId: string
  rootFolders: DmsFolderRow[]
}): Promise<void> {
  if (args.rootFolders.length === 0) return
  const admin = createSupabaseServiceRoleClient()

  const rows = args.rootFolders.map((f) => ({
    company_id: args.companyId,
    scope_type: "FOLDER" as const,
    scope_id: f.id,
    principal_type: "USER" as const,
    principal_id: args.userId,
    capabilities: [...DMS_OWNER_CAPABILITIES],
    inherits_to_descendants: true,
  }))

  const { error } = await admin
    .from("dms_acl_entries")
    .upsert(rows, {
      onConflict: "scope_type,scope_id,principal_type,principal_id",
      ignoreDuplicates: true,
    })

  /** Some Postgres builds report unique violation on duplicate path. Treat as success. */
  if (error && !/duplicate|unique|conflict/i.test(error.message)) {
    throw new Error(`Failed to grant DMS root ACL: ${error.message}`)
  }
}

/**
 * Compute the union of capabilities the user has on the root folders. Used by the UI
 * to gate affordances such as "upload" and "create folder".
 */
async function loadRootCapabilities(args: {
  userId: string
  rootFolderIds: string[]
}): Promise<DmsCapability[]> {
  if (args.rootFolderIds.length === 0) return []
  const admin = createSupabaseServiceRoleClient()
  const { data, error } = await admin
    .from("dms_acl_entries")
    .select("capabilities, expires_at")
    .eq("principal_type", "USER")
    .eq("principal_id", args.userId)
    .eq("scope_type", "FOLDER")
    .in("scope_id", args.rootFolderIds)

  if (error) return []

  const now = Date.now()
  const set = new Set<DmsCapability>()
  for (const row of (data ?? []) as Array<{
    capabilities: string[] | null
    expires_at: string | null
  }>) {
    if (row.expires_at && new Date(row.expires_at).getTime() <= now) continue
    for (const c of row.capabilities ?? []) set.add(c as DmsCapability)
  }
  return [...set]
}

/**
 * Page-level loader called from the Server Component. Returns everything needed
 * to render the initial DMS browser shell. Throws if access is denied.
 */
export async function loadDmsBrowserBootstrap(
  projectId: string
): Promise<{ ok: true; data: DmsBrowserBootstrap } | { ok: false; error: string }> {
  try {
    const trimmed = projectId.trim()
    if (!trimmed) return { ok: false, error: "מזהה פרויקט חסר" }

    const supabase = await createSupabaseServerAuthClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user?.id) return { ok: false, error: "נדרשת התחברות" }

    const companyId = await getActiveCompanyIdFromCookie()
    if (!companyId) return { ok: false, error: "חסר הקשר חברה. בחרו חברה פעילה." }

    /** Verify project belongs to the active company (defense in depth — RLS also checks). */
    const proj = await supabase
      .from("projects")
      .select("id, name, internal_project_code")
      .eq("id", trimmed)
      .maybeSingle()

    if (proj.error) return { ok: false, error: proj.error.message }
    const projRow = proj.data as ProjectRow | null
    if (!projRow) return { ok: false, error: "פרויקט לא נמצא או שאין הרשאה" }
    /**
     * Cross-tenant safety: the projects table here has no company_id column,
     * so we trust the active-company cookie that was already validated by the
     * caller's session + erp_user_company_memberships. DMS rows are stamped
     * with that company_id, and dms_* RLS scopes by company independently.
     */

    /** Bootstrap default folders + per-user ACL (idempotent). */
    const rootRows = await ensureDefaultFolders({
      companyId,
      projectId: trimmed,
    })
    await ensureUserAclOnRootFolders({
      companyId,
      userId: user.id,
      rootFolders: rootRows,
    })

    /** Load full folder tree (roots + descendants) using user-scoped client (RLS enforced). */
    const folders = await supabase
      .from("dms_folders")
      .select(
        "id, company_id, project_id, parent_folder_id, name, path_cache, kind, vault_folder_key, default_acl_template_id, created_at, updated_at"
      )
      .eq("project_id", trimmed)
      .is("deleted_at", null)
      .order("name", { ascending: true })

    if (folders.error) return { ok: false, error: folders.error.message }

    const folderRows = (folders.data ?? []) as DmsFolderRow[]
    const rootCaps = await loadRootCapabilities({
      userId: user.id,
      rootFolderIds: rootRows.map((r) => r.id),
    })

    return {
      ok: true,
      data: {
        project: {
          id: projRow.id,
          name: projRow.name ?? "פרויקט ללא שם",
          projectCode: projRow.internal_project_code,
        },
        folders: folderRows.map(mapFolder),
        rootCapabilities: rootCaps,
        companyId,
      },
    }
  } catch (e) {
    return { ok: false, error: formatError(e) }
  }
}

/**
 * Document list per folder — used by the client when the user navigates between folders.
 * Runs under user JWT so RLS filters out documents the user cannot see.
 */
export async function loadDmsFolderDocuments(
  folderId: string
): Promise<{ ok: true; documents: DmsDocumentSummary[] } | { ok: false; error: string }> {
  try {
    const fid = folderId.trim()
    if (!fid) return { ok: false, error: "מזהה תיקייה חסר" }
    const supabase = await createSupabaseServerAuthClient()

    const res = await supabase
      .from("dms_documents")
      .select(
        `
        id, company_id, project_id, folder_id, title, document_kind, current_version_id,
        confidentiality_level, tags, created_at, updated_at,
        current_version:dms_document_versions!dms_documents_current_version_fk (
          id, document_id, version_number, storage_bucket, storage_path,
          mime_type, size_bytes, checksum_sha256, original_filename,
          uploaded_by, uploaded_at, change_note, is_quarantined, archived_at
        )
      `
      )
      .eq("folder_id", fid)
      .is("deleted_at", null)
      .order("updated_at", { ascending: false })
      .limit(200)

    if (res.error) return { ok: false, error: res.error.message }
    return {
      ok: true,
      documents: ((res.data ?? []) as DmsDocumentRow[]).map(mapDocument),
    }
  } catch (e) {
    return { ok: false, error: formatError(e) }
  }
}
