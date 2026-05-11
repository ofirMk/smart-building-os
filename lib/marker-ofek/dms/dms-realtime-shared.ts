/**
 * Shared types for the DMS realtime channel. Type-only module — safe to import
 * from both server and client without bundling concerns.
 */

export type DmsRealtimeEventType =
  | "version_inserted"
  | "version_reverted"
  | "document_deleted"

export type DmsRealtimeEvent = {
  type: DmsRealtimeEventType
  documentId: string
  folderId: string
  versionId?: string
  versionNumber?: number
  revertedFromVersionNumber?: number
  triggeredByUserId?: string | null
  /** ISO timestamp set at emit time so clients can de-dupe / order. */
  emittedAt: string
}

export const DMS_BROADCAST_EVENT_NAME = "dms_event"

export function dmsChannelName(projectId: string): string {
  return `project:${projectId}:dms`
}
