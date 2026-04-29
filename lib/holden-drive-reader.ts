import { readFileSync } from "node:fs"
import path from "node:path"

import { GaxiosError } from "gaxios"
import { google } from "googleapis"

const DRIVE_READONLY_SCOPE = "https://www.googleapis.com/auth/drive.readonly"
const DEFAULT_KEY_PATH = path.join(
  process.cwd(),
  ".credentials",
  "google-cloud-key.json"
)

type DriveFileContent = string | Buffer

function resolveServiceAccountKeyPath(): string {
  return process.env.GOOGLE_CLOUD_KEY_FILE?.trim() || DEFAULT_KEY_PATH
}

function getDriveClient() {
  const keyFile = resolveServiceAccountKeyPath()
  const auth = new google.auth.GoogleAuth({
    keyFile,
    scopes: [DRIVE_READONLY_SCOPE],
  })

  return google.drive({
    version: "v3",
    auth,
  })
}

function isTextLikeMimeType(mimeType: string): boolean {
  const normalized = mimeType.toLowerCase()
  if (normalized.startsWith("text/")) return true
  return [
    "application/json",
    "application/xml",
    "application/xhtml+xml",
    "application/csv",
    "application/javascript",
  ].includes(normalized)
}

function googleWorkspaceExportMimeType(
  sourceMimeType: string
): string | null {
  if (sourceMimeType === "application/vnd.google-apps.document") {
    return "text/plain"
  }
  if (sourceMimeType === "application/vnd.google-apps.spreadsheet") {
    return "text/csv"
  }
  if (sourceMimeType === "application/vnd.google-apps.presentation") {
    return "text/plain"
  }
  return null
}

function assertServiceKeyReadable() {
  const keyPath = resolveServiceAccountKeyPath()
  try {
    readFileSync(keyPath)
  } catch {
    throw new Error(
      `Google service account key is missing or unreadable at "${keyPath}".`
    )
  }
}

function humanDriveError(error: unknown, fileId: string): Error {
  if (error instanceof GaxiosError) {
    const status = error.response?.status
    if (status === 404) {
      return new Error(`Drive file "${fileId}" was not found.`)
    }
    if (status === 401 || status === 403) {
      return new Error(
        `Access denied for Drive file "${fileId}". Verify sharing permissions for the service account.`
      )
    }
    return new Error(
      `Drive API request failed for file "${fileId}" (status ${status ?? "unknown"}).`
    )
  }

  if (error instanceof Error) {
    return new Error(`Drive read failed for file "${fileId}": ${error.message}`)
  }

  return new Error(`Drive read failed for file "${fileId}" due to an unknown error.`)
}

/**
 * Reads a Google Drive file by ID using a service account.
 * Returns UTF-8 text for text-like mime types; otherwise returns a Buffer.
 */
export async function readDriveFile(fileId: string): Promise<DriveFileContent> {
  const normalizedFileId = fileId.trim()
  if (!normalizedFileId) {
    throw new Error("readDriveFile requires a non-empty fileId.")
  }

  assertServiceKeyReadable()
  const drive = getDriveClient()

  try {
    const metadata = await drive.files.get({
      fileId: normalizedFileId,
      fields: "id,name,mimeType",
      supportsAllDrives: true,
    })
    const mimeType = metadata.data.mimeType || "application/octet-stream"
    const exportMimeType = googleWorkspaceExportMimeType(mimeType)
    const media = exportMimeType
      ? await drive.files.export(
          {
            fileId: normalizedFileId,
            mimeType: exportMimeType,
          },
          { responseType: "arraybuffer" }
        )
      : await drive.files.get(
          {
            fileId: normalizedFileId,
            alt: "media",
            supportsAllDrives: true,
          },
          { responseType: "arraybuffer" }
        )

    const bytes = Buffer.from(media.data as ArrayBuffer)
    if (isTextLikeMimeType(exportMimeType ?? mimeType)) {
      return bytes.toString("utf8")
    }
    return bytes
  } catch (error) {
    throw humanDriveError(error, normalizedFileId)
  }
}
