/* eslint-disable react-hooks/refs -- TODO(react-compiler): refactor cached refs out of render path. */
"use client"

import * as React from "react"

export type ProcurementBoqRow = { id: string }
export type ProcurementRowState = {
  selected?: boolean
  orderQty?: string
  unitPrice?: string
  catalogItemId?: string
}

type SupplierPriceRow = { lastPrice: number }

type UseProcurementEngineArgs = {
  boqRows: ProcurementBoqRow[]
  rowState: Record<string, ProcurementRowState>
  comparisonCacheRef: React.RefObject<Record<string, SupplierPriceRow[]>>
  fetchSupplierComparisonForItem: (itemId: string) => Promise<SupplierPriceRow[]>
}

function parseDecimal(s: string | undefined): number {
  const n = parseFloat(String(s ?? "").replace(",", ".").trim())
  return Number.isFinite(n) ? n : 0
}

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100
}

export function useProcurementEngine({
  boqRows,
  rowState,
  comparisonCacheRef,
  fetchSupplierComparisonForItem,
}: UseProcurementEngineArgs) {
  const costSummary = React.useMemo(() => {
    let selectedTotal = 0
    let minTotal = 0

    for (const r of boqRows) {
      const st = rowState[r.id]
      if (!st?.selected) continue

      const qty = parseDecimal(st.orderQty)
      if (qty <= 0) continue

      const selectedUnit = parseDecimal(st.unitPrice)
      selectedTotal += qty * selectedUnit

      const itemId = st.catalogItemId
      const cachedBest = itemId
        ? comparisonCacheRef.current?.[itemId]?.[0]?.lastPrice
        : undefined
      const minUnit =
        cachedBest != null && Number.isFinite(cachedBest)
          ? cachedBest
          : selectedUnit
      minTotal += qty * minUnit
    }

    selectedTotal = roundMoney(selectedTotal)
    minTotal = roundMoney(minTotal)
    const potentialSavings = Math.max(0, roundMoney(selectedTotal - minTotal))

    return { selectedTotal, minTotal, potentialSavings }
  }, [boqRows, comparisonCacheRef, rowState])

  const calculateTotals = React.useCallback(
    async (
      lines: Array<{
        tenderBoqItemId: string
        quantity: number
        unitPrice: number
        catalogItemId?: string | null
      }>
    ): Promise<{ minTotal: number; selectedTotal: number }> => {
      let minTotal = 0
      let selectedTotal = 0

      for (const line of lines) {
        const qty = Number.isFinite(line.quantity) ? line.quantity : 0
        const selectedUnit = Number.isFinite(line.unitPrice) ? line.unitPrice : 0
        if (qty <= 0) continue

        selectedTotal += qty * selectedUnit

        const itemId = line.catalogItemId?.trim()
        const comparisonRowsForItem = itemId
          ? await fetchSupplierComparisonForItem(itemId)
          : []
        const historicalMin = comparisonRowsForItem[0]?.lastPrice
        const minUnit =
          historicalMin != null && Number.isFinite(historicalMin)
            ? historicalMin
            : selectedUnit
        minTotal += qty * minUnit
      }

      return {
        minTotal: roundMoney(minTotal),
        selectedTotal: roundMoney(selectedTotal),
      }
    },
    [fetchSupplierComparisonForItem]
  )

  const getDeviation = React.useCallback(
    (selectedTotal: number, minTotal: number) => {
      const diff = Math.max(0, roundMoney(selectedTotal - minTotal))
      const percent =
        minTotal > 0 ? roundMoney((diff / Math.max(minTotal, 0.0001)) * 100) : 0
      return {
        diff,
        percent,
        isCritical: percent > 8,
      }
    },
    []
  )

  return {
    costSummary,
    calculateTotals,
    getDeviation,
  }
}
