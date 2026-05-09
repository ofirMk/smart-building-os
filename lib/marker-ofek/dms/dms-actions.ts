"use server"

import { revalidatePath } from "next/cache"

import { createSupabaseServerAuthClient } from "@/lib/supabase/server-auth"
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role"
import { formatError } from "@/lib/utils"

import {
  DMS_ALLOWED_MIME_PREFIXES,
  DMS_BUCKET_MAIN,
  DMS_BUCKET_RESTRICTED,
  DMS_DOWNLOAD_URL_TTL_SECONDS,
  DMS_MAX_UPLOAD_BYTES,
  DMS_SENTINEL_CHECKSUM,
  buildDmsStoragePath,
  safeStorageSegment,
} from "./dms-constants"
import type {
  DmsCapability,
  DmsConfidentialityLevel,
  DmsDocumentKind,
} from "./dms-types"

type ActionFailure = { ok: false; error: string }

export type DmsInitiateUploadResult =
  | {
      ok: true
      documentId: string
      versionId: string
      versionNumber: number
      storageBucket: string
      storagePath: string
    }
  | ActionFailure

export type DmsFinalizeUploadResult =
  | { ok: true; documentId: string; versionId: string }
  | ActionFailure

export type DmsCreateFolderResult =
  | { ok: true; folderId: string }
  | ActionFailure

export type DmsDownloadUrlResult =
  | { ok: true; url: string; expiresAt: string }
  | ActionFailure

/**
 * Authentication helper — every action below validates session and returns
 * a uniform context. Actions never trust the supabase user JWT alone for
 * writes that must respect ACL; they always pair the user identity with
 * an RLS-bypass query (service-role) only after explicit ACL checks.
 */
async function requireSession(): Promise<
  | { ok: true; userId: string; userEmail: string | null }
  | ActionFailure
> {
  const supabase = await createSupabaseServerAuthClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user?.id) return { ok: false, error: "נדרשת התחברות" }
  return { ok: true, userId: user.id, userEmail: user.email ?? null }
}

/** Validate a folder is reachable and return its company/project context. */
async function loadFolderContext(folderId: string): Promise<
  | {
      ok: true
      companyId: string
      projectId: string
      folderId: string
      kind: string
      vaultFolderKey: string | null
    }
  | ActionFailure
> {
  const supabase = await createSupabaseServerAuthClient()
  const { data, error } = await supabase
    .from("dms_folders")
    .select("id, company_id, project_id, kind, vault_folder_key, deleted_at")
    .eq("id", folderId)
    .maybeSingle()
  if (error) return { ok: false, error: error.message }
  const row = data as
    | {
        id: string
        company_id: string
        project_id: string
        kind: string
        vault_folder_key: string | null
        deleted_at: string | null
      }
    | null
  if (!row || row.deleted_at) return { ok: false, error: "תיקייה לא נמצאה או שאין הרשאה" }
  return {
    ok: true,
    companyId: row.company_id,
    projectId: row.project_id,
    folderId: row.id,
    kind: row.kind,
    vaultFolderKey: row.vault_folder_key,
  }
}

/** Translate file_path -> bucket choice based on confidentiality. */
function bucketForConfidentiality(level: DmsConfidentialityLevel): string {
  return level === "SECRET" ? DMS_BUCKET_RESTRICTED : DMS_BUCKET_MAIN
}

function mimeIsAllowed(mime: string): boolean {
  if (!mime) return true // browser sometimes omits — let server probe later
  return DMS_ALLOWED_MIME_PREFIXES.some((p) => mime.toLowerCase().startsWith(p))
}

/**
 * Step 1 of upload — create dms_documents (if new) and dms_document_versions row
 * with `is_quarantined=true`. Returns the storage path + bucket so the client can
 * upload directly via the authenticated session. Storage RLS will then validate
 * the staged version row before accepting bytes.
 */
export async function dmsInitiateUpload(input: {
  folderId: string
  /** When null/undefined, a new document is created. When set, a new version is added. */
  documentId?: string | null
  title: string
  documentKind: DmsDocumentKind
  confidentialityLevel?: DmsConfidentialityLevel
  originalFilename: string
  mimeType: string
  sizeBytes: number
  changeNote?: string | null
  /** Optional precomputed SHA-256 hex; sentinel is used when unknown. */
  checksumSha256?: string | null
}): Promise<DmsInitiateUploadResult> {
  try {
    const sess = await requireSession()
    if (!sess.ok) return sess

    const folder = await loadFolderContext(input.folderId)
    if (!folder.ok) return folder

    if (input.sizeBytes <= 0) {
      return { ok: false, error: "קובץ ריק" }
    }
    if (input.sizeBytes > DMS_MAX_UPLOAD_BYTES) {
      return {
        ok: false,
        error: `הקובץ חורג מהמגבלה (${(DMS_MAX_UPLOAD_BYTES / 1024 / 1024).toFixed(0)}MB)`,
      }
    }
    if (!mimeIsAllowed(input.mimeType)) {
      return { ok: false, error: `סוג קובץ לא נתמך: ${input.mimeType}` }
    }
    if (!input.originalFilename.trim()) {
      return { ok: false, error: "שם קובץ ריק" }
    }

    const supabase = await createSupabaseServerAuthClient()
    const confidentiality = input.confidentialityLevel ?? "INTERNAL"
    const bucket = bucketForConfidentiality(confidentiality)

    /**
     * Document — either reuse the supplied id (RLS will reject if user lacks
     * UPLOAD_VERSION) or create a fresh row in the folder.
     */
    let documentId = input.documentId?.trim() || ""
    if (!documentId) {
      const ins = await supabase
        .from("dms_documents")
        .insert({
          company_id: folder.companyId,
          project_id: folder.projectId,
          folder_id: folder.folderId,
          title: input.title.trim() || safeStorageSegment(input.originalFilename),
          document_kind: input.documentKind,
          confidentiality_level: confidentiality,
          tags: [],
          metadata: {},
          created_by: sess.userId,
        })
        .select("id")
        .single()
      if (ins.error) return { ok: false, error: ins.error.message }
      documentId = (ins.data as { id: string }).id
    } else {
      /** Verify the document exists and belongs to the same folder/project. */
      const probe = await supabase
        .from("dms_documents")
        .select("id, folder_id, project_id")
        .eq("id", documentId)
        .maybeSingle()
      if (probe.error) return { ok: false, error: probe.error.message }
      if (!probe.data) return { ok: false, error: "מסמך לא נמצא או חסרה הרשאה" }
      const probeRow = probe.data as { id: string; folder_id: string; project_id: string }
      if (probeRow.folder_id !== folder.folderId) {
        return { ok: false, error: "המסמך אינו שייך לתיקייה זו" }
      }
    }

    /**
     * Version row — the monotonic-version trigger will assign the next
     * version_number when we pass null/0. We have to provide a placeholder
     * storage_path that matches what the storage upload will actually use.
     * Since we don't know version_number yet, we insert with a temp path,
     * then update once the trigger has set the number — but simpler: use
     * a deterministic path that the trigger does not depend on. Instead we
     * insert with version_number=1 and let the trigger probe; if collision,
     * we retry with the actual next number returned from a probe query.
     *
     * Simpler approach used here: probe max(version_number) for the document,
     * compute next, build storage_path, insert. If a concurrent insert wins
     * the race, the unique (document_id, version_number) constraint kicks in
     * and we retry once.
     */
    async function nextVersionNumber(): Promise<number> {
      const probe = await supabase
        .from("dms_document_versions")
        .select("version_number")
        .eq("document_id", documentId)
        .order("version_number", { ascending: false })
        .limit(1)
        .maybeSingle()
      const current = (probe.data as { version_number: number } | null)?.version_number ?? 0
      return current + 1
    }

    let attempt = 0
    let versionRow: { id: string; version_number: number } | null = null
    let storagePath = ""
    while (attempt < 2 && !versionRow) {
      attempt += 1
      const versionNumber = await nextVersionNumber()
      storagePath = buildDmsStoragePath({
        companyId: folder.companyId,
        projectId: folder.projectId,
        documentId,
        versionNumber,
        originalFilename: input.originalFilename,
      })

      const insertRes = await supabase
        .from("dms_document_versions")
        .insert({
          document_id: documentId,
          version_number: versionNumber,
          storage_bucket: bucket,
          storage_path: storagePath,
          mime_type: input.mimeType || "application/octet-stream",
          size_bytes: input.sizeBytes,
          checksum_sha256: input.checksumSha256?.trim() || DMS_SENTINEL_CHECKSUM,
          original_filename: input.originalFilename.trim(),
          uploaded_by: sess.userId,
          change_note: input.changeNote?.trim() || null,
          is_quarantined: true,
        })
        .select("id, version_number")
        .single()

      if (!insertRes.error) {
        versionRow = insertRes.data as { id: string; version_number: number }
      } else if (/duplicate|unique/i.test(insertRes.error.message) && attempt < 2) {
        /** Concurrent inserter took our number; retry once with a fresh probe. */
        continue
      } else {
        return { ok: false, error: insertRes.error.message }
      }
    }

    if (!versionRow) {
      return { ok: false, error: "לא ניתן להקצות מספר גרסה — נסה שוב" }
    }

    /** Audit (service-role since dms_audit_log INSERT is blocked for authenticated). */
    const admin = createSupabaseServiceRoleClient()
    await admin.from("dms_audit_log").insert({
      company_id: folder.companyId,
      project_id: folder.projectId,
      actor_type: "USER",
      actor_id: sess.userId,
      action: input.documentId ? "UPLOAD_VERSION" : "UPLOAD_NEW",
      target_type: "VERSION",
      target_id: versionRow.id,
      result: "PENDING_SCAN",
      metadata: {
        storage_bucket: bucket,
        storage_path: storagePath,
        size_bytes: input.sizeBytes,
        mime_type: input.mimeType,
      },
    })

    return {
      ok: true,
      documentId,
      versionId: versionRow.id,
      versionNumber: versionRow.version_number,
      storageBucket: bucket,
      storagePath,
    }
  } catch (e) {
    return { ok: false, error: formatError(e) }
  }
}

/**
 * Step 2 of upload — verify the binary actually arrived in Storage, clear the
 * quarantine flag, and point `dms_documents.current_version_id` to this version.
 *
 * Phase C.2 stub: AV scanning is mocked (skip → mark not-quarantined). When the
 * real AV worker lands in C.3+, it takes over the responsibility of clearing
 * `is_quarantined` and this action just enqueues the scan job.
 */
export async function dmsFinalizeUpload(input: {
  versionId: string
}): Promise<DmsFinalizeUploadResult> {
  try {
    const sess = await requireSession()
    if (!sess.ok) return sess
    const versionId = input.versionId.trim()
    if (!versionId) return { ok: false, error: "מזהה גרסה חסר" }

    const supabase = await createSupabaseServerAuthClient()

    /** Read the staged version row + parent document (RLS-scoped). */
    const ver = await supabase
      .from("dms_document_versions")
      .select(
        "id, document_id, version_number, storage_bucket, storage_path, size_bytes, is_quarantined"
      )
      .eq("id", versionId)
      .maybeSingle()
    if (ver.error) return { ok: false, error: ver.error.message }
    const verRow = ver.data as
      | {
          id: string
          document_id: string
          version_number: number
          storage_bucket: string
          storage_path: string
          size_bytes: number
          is_quarantined: boolean
        }
      | null
    if (!verRow) return { ok: false, error: "גרסה לא נמצאה" }

    /**
     * Verify the binary arrived. Use service-role for the storage probe
     * because the user JWT cannot HEAD a quarantined object (RLS requires
     * is_quarantined=false for SELECT).
     */
    const admin = createSupabaseServiceRoleClient()
    const head = await admin.storage
      .from(verRow.storage_bucket)
      .list(verRow.storage_path.split("/").slice(0, -1).join("/"), {
        search: verRow.storage_path.split("/").pop() ?? "",
        limit: 1,
      })

    if (head.error) {
      return { ok: false, error: `אימות אחסון נכשל: ${head.error.message}` }
    }
    const fileName = verRow.storage_path.split("/").pop()
    const found = (head.data ?? []).find((o) => o.name === fileName)
    if (!found) {
      return {
        ok: false,
        error: "הקובץ לא נמצא ב-Storage. נסה להעלות שוב.",
      }
    }

    /**
     * Clear quarantine via user-scoped client (RLS requires UPLOAD_VERSION
     * on the document). The immutability trigger allows updates to
     * is_quarantined and archived_at only.
     */
    const clearRes = await supabase
      .from("dms_document_versions")
      .update({ is_quarantined: false })
      .eq("id", verRow.id)
    if (clearRes.error) return { ok: false, error: clearRes.error.message }

    const setCurrent = await supabase
      .from("dms_documents")
      .update({ current_version_id: verRow.id })
      .eq("id", verRow.document_id)
    if (setCurrent.error) return { ok: false, error: setCurrent.error.message }

    /** Audit (service-role). */
    const docCtx = await admin
      .from("dms_documents")
      .select("company_id, project_id")
      .eq("id", verRow.document_id)
      .maybeSingle()
    const ctxRow = docCtx.data as
      | { company_id: string; project_id: string }
      | null
    if (ctxRow) {
      await admin.from("dms_audit_log").insert({
        company_id: ctxRow.company_id,
        project_id: ctxRow.project_id,
        actor_type: "USER",
        actor_id: sess.userId,
        action: "UPLOAD_VERSION",
        target_type: "VERSION",
        target_id: verRow.id,
        result: "SUCCESS",
        metadata: {
          version_number: verRow.version_number,
          finalized: true,
        },
      })
    }

    revalidatePath(
      `/marker-ofek/dms/${ctxRow?.project_id ?? ""}`,
      "page"
    )

    return { ok: true, documentId: verRow.document_id, versionId: verRow.id }
  } catch (e) {
    return { ok: false, error: formatError(e) }
  }
}

/** Create a sub-folder under a parent. RLS enforces UPLOAD_VERSION on the parent. */
export async function dmsCreateFolder(input: {
  parentFolderId: string
  name: string
}): Promise<DmsCreateFolderResult> {
  try {
    const sess = await requireSession()
    if (!sess.ok) return sess
    const name = input.name.trim()
    if (!name) return { ok: false, error: "שם תיקייה ריק" }
    if (name.length > 200) return { ok: false, error: "שם תיקייה ארוך מדי" }

    const parent = await loadFolderContext(input.parentFolderId)
    if (!parent.ok) return parent

    const supabase = await createSupabaseServerAuthClient()
    const ins = await supabase
      .from("dms_folders")
      .insert({
        company_id: parent.companyId,
        project_id: parent.projectId,
        parent_folder_id: parent.folderId,
        name,
        kind: "STANDARD",
        path_cache: "",
      })
      .select("id")
      .single()

    if (ins.error) return { ok: false, error: ins.error.message }
    revalidatePath(`/marker-ofek/dms/${parent.projectId}`, "page")
    return { ok: true, folderId: (ins.data as { id: string }).id }
  } catch (e) {
    return { ok: false, error: formatError(e) }
  }
}

/**
 * Issue a short-lived signed URL for a specific version. Uses service-role
 * because the user JWT may legitimately have DOWNLOAD via inheritance but
 * Supabase Storage's signed-URL endpoint does not run our custom RLS path.
 * We replicate the ACL check here in TypeScript before issuing.
 */
export async function dmsGetDownloadUrl(input: {
  versionId: string
}): Promise<DmsDownloadUrlResult> {
  try {
    const sess = await requireSession()
    if (!sess.ok) return sess

    const supabase = await createSupabaseServerAuthClient()

    /** Resolve version + parent document. RLS already filters; if it returns null, deny. */
    const ver = await supabase
      .from("dms_document_versions")
      .select(
        "id, document_id, storage_bucket, storage_path, is_quarantined, original_filename"
      )
      .eq("id", input.versionId)
      .maybeSingle()
    if (ver.error) return { ok: false, error: ver.error.message }
    const verRow = ver.data as
      | {
          id: string
          document_id: string
          storage_bucket: string
          storage_path: string
          is_quarantined: boolean
          original_filename: string
        }
      | null
    if (!verRow) return { ok: false, error: "גרסה לא נמצאה" }
    if (verRow.is_quarantined) {
      return { ok: false, error: "הגרסה בהסגר; לא ניתן להוריד עד סיום סריקה" }
    }

    /** Confirm DOWNLOAD capability via the source-of-truth function. */
    const caps = await supabase.rpc("dms_my_effective_permissions", {
      p_document_id: verRow.document_id,
    })
    if (caps.error) return { ok: false, error: caps.error.message }
    const list = (caps.data ?? []) as DmsCapability[]
    if (!list.includes("DOWNLOAD")) {
      return { ok: false, error: "אין הרשאת הורדה" }
    }

    const admin = createSupabaseServiceRoleClient()
    const signed = await admin.storage
      .from(verRow.storage_bucket)
      .createSignedUrl(verRow.storage_path, DMS_DOWNLOAD_URL_TTL_SECONDS, {
        download: verRow.original_filename,
      })
    if (signed.error) return { ok: false, error: signed.error.message }

    /** Audit on every signed URL issuance — even if user never clicks. */
    const docCtx = await admin
      .from("dms_documents")
      .select("company_id, project_id")
      .eq("id", verRow.document_id)
      .maybeSingle()
    const ctxRow = docCtx.data as
      | { company_id: string; project_id: string }
      | null
    if (ctxRow) {
      await admin.from("dms_audit_log").insert({
        company_id: ctxRow.company_id,
        project_id: ctxRow.project_id,
        actor_type: "USER",
        actor_id: sess.userId,
        action: "DOWNLOAD",
        target_type: "VERSION",
        target_id: verRow.id,
        result: "SUCCESS",
        metadata: { ttl_seconds: DMS_DOWNLOAD_URL_TTL_SECONDS },
      })
    }

    return {
      ok: true,
      url: signed.data.signedUrl,
      expiresAt: new Date(
        Date.now() + DMS_DOWNLOAD_URL_TTL_SECONDS * 1000
      ).toISOString(),
    }
  } catch (e) {
    return { ok: false, error: formatError(e) }
  }
}
