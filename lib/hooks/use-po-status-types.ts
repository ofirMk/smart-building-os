"use client"

/**
 * `usePoStatusTypes()` — Phase B' (Priority parity UI).
 *
 * קליינט-hook קורא פעם אחת את `/api/procurement/status-types` ו-cache
 * את ה-13 הסטטוסים במודול-scope (ה-data הוא master-data יציב — לא משתנה
 * בין sessions של אותו user).
 *
 * החזרות:
 *   • `statusMap`      — `Record<string, PoStatusTypeDto>` לגישה O(1) לפי code.
 *   • `orderedStatuses`— מערך ממוין (pre-approval → active → closed → cancelled → legacy).
 *   • `isLoading`      — טרם טעינה ראשונית.
 *   • `error`          — הודעת שגיאה ממזבח ה-API אם נכשל.
 *   • `reload()`       — ריענון ידני (למשל אחרי seed חדש).
 *
 * Policy:
 *   המטמון חי בזיכרון של ה-tab (module-level) — לא משותף בין tabs שונים.
 *   זה תקין כי ה-data קטן (13 שורות) ו-fetch חוזר הוא פעולה זולה.
 */

import * as React from "react"

import { masterDataFetch } from "@/lib/erp/master-data-browser"

export type PoStatusTypeDto = {
  status: string
  nameHe: string
  nameEn: string
  color: string | null
  allowChanges: boolean
  allowsGr: boolean
  isApproved: boolean
  isClosed: boolean
  isCancelled: boolean
  isPostApproval: boolean
  isLegacyAlias: boolean
  lifecycleStage: "pre-approval" | "active" | "closed" | "cancelled" | "legacy"
}

type CacheEntry = {
  promise: Promise<PoStatusTypeDto[]> | null
  value: PoStatusTypeDto[] | null
  error: string | null
}

// Module-level cache — יחיד לכל ה-tab.
const cache: CacheEntry = {
  promise: null,
  value: null,
  error: null,
}

const LIFECYCLE_ORDER: Record<PoStatusTypeDto["lifecycleStage"], number> = {
  "pre-approval": 0,
  active: 1,
  closed: 2,
  cancelled: 3,
  legacy: 4,
}

function sortStatuses(rows: PoStatusTypeDto[]): PoStatusTypeDto[] {
  return [...rows].sort((a, b) => {
    const la = LIFECYCLE_ORDER[a.lifecycleStage] ?? 99
    const lb = LIFECYCLE_ORDER[b.lifecycleStage] ?? 99
    if (la !== lb) return la - lb
    return a.status.localeCompare(b.status)
  })
}

async function loadStatuses(): Promise<PoStatusTypeDto[]> {
  if (cache.value) return cache.value
  if (cache.promise) return cache.promise
  cache.promise = masterDataFetch<PoStatusTypeDto[]>(
    "/api/procurement/status-types"
  )
    .then((rows) => {
      cache.value = rows
      cache.error = null
      return rows
    })
    .catch((err: unknown) => {
      cache.error = err instanceof Error ? err.message : "טעינת סטטוסים נכשלה"
      // במקרה של שגיאה נאפשר ריטריי — אל תשמור promise נפרדת
      cache.promise = null
      throw err
    })
  return cache.promise
}

export function invalidatePoStatusTypesCache(): void {
  cache.value = null
  cache.error = null
  cache.promise = null
}

export type UsePoStatusTypesResult = {
  statusMap: Record<string, PoStatusTypeDto>
  orderedStatuses: PoStatusTypeDto[]
  isLoading: boolean
  error: string | null
  reload: () => void
}

export function usePoStatusTypes(): UsePoStatusTypesResult {
  const [tick, setTick] = React.useState(0)
  const [statuses, setStatuses] = React.useState<PoStatusTypeDto[] | null>(
    cache.value
  )
  const [error, setError] = React.useState<string | null>(cache.error)
  const [isLoading, setIsLoading] = React.useState<boolean>(!cache.value)

  React.useEffect(() => {
    if (cache.value) {
      setStatuses(cache.value)
      setIsLoading(false)
      return
    }
    let cancelled = false
    setIsLoading(true)
    loadStatuses()
      .then((rows) => {
        if (cancelled) return
        setStatuses(rows)
        setError(null)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : "טעינת סטטוסים נכשלה")
        setStatuses([])
      })
      .finally(() => {
        if (cancelled) return
        setIsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [tick])

  const statusMap = React.useMemo(() => {
    const map: Record<string, PoStatusTypeDto> = {}
    for (const s of statuses ?? []) map[s.status] = s
    return map
  }, [statuses])

  const orderedStatuses = React.useMemo(
    () => sortStatuses(statuses ?? []),
    [statuses]
  )

  const reload = React.useCallback(() => {
    invalidatePoStatusTypesCache()
    setTick((t) => t + 1)
  }, [])

  return { statusMap, orderedStatuses, isLoading, error, reload }
}

// ---------------------------------------------------------------------------
// Tone helpers — mapping מ-DB flags ל-design-system tone של SmartListStatusPill.
// ---------------------------------------------------------------------------

export type PoStatusTone = "neutral" | "success" | "warning" | "danger" | "info"

export function resolvePoStatusTone(
  meta: PoStatusTypeDto | null | undefined
): PoStatusTone {
  if (!meta) return "neutral"
  if (meta.isCancelled) return "danger"
  if (meta.isClosed) return "success"
  if (meta.lifecycleStage === "pre-approval") {
    // DRAFT / PROFORMA / PENDING_APPROVAL
    return meta.status === "PENDING_APPROVAL" ? "warning" : "neutral"
  }
  if (meta.isPostApproval) {
    // APPROVED / SENT / SHIPMENT_CONFIRMED / PARTIALLY_RECEIVED / FULLY_RECEIVED...
    if (meta.status === "FULLY_RECEIVED" || meta.status === "APPROVED") {
      return "success"
    }
    return "info"
  }
  return "neutral"
}

export function resolvePoStatusLabel(
  status: string,
  statusMap: Record<string, PoStatusTypeDto>
): string {
  return statusMap[status]?.nameHe ?? status
}
