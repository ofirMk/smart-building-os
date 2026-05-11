/**
 * DMS notifications service — fan-out emails after document events.
 *
 * Spec source: docs/architecture/project-dms-architecture-2026-05-07.md
 *   §5 step 7-8 (recipient resolution + email batch)
 *   D5 — Default instant delivery (no batching window).
 *
 * Recipient resolution (union of three sources, deduped by user_id):
 *   a) ACL viewers — users holding VIEW_METADATA on the document directly
 *      or via folder ancestor chain (respecting inherits_to_descendants).
 *   b) Folder subscribers — rows in dms_folder_subscriptions where the
 *      folder is the doc's folder (any scope) or any ancestor (scope='RECURSIVE').
 *   c) Linked-entity owners — implemented via resolveLinkedEntityOwners()
 *      (the doc's own project + any PROJECT entity_link → project_assignments).
 *
 * Calling convention: every public function tolerates failure and returns
 * structured results. Callers should treat email send failures as non-fatal
 * (`fire-and-forget` from server actions).
 */

import "server-only"

import {
  sendTransactionalEmail,
  type SendTransactionalEmailResult,
} from "@/lib/infrastructure/email-service"
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role"
import { getSystemParameter } from "@/lib/erp/system-parameters"
import { resolveLinkedEntityOwners } from "./linked-entities-resolver"

// =============================================================================
// Types
// =============================================================================

export type DmsDocumentEventType = "NEW_VERSION" | "REVERTED" | "DELETED"

export type DmsDocumentEvent = {
  documentId: string
  event: DmsDocumentEventType
  /** Free-form context attached to subject/body and audit metadata. */
  metadata?: {
    versionNumber?: number
    revertedFromVersionNumber?: number
    triggeredByEmail?: string | null
    changeNote?: string | null
  }
}

type RecipientSource = "ACL_VIEWER" | "FOLDER_SUBSCRIBER" | "LINKED_ENTITY"

type ResolvedRecipient = {
  userId: string
  email: string
  source: RecipientSource[]
}

export type DmsNotificationResult = {
  ok: boolean
  documentId: string
  event: DmsDocumentEventType
  recipientCount: number
  sentCount: number
  failedCount: number
  errors: string[]
}

// =============================================================================
// Recipient resolution
// =============================================================================

/**
 * Walk the folder ancestor chain for a folder. Returns ordered list from the
 * folder itself (depth=0) up to the root. Service-role so we bypass RLS — the
 * notification fan-out runs in trusted context.
 */
async function getFolderAncestors(folderId: string): Promise<
  Array<{ id: string; depth: number }>
> {
  const admin = createSupabaseServiceRoleClient()
  const visited: Array<{ id: string; depth: number }> = []
  const seen = new Set<string>()
  let current: string | null = folderId
  let depth = 0
  while (current && !seen.has(current) && depth < 50) {
    seen.add(current)
    const { data, error } = await admin
      .from("dms_folders")
      .select("id, parent_folder_id, deleted_at")
      .eq("id", current)
      .maybeSingle()
    if (error || !data) break
    const row = data as {
      id: string
      parent_folder_id: string | null
      deleted_at: string | null
    }
    if (row.deleted_at) break
    visited.push({ id: row.id, depth })
    current = row.parent_folder_id
    depth += 1
  }
  return visited
}

async function resolveAclViewers(args: {
  documentId: string
  folderAncestors: Array<{ id: string; depth: number }>
}): Promise<Set<string>> {
  const admin = createSupabaseServiceRoleClient()
  const folderIds = args.folderAncestors.map((a) => a.id)
  /** Direct entries on the document. */
  const docRes = await admin
    .from("dms_acl_entries")
    .select("principal_id, capabilities, expires_at")
    .eq("scope_type", "DOCUMENT")
    .eq("scope_id", args.documentId)
    .eq("principal_type", "USER")
  /** Folder entries — depth=0 always counts; ancestors require inherits flag. */
  const folderRes =
    folderIds.length > 0
      ? await admin
          .from("dms_acl_entries")
          .select(
            "principal_id, capabilities, expires_at, scope_id, inherits_to_descendants"
          )
          .eq("scope_type", "FOLDER")
          .eq("principal_type", "USER")
          .in("scope_id", folderIds)
      : { data: [], error: null }

  const now = Date.now()
  const out = new Set<string>()
  const ancestorDepth = new Map(args.folderAncestors.map((a) => [a.id, a.depth]))

  type DocRow = {
    principal_id: string
    capabilities: string[] | null
    expires_at: string | null
  }
  for (const r of (docRes.data ?? []) as DocRow[]) {
    if (r.expires_at && new Date(r.expires_at).getTime() <= now) continue
    if ((r.capabilities ?? []).includes("VIEW_METADATA")) {
      out.add(r.principal_id)
    }
  }

  type FolderRow = DocRow & {
    scope_id: string
    inherits_to_descendants: boolean | null
  }
  for (const r of (folderRes.data ?? []) as FolderRow[]) {
    if (r.expires_at && new Date(r.expires_at).getTime() <= now) continue
    const depth = ancestorDepth.get(r.scope_id) ?? -1
    if (depth < 0) continue
    if (depth > 0 && r.inherits_to_descendants !== true) continue
    if ((r.capabilities ?? []).includes("VIEW_METADATA")) {
      out.add(r.principal_id)
    }
  }
  return out
}

async function resolveFolderSubscribers(args: {
  folderId: string
  folderAncestors: Array<{ id: string; depth: number }>
}): Promise<Set<string>> {
  const admin = createSupabaseServiceRoleClient()
  const folderIds = args.folderAncestors.map((a) => a.id)
  if (folderIds.length === 0) return new Set()

  const { data, error } = await admin
    .from("dms_folder_subscriptions")
    .select("user_id, folder_id, scope")
    .in("folder_id", folderIds)
  if (error) return new Set()

  const ancestorDepth = new Map(args.folderAncestors.map((a) => [a.id, a.depth]))
  const out = new Set<string>()
  type Row = { user_id: string; folder_id: string; scope: "ROOT" | "RECURSIVE" }
  for (const r of (data ?? []) as Row[]) {
    const depth = ancestorDepth.get(r.folder_id) ?? -1
    if (depth < 0) continue
    /** depth 0 — the doc's own folder — always notifies, regardless of scope.
     *  ancestors — notify only when scope=RECURSIVE. */
    if (depth === 0 || r.scope === "RECURSIVE") {
      out.add(r.user_id)
    }
  }
  return out
}

/**
 * Linked-entity recipients — wraps the dedicated resolver module.
 * See `linked-entities-resolver.ts` for algorithm + future expansion notes.
 */
async function resolveLinkedEntityRecipients(
  documentId: string,
  documentProjectId: string,
): Promise<Set<string>> {
  return resolveLinkedEntityOwners(documentId, documentProjectId)
}

/**
 * Bulk email lookup for a set of user ids via service-role auth admin. Drops
 * users without an email address.
 */
async function lookupEmailsForUsers(
  userIds: string[],
): Promise<Map<string, string>> {
  if (userIds.length === 0) return new Map()
  const admin = createSupabaseServiceRoleClient()
  const map = new Map<string, string>()
  /** auth.admin.getUserById is one call per user — fine for fan-outs ≤ 50.
   *  For larger sets a batch RPC would be added later. */
  for (const uid of userIds) {
    try {
      const { data } = await admin.auth.admin.getUserById(uid)
      const email = data?.user?.email?.trim()
      if (email) map.set(uid, email)
    } catch {
      /* skip */
    }
  }
  return map
}

/**
 * Resolve the full deduped recipient list for a document event.
 */
export async function resolveRecipients(
  documentId: string,
): Promise<ResolvedRecipient[]> {
  const admin = createSupabaseServiceRoleClient()
  const docRes = await admin
    .from("dms_documents")
    .select("id, folder_id, project_id, company_id, deleted_at")
    .eq("id", documentId)
    .maybeSingle()
  if (docRes.error || !docRes.data) return []
  const doc = docRes.data as {
    id: string
    folder_id: string
    project_id: string
    company_id: string
    deleted_at: string | null
  }
  if (doc.deleted_at) return []

  const ancestors = await getFolderAncestors(doc.folder_id)
  const [aclViewers, folderSubs, linkedOwners] = await Promise.all([
    resolveAclViewers({ documentId, folderAncestors: ancestors }),
    resolveFolderSubscribers({
      folderId: doc.folder_id,
      folderAncestors: ancestors,
    }),
    resolveLinkedEntityRecipients(doc.id, doc.project_id),
  ])

  /** Build a map keyed by userId with source attribution. */
  const sourceMap = new Map<string, Set<RecipientSource>>()
  for (const uid of aclViewers) {
    if (!sourceMap.has(uid)) sourceMap.set(uid, new Set())
    sourceMap.get(uid)!.add("ACL_VIEWER")
  }
  for (const uid of folderSubs) {
    if (!sourceMap.has(uid)) sourceMap.set(uid, new Set())
    sourceMap.get(uid)!.add("FOLDER_SUBSCRIBER")
  }
  for (const uid of linkedOwners) {
    if (!sourceMap.has(uid)) sourceMap.set(uid, new Set())
    sourceMap.get(uid)!.add("LINKED_ENTITY")
  }

  const userIds = Array.from(sourceMap.keys())
  const emails = await lookupEmailsForUsers(userIds)

  const recipients: ResolvedRecipient[] = []
  for (const uid of userIds) {
    const email = emails.get(uid)
    if (!email) continue
    recipients.push({
      userId: uid,
      email,
      source: Array.from(sourceMap.get(uid) ?? []),
    })
  }
  return recipients
}

// =============================================================================
// Subject + body composition
// =============================================================================

function buildSubject(event: DmsDocumentEventType, title: string): string {
  switch (event) {
    case "NEW_VERSION":
      return `📄 גרסה חדשה: ${title}`
    case "REVERTED":
      return `↩️ שוחזרה גרסה: ${title}`
    case "DELETED":
      return `🗑️ מסמך נמחק: ${title}`
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

function buildHtml(args: {
  event: DmsDocumentEventType
  title: string
  projectName: string | null
  folderName: string | null
  triggeredByEmail: string | null
  versionNumber?: number
  revertedFromVersionNumber?: number
  changeNote?: string | null
  documentUrl: string
}): string {
  const e = args.event
  const heading =
    e === "NEW_VERSION"
      ? "גרסה חדשה הועלתה למסמך"
      : e === "REVERTED"
        ? "מסמך שוחזר לגרסה קודמת"
        : "מסמך נמחק"

  const detailLines: string[] = []
  if (args.projectName) detailLines.push(`<b>פרויקט:</b> ${escapeHtml(args.projectName)}`)
  if (args.folderName) detailLines.push(`<b>תיקייה:</b> ${escapeHtml(args.folderName)}`)
  detailLines.push(`<b>מסמך:</b> ${escapeHtml(args.title)}`)
  if (typeof args.versionNumber === "number") {
    detailLines.push(`<b>גרסה חדשה:</b> v${args.versionNumber}`)
  }
  if (typeof args.revertedFromVersionNumber === "number") {
    detailLines.push(
      `<b>שוחזרה מגרסה:</b> v${args.revertedFromVersionNumber}`,
    )
  }
  if (args.triggeredByEmail) {
    detailLines.push(`<b>על ידי:</b> ${escapeHtml(args.triggeredByEmail)}`)
  }
  if (args.changeNote) {
    detailLines.push(`<b>הערה:</b> ${escapeHtml(args.changeNote)}`)
  }

  return `<!doctype html>
<html lang="he" dir="rtl">
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f5f5f7;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f7;padding:24px 0;">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;">
        <tr><td style="padding:24px 28px 8px;">
          <div style="font-size:13px;color:#6b7280;margin-bottom:6px;">Holden Group ERP — DMS</div>
          <h1 style="margin:0 0 8px;font-size:20px;color:#111827;">${escapeHtml(heading)}</h1>
        </td></tr>
        <tr><td style="padding:0 28px 16px;color:#374151;font-size:14px;line-height:1.6;">
          ${detailLines.map((l) => `<div style="margin:4px 0;">${l}</div>`).join("")}
        </td></tr>
        <tr><td style="padding:0 28px 24px;">
          <a href="${escapeHtml(args.documentUrl)}" style="display:inline-block;background:#111827;color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:8px;font-size:14px;font-weight:600;">פתח את המסמך</a>
        </td></tr>
        <tr><td style="padding:14px 28px;background:#f9fafb;border-top:1px solid #e5e7eb;font-size:11px;color:#9ca3af;line-height:1.5;">
          הודעה זו נשלחה כי יש לך גישה למסמך או שאת/ה מנוי על תיקיית האב שלו. ניתן לבטל מנוי מהממשק.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`
}

// =============================================================================
// Public entry point
// =============================================================================

/**
 * Send notifications for a document event. Idempotent w.r.t. the audit log
 * (records one NOTIFICATIONS_SENT row per call with the recipient count).
 *
 * Failures during fan-out are collected per recipient and reported in the
 * return value; the caller decides whether to log/retry.
 */
export async function sendDocumentEvent(
  event: DmsDocumentEvent,
): Promise<DmsNotificationResult> {
  const result: DmsNotificationResult = {
    ok: true,
    documentId: event.documentId,
    event: event.event,
    recipientCount: 0,
    sentCount: 0,
    failedCount: 0,
    errors: [],
  }

  const admin = createSupabaseServiceRoleClient()

  /** Resolve doc metadata, then folder + project names in side queries.
   *  Avoids relying on auto-generated FK constraint names. */
  const docRes = await admin
    .from("dms_documents")
    .select("id, title, company_id, project_id, folder_id")
    .eq("id", event.documentId)
    .maybeSingle()
  if (docRes.error || !docRes.data) {
    result.ok = false
    result.errors.push(
      `cannot load document for notification: ${docRes.error?.message ?? "not found"}`,
    )
    return result
  }
  const doc = docRes.data as {
    id: string
    title: string
    company_id: string
    project_id: string
    folder_id: string
  }

  const [folderRes, projectRes] = await Promise.all([
    admin.from("dms_folders").select("id, name").eq("id", doc.folder_id).maybeSingle(),
    admin.from("projects").select("id, name").eq("id", doc.project_id).maybeSingle(),
  ])
  const folderObj = folderRes.data as { id: string; name: string } | null
  const projectObj = projectRes.data as { id: string; name: string } | null

  const recipients = await resolveRecipients(event.documentId)
  result.recipientCount = recipients.length
  if (recipients.length === 0) {
    /** No-op — still audit so we can verify behavior in tests/forensics. */
    await admin.from("dms_audit_log").insert({
      company_id: doc.company_id,
      project_id: doc.project_id,
      actor_type: "SERVICE",
      actor_id: "dms-notifications",
      action: "NOTIFICATIONS_SENT",
      target_type: "DOCUMENT",
      target_id: event.documentId,
      result: "SUCCESS",
      metadata: {
        event: event.event,
        recipient_count: 0,
        skipped_reason: "no_recipients",
      },
    })
    return result
  }

  /** Resolve display "From" branding from system parameters with hardcode fallback. */
  let fromBrand = "Holden Group ERP"
  try {
    const v = await getSystemParameter(doc.company_id, "EMAIL_FROM_NAME")
    if (v && v.trim().length > 0) fromBrand = v.trim()
  } catch {
    /* fall back to default */
  }

  const subject = `[${fromBrand}] ${buildSubject(event.event, doc.title)}`
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL?.trim() || "https://sys-mk.com"
  const documentUrl = `${baseUrl.replace(/\/+$/, "")}/marker-ofek/dms/${doc.project_id}`

  const html = buildHtml({
    event: event.event,
    title: doc.title,
    projectName: projectObj?.name ?? null,
    folderName: folderObj?.name ?? null,
    triggeredByEmail: event.metadata?.triggeredByEmail ?? null,
    versionNumber: event.metadata?.versionNumber,
    revertedFromVersionNumber: event.metadata?.revertedFromVersionNumber,
    changeNote: event.metadata?.changeNote ?? null,
    documentUrl,
  })

  /** Send sequentially to keep failure-isolation. Concurrent send would
   *  hide per-recipient errors. */
  const perRecipient: Array<{
    email: string
    result: SendTransactionalEmailResult
  }> = []
  for (const r of recipients) {
    try {
      const res = await sendTransactionalEmail({
        to: r.email,
        subject,
        html,
      })
      perRecipient.push({ email: r.email, result: res })
      if (res.ok) result.sentCount += 1
      else {
        result.failedCount += 1
        result.errors.push(`${r.email}: ${res.error}`)
      }
    } catch (e) {
      result.failedCount += 1
      result.errors.push(
        `${r.email}: ${e instanceof Error ? e.message : String(e)}`,
      )
    }
  }

  if (result.failedCount > 0) result.ok = false

  /** Audit one row per fan-out — recipient_count includes successes only. */
  await admin.from("dms_audit_log").insert({
    company_id: doc.company_id,
    project_id: doc.project_id,
    actor_type: "SERVICE",
    actor_id: "dms-notifications",
    action: "NOTIFICATIONS_SENT",
    target_type: "DOCUMENT",
    target_id: event.documentId,
    result: result.failedCount === 0 ? "SUCCESS" : "ERROR",
    metadata: {
      event: event.event,
      recipient_count: result.recipientCount,
      sent_count: result.sentCount,
      failed_count: result.failedCount,
      from_brand: fromBrand,
      version_number: event.metadata?.versionNumber,
      reverted_from_version_number: event.metadata?.revertedFromVersionNumber,
      change_note: event.metadata?.changeNote,
      errors: result.errors.slice(0, 10),
    },
  })

  return result
}
