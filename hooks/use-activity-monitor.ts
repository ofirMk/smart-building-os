"use client"

import { usePathname } from "next/navigation"
import { useCallback, useEffect, useRef } from "react"

import { appendWorkspaceActivityLog } from "@/lib/marker-ofek/workspace-efficiency-actions"
import type { ModuleActivityEntry } from "@/lib/marker-ofek/workspace-types"

const FLUSH_MS = 28_000
const FLUSH_BATCH = 14

/**
 * יומן מעברים שקט בין נתיבי מרקר — נשמר ב־workspace_activity_log.
 */
export function useActivityMonitor(enabled: boolean) {
  const pathname = usePathname()
  const prevPath = useRef<string | null>(null)
  const buffer = useRef<ModuleActivityEntry[]>([])
  const flushTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const flush = useCallback(() => {
    if (buffer.current.length === 0) return
    const batch = [...buffer.current]
    buffer.current = []
    void appendWorkspaceActivityLog(batch).then((res) => {
      if (!res.ok && process.env.NODE_ENV === "development") {
        console.warn("[activity-monitor]", res.error)
      }
    })
  }, [])

  const scheduleFlush = useCallback(() => {
    if (flushTimer.current) clearTimeout(flushTimer.current)
    flushTimer.current = setTimeout(() => {
      flushTimer.current = null
      flush()
    }, FLUSH_MS)
  }, [flush])

  useEffect(() => {
    return () => {
      if (flushTimer.current) clearTimeout(flushTimer.current)
      flush()
    }
  }, [flush])

  useEffect(() => {
    if (!enabled || !pathname?.startsWith("/marker-ofek")) return
    const from = prevPath.current
    prevPath.current = pathname
    if (from == null || from === pathname) return
    buffer.current.push({ ts: Date.now(), fromPath: from, toPath: pathname })
    if (buffer.current.length >= FLUSH_BATCH) flush()
    else scheduleFlush()
  }, [enabled, pathname, flush, scheduleFlush])
}
