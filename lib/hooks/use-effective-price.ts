"use client"

import * as React from "react"
import { z } from "zod"

import {
  COMPANY_COOKIE_KEY,
  type CompanyContextId,
  resolveCompanyContext,
} from "@/lib/company-context"

const effectivePriceSchema = z.object({
  unitPrice: z.coerce.number(),
  source: z.string(),
  isAgreedPrice: z.boolean().optional().default(false),
  priceListId: z.string().nullable().optional(),
  blanketPurchaseOrderLineId: z.string().nullable().optional(),
  appliedMinQuantity: z.coerce.number().nullable().optional(),
  warningCode: z.string().nullable().optional(),
  warningMessage: z.string().nullable().optional(),
})

const envelopeSchema = z.object({
  data: effectivePriceSchema,
})

export type EffectivePriceSnapshot = z.infer<typeof effectivePriceSchema>

function getActiveCompanyIdFromCookie(): CompanyContextId | null {
  if (typeof document === "undefined") return null
  const match = document.cookie.match(
    new RegExp(
      `(?:^|;\\s*)${COMPANY_COOKIE_KEY.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}=([^;]*)`
    )
  )
  return resolveCompanyContext(match?.[1]?.trim())
}

export type EffectivePriceLookupInput = {
  itemId: string | null | undefined
  supplierId: string | null | undefined
  quantity: number
  date?: string
}

export function useEffectivePrice(input: EffectivePriceLookupInput) {
  const { itemId, supplierId, quantity, date } = input
  const [data, setData] = React.useState<EffectivePriceSnapshot | null>(null)
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  // Reset data AND error whenever the primary identity (item/supplier)
  // changes to prevent cross-contract data leaks and stale error banners.
  const identityKey = `${itemId ?? ""}|${supplierId ?? ""}`

  React.useEffect(() => {
    setData(null)
    setError(null)
  }, [identityKey])

  React.useEffect(() => {
    if (!itemId || !supplierId) {
      setData(null)
      setLoading(false)
      setError(null)
      return
    }

    const controller = new AbortController()
    setLoading(true)
    setError(null)

    void (async () => {
      try {
        const activeCompanyId = getActiveCompanyIdFromCookie()
        const headers = new Headers({ "content-type": "application/json" })
        if (activeCompanyId) {
          headers.set("x-company-id", activeCompanyId)
          headers.set("x-active-company-id", activeCompanyId)
        }

        const response = await fetch("/api/erp/pricing/effective-price", {
          method: "POST",
          headers,
          credentials: "same-origin",
          cache: "no-store",
          signal: controller.signal,
          body: JSON.stringify({
            itemId,
            supplierId,
            quantity: Number.isFinite(quantity) ? quantity : 0,
            date,
          }),
        })

        if (controller.signal.aborted) return

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`)
        }

        const raw = await response.json()
        const parsed = envelopeSchema.safeParse(raw)
        if (!parsed.success) {
          console.error("Effective price validation failed:", parsed.error)
          throw new Error("תשובת מחיר אפקטיבי אינה בפורמט תקין")
        }

        if (controller.signal.aborted) return
        setData(parsed.data.data)
      } catch (err) {
        if (controller.signal.aborted) return
        setData(null)
        setError(err instanceof Error ? err.message : "שליפת מחיר אפקטיבי נכשלה")
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    })()

    return () => {
      controller.abort()
    }
  }, [itemId, supplierId, quantity, date])

  return { data, loading, error, setData }
}
