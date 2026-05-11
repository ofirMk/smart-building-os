"use client"

/**
 * DMS realtime — CLIENT-SIDE subscriber. Pure browser code; safe to import
 * from client components. The server-side emit lives in `dms-realtime.ts`
 * (guarded with "server-only").
 */

import type { RealtimeChannel } from "@supabase/supabase-js"

import { createSupabaseBrowserClient } from "@/lib/supabase/browser"
import {
  DMS_BROADCAST_EVENT_NAME,
  dmsChannelName,
  type DmsRealtimeEvent,
} from "./dms-realtime-shared"

export type { DmsRealtimeEvent, DmsRealtimeEventType } from "./dms-realtime-shared"

/**
 * Subscribe to a project's DMS broadcast channel. Returns a cleanup function
 * for useEffect.
 *
 * Usage:
 *   useEffect(() => {
 *     const unsub = subscribeToDmsChannel(projectId, (e) => { ... })
 *     return () => { void unsub() }
 *   }, [projectId])
 */
export function subscribeToDmsChannel(
  projectId: string,
  onEvent: (event: DmsRealtimeEvent) => void,
): () => Promise<void> {
  let channel: RealtimeChannel | null = null
  let disposed = false

  const supabase = createSupabaseBrowserClient()
  channel = supabase.channel(dmsChannelName(projectId), {
    config: { broadcast: { self: false, ack: false } },
  })

  channel
    .on(
      "broadcast",
      { event: DMS_BROADCAST_EVENT_NAME },
      (msg: { payload: DmsRealtimeEvent }) => {
        if (disposed) return
        try {
          onEvent(msg.payload)
        } catch (e) {
          if (process.env.NODE_ENV !== "production") {
            console.warn("[dms-realtime] onEvent threw:", e)
          }
        }
      },
    )
    .subscribe()

  return async () => {
    disposed = true
    if (channel) {
      try {
        await supabase.removeChannel(channel)
      } catch {
        /* swallow */
      }
      channel = null
    }
  }
}
