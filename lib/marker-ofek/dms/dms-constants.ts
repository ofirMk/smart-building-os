import type { DmsCapability, DmsDocumentKind } from "./dms-types"

/** Storage bucket constants — must match check constraint in C.1 DDL. */
export const DMS_BUCKET_MAIN = "project-dms" as const
export const DMS_BUCKET_RESTRICTED = "project-dms-restricted" as const

/** Default folders auto-seeded on first project access. */
export const DMS_DEFAULT_FOLDERS: ReadonlyArray<{
  name: string
  vaultFolderKey: string
  /** Hint for default document_kind when uploading into this folder. */
  hintKind: DmsDocumentKind
}> = [
  { name: "תוכניות", vaultFolderKey: "plans", hintKind: "PLAN" },
  { name: "היתרים", vaultFolderKey: "permits", hintKind: "PERMIT" },
  { name: "תעודות", vaultFolderKey: "certificates", hintKind: "CERTIFICATE" },
  { name: "חוזים", vaultFolderKey: "contracts", hintKind: "CONTRACT" },
  { name: "חשבוניות", vaultFolderKey: "invoices", hintKind: "INVOICE" },
  { name: "תעודות משלוח", vaultFolderKey: "delivery_notes", hintKind: "DELIVERY_NOTE" },
  { name: "מכתבים", vaultFolderKey: "correspondence", hintKind: "CORRESPONDENCE" },
  { name: "תמונות", vaultFolderKey: "photos", hintKind: "PHOTO" },
  { name: "אחר", vaultFolderKey: "other", hintKind: "OTHER" },
]

/** Capabilities granted to the project owner on bootstrap (folder root + descendants). */
export const DMS_OWNER_CAPABILITIES: ReadonlyArray<DmsCapability> = [
  "VIEW_METADATA",
  "VIEW_CONTENT",
  "DOWNLOAD",
  "UPLOAD_VERSION",
  "DELETE",
  "MANAGE_ACL",
  "LINK_ENTITY",
]

/** Hard upload size cap (kept generous; signed URL conditions can tighten further). */
export const DMS_MAX_UPLOAD_BYTES = 250 * 1024 * 1024 // 250MB

/** MIME whitelist mirrors HLD §3.3. Browser File.type is sometimes empty — fall back to allow. */
export const DMS_ALLOWED_MIME_PREFIXES: ReadonlyArray<string> = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument",
  "application/vnd.ms-excel",
  "application/vnd.ms-powerpoint",
  "application/zip",
  "application/x-zip-compressed",
  "application/octet-stream", // unknown — allow but flag
  "image/",
  "text/",
  "video/mp4",
]

/** Version download signed URL TTL (seconds). HLD §4.1. */
export const DMS_DOWNLOAD_URL_TTL_SECONDS = 60 * 60 // 60 min

/** Translate raw file_path -> safe storage segment, mirroring contract-vault helper. */
export function safeStorageSegment(name: string): string {
  return (
    name
      .replace(/[/\\?%*:|"<>]/g, "_")
      .trim()
      .slice(0, 180) || "file"
  )
}

/** Build a deterministic storage path: {company}/{project}/{document}/v{N}/{filename} */
export function buildDmsStoragePath(args: {
  companyId: string
  projectId: string
  documentId: string
  versionNumber: number
  originalFilename: string
}): string {
  const safe = safeStorageSegment(args.originalFilename)
  return `${args.companyId}/${args.projectId}/${args.documentId}/v${args.versionNumber}/${safe}`
}

/** Hex SHA-256 placeholder used until client computes real one. Must match DDL regex. */
export const DMS_SENTINEL_CHECKSUM = "0".repeat(64)
