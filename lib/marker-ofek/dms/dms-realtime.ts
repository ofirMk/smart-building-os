import "server-only"

/**
 * DMS realtime — SERVER-SIDE broadcast emitter.
 *
 * Why broadcast (not postgres_changes):
 *   • `dms_document_versions` doesn't carry project_id, so a postgres_changes
 *     filter would need a join (Realtime doesn't support joins on filters).
 *   • Server actions have richer context (e.g., REVERTED carries the source
 *     version number) that we want in the payload — broadcast lets us shape
 *     the payload precisely.
 *
 * Channel name: `project:{projectId}:dms`
 * Client subscriber lives in `dms-realtime-client.ts`.
 */

import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role"
import {
  DMS_BROADCAST_EVENT_NAME,
  dmsChannelName,
  type DmsRealtimeEvent,
} from "./dms-realtime-shared"

export type { DmsRealtimeEvent, DmsRealtimeEventType } from "./dms-realtime-shared"

/**
 * Broadcast an event to every client subscribed to the project's DMS channel.
 * Returns the awaitable promise so callers can choose fire-and-forget or await.
 *
 * Failures are swallowed and logged in non-production; the calling action
 * MUST NOT depend on broadcast success for correctness — it's a UI hint only.
 */
export async function emitDmsEvent(
  projectId: string,
  event: Omit<DmsRealtimeEvent, "emittedAt">,
): Promise<void> {
  try {
    const admin = createSupabaseServiceRoleClient()
    const channel = admin.channel(dmsChannelName(projectId), {
      config: { broadcast: { self: false, ack: false } },
    })

    await new Promise<void>((resolve) => {
      let settled = false
      const cleanup = () => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        try {
          admin.removeChannel(channel)
        } catch {
          /* swallow */
        }
        resolve()
      }
      /** Hard timeout — we never let realtime hold up a server action. */
      const timer = setTimeout(cleanup, 2500)

      channel.subscribe((status) => {
        if (settled) return
        if (status === "SUBSCRIBED") {
          channel
            .send({
              type: "broadcast",
              event: DMS_BROADCAST_EVENT_NAME,
              payload: { ...event, emittedAt: new Date().toISOString() },
            })
            .finally(cleanup)
        } else if (
          status === "CHANNEL_ERROR" ||
          status === "TIMED_OUT" ||
          status === "CLOSED"
        ) {
          cleanup()
        }
      })
    })
  } catch (e) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[dms-realtime] emit failed:", e)
    }
  }
}
