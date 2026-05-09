/**
 * Phase C.2 — DMS shared TypeScript types.
 * These mirror the DDL in supabase/migrations/20260815120000_dms_phase_c1_foundations.sql
 * and are used by both server loaders/actions and client components.
 */

export type DmsFolderKind = "STANDARD" | "SYSTEM" | "EXTERNAL_PARTNER"

export type DmsDocumentKind =
  | "PLAN"
  | "PERMIT"
  | "CERTIFICATE"
  | "CONTRACT"
  | "INVOICE"
  | "DELIVERY_NOTE"
  | "CORRESPONDENCE"
  | "PHOTO"
  | "OTHER"

export type DmsConfidentialityLevel =
  | "PUBLIC"
  | "INTERNAL"
  | "RESTRICTED"
  | "SECRET"

export type DmsCapability =
  | "VIEW_METADATA"
  | "VIEW_CONTENT"
  | "DOWNLOAD"
  | "UPLOAD_VERSION"
  | "DELETE"
  | "MANAGE_ACL"
  | "LINK_ENTITY"

export type DmsStorageBucket = "project-dms" | "project-dms-restricted"

export type DmsFolder = {
  id: string
  companyId: string
  projectId: string
  parentFolderId: string | null
  name: string
  pathCache: string
  kind: DmsFolderKind
  vaultFolderKey: string | null
  defaultAclTemplateId: string | null
  createdAt: string
  updatedAt: string
}

export type DmsDocumentSummary = {
  id: string
  companyId: string
  projectId: string
  folderId: string
  title: string
  documentKind: DmsDocumentKind
  currentVersionId: string | null
  confidentialityLevel: DmsConfidentialityLevel
  tags: string[]
  createdAt: string
  updatedAt: string
  /** Joined from current_version_id when present. */
  currentVersion: DmsDocumentVersion | null
}

export type DmsDocumentVersion = {
  id: string
  documentId: string
  versionNumber: number
  storageBucket: DmsStorageBucket
  storagePath: string
  mimeType: string
  sizeBytes: number
  checksumSha256: string
  originalFilename: string
  uploadedBy: string | null
  uploadedAt: string
  changeNote: string | null
  isQuarantined: boolean
  archivedAt: string | null
}

export type DmsBrowserBootstrap = {
  project: {
    id: string
    name: string
    projectCode: string | null
  }
  folders: DmsFolder[]
  /** Effective capabilities of the current user on the project root, used to gate UI affordances. */
  rootCapabilities: DmsCapability[]
  /** Active company id from the cookie context. */
  companyId: string
}
