"use client"

import * as React from "react"

type LookupCacheEntry = {
  expiresAt: number
  data: unknown
}

const LOOKUP_CACHE = new Map<string, LookupCacheEntry>()

type UseErpLookupCacheOptions<T> = {
  cacheKey: string
  staleMs?: number
  loader: () => Promise<T[]>
}

type UseErpLookupCacheResult<T> = {
  data: T[]
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
}

export function useErpLookupCache<T>({
  cacheKey,
  staleMs = 5 * 60 * 1000,
  loader,
}: UseErpLookupCacheOptions<T>): UseErpLookupCacheResult<T> {
  const [data, setData] = React.useState<T[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  const load = React.useCallback(
    async (force = false) => {
      setError(null)
      const now = Date.now()
      const cached = LOOKUP_CACHE.get(cacheKey)
      if (!force && cached && cached.expiresAt > now) {
        setData((cached.data as T[]) ?? [])
        setLoading(false)
        return
      }

      setLoading(true)
      try {
        const rows = await loader()
        LOOKUP_CACHE.set(cacheKey, {
          data: rows,
          expiresAt: now + staleMs,
        })
        setData(rows)
      } catch (loadError) {
        setData([])
        setError(loadError instanceof Error ? loadError.message : "טעינת רשימה נכשלה")
      } finally {
        setLoading(false)
      }
    },
    [cacheKey, loader, staleMs]
  )

  React.useEffect(() => {
    void load(false)
  }, [load])

  const refresh = React.useCallback(async () => {
    await load(true)
  }, [load])

  return { data, loading, error, refresh }
}

