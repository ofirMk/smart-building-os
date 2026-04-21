"use client"

import * as React from "react"
import { z } from "zod"

import { apiGet } from "@/lib/utils/api-client"

export type BillingSimulationProjection = {
  projectedBillTotal: number
  netCashInflow: number
  marginImpact: number
}

export type BillingSimulationLineInput = {
  id: string
  boqRef: string | null
  itemId: string | null
  lastApprovedPct: number
  unitPrice: number
}

export type LinkedSubcontractorEntry = {
  contractId: string
  lineId: string
  supplierId: string
  contractNumber: string
  description: string
  boqLineId: string | null
  itemId: string | null
  quantity: number
  unitPrice: number
  payoutAmount: number
}

export type UseBillingSimulationInput = {
  isEnabled: boolean
  calculateProjection: (
    overrides: Record<string, number>,
    signal: AbortSignal
  ) => BillingSimulationProjection | Promise<BillingSimulationProjection>
  projectId: string | undefined
  lines: BillingSimulationLineInput[]
  clientRetentionPct?: number
  subcontractorRetentionPct?: number
  vatPct?: number
}

export type UseBillingSimulationResult = {
  simulationByLineId: Record<string, number>
  updateSimulationPercent: (lineId: string, pct: number) => void
  clearSimulation: () => void
  hasSimulationChanges: boolean
  projection: BillingSimulationProjection
  linkedSubcontractorByClientLineId: Record<string, LinkedSubcontractorEntry[]>
  payoutBreakdownByClientLineId: Record<string, LinkedSubcontractorEntry[]>
  expectedSubcontractorPayout: number
  netMarginProfit: number
  freeCashLiquidity: number
  marginRiskByLineId: Record<string, boolean>
  loadingLinkedSubcontractors: boolean
}

const ZERO_PROJECTION: BillingSimulationProjection = {
  projectedBillTotal: 0,
  netCashInflow: 0,
  marginImpact: 0,
}

const subcontractorContractSchema = z.object({
  id: z.string().uuid(),
  contractNumber: z.string(),
  supplierId: z.string().uuid(),
})

const subcontractorContractLineSchema = z.object({
  id: z.string().uuid(),
  boqLineId: z.string().nullable(),
  itemId: z.string().nullable(),
  description: z.string(),
  quantity: z.coerce.number(),
  unitPrice: z.coerce.number(),
})

const subcontractorContractsSchema = z.array(subcontractorContractSchema)
const subcontractorContractLinesSchema = z.array(subcontractorContractLineSchema)

function normalizeBoqRef(value: string | null | undefined): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
}

function clampPercent(value: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, value))
}

function roundOneDecimal(value: number): number {
  return Number(z.coerce.number().catch(0).parse(value).toFixed(1))
}

export function useBillingSimulation(input: UseBillingSimulationInput): UseBillingSimulationResult {
  const {
    isEnabled,
    calculateProjection,
    projectId,
    lines,
    clientRetentionPct = 0,
    subcontractorRetentionPct = 0,
    vatPct = 17,
  } = input

  const [simulationByLineId, setSimulationByLineId] = React.useState<Record<string, number>>({})
  const [projection, setProjection] = React.useState<BillingSimulationProjection>(ZERO_PROJECTION)
  const [linkedSubcontractorByClientLineId, setLinkedSubcontractorByClientLineId] = React.useState<
    Record<string, LinkedSubcontractorEntry[]>
  >({})
  const [loadingLinkedSubcontractors, setLoadingLinkedSubcontractors] = React.useState(false)

  React.useEffect(() => {
    if (!isEnabled) {
      setSimulationByLineId({})
      setProjection(ZERO_PROJECTION)
    }
  }, [isEnabled])

  React.useEffect(() => {
    if (!isEnabled) {
      setProjection(ZERO_PROJECTION)
      return
    }

    const controller = new AbortController()
    void (async () => {
      try {
        const next = await calculateProjection(simulationByLineId, controller.signal)
        if (controller.signal.aborted) return
        setProjection({
          projectedBillTotal: z.coerce.number().catch(0).parse(next?.projectedBillTotal ?? 0),
          netCashInflow: z.coerce.number().catch(0).parse(next?.netCashInflow ?? 0),
          marginImpact: z.coerce.number().catch(0).parse(next?.marginImpact ?? 0),
        })
      } catch {
        if (controller.signal.aborted) return
        setProjection(ZERO_PROJECTION)
      }
    })()

    return () => controller.abort()
  }, [isEnabled, simulationByLineId, calculateProjection])

  React.useEffect(() => {
    if (!isEnabled || !projectId || lines.length === 0) {
      setLinkedSubcontractorByClientLineId({})
      setLoadingLinkedSubcontractors(false)
      return
    }

    const controller = new AbortController()
    setLoadingLinkedSubcontractors(true)

    void (async () => {
      try {
        const contracts = await apiGet<
          Array<{ id: string; contractNumber: string; supplierId: string }>
        >(`/api/contracts?projectId=${encodeURIComponent(projectId)}&status=ACTIVE`, {
          schema: subcontractorContractsSchema,
          signal: controller.signal,
        })

        if (controller.signal.aborted) return
        if (contracts.length === 0) {
          setLinkedSubcontractorByClientLineId({})
          return
        }

        const linkedBuckets = await Promise.all(
          contracts.map(async (contract) => {
            const contractLines = await apiGet<
              Array<{
                id: string
                boqLineId: string | null
                itemId: string | null
                description: string
                quantity: number
                unitPrice: number
              }>
            >(`/api/contracts/${contract.id}/lines`, {
              schema: subcontractorContractLinesSchema,
              signal: controller.signal,
            })

            return contractLines.map((line) => ({
              contractId: contract.id,
              contractNumber: contract.contractNumber,
              supplierId: contract.supplierId,
              lineId: line.id,
              description: line.description,
              boqLineId: line.boqLineId,
              itemId: line.itemId,
              quantity: z.coerce.number().catch(0).parse(line.quantity),
              unitPrice: z.coerce.number().catch(0).parse(line.unitPrice),
              payoutAmount: 0,
            }))
          })
        )

        if (controller.signal.aborted) return
        const linkedLines = linkedBuckets.flat()
        const nextMap: Record<string, LinkedSubcontractorEntry[]> = {}

        for (const clientLine of lines) {
          const clientBoqRef = normalizeBoqRef(clientLine.boqRef)
          if (clientBoqRef.length === 0) continue

          const linked = linkedLines.filter(
            (subLine) => normalizeBoqRef(subLine.boqLineId) === clientBoqRef
          )
          if (linked.length > 0) {
            nextMap[clientLine.id] = linked
          }
        }

        setLinkedSubcontractorByClientLineId(nextMap)
      } catch {
        if (!controller.signal.aborted) {
          setLinkedSubcontractorByClientLineId({})
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoadingLinkedSubcontractors(false)
        }
      }
    })()

    return () => controller.abort()
  }, [isEnabled, lines, projectId])

  const updateSimulationPercent = React.useCallback(
    (lineId: string, pct: number) => {
      if (!isEnabled) return
      setSimulationByLineId((prev) => {
        const next = z.coerce.number().catch(0).parse(pct)
        if (prev[lineId] === next) return prev
        return { ...prev, [lineId]: next }
      })
    },
    [isEnabled]
  )

  const clearSimulation = React.useCallback(() => {
    setSimulationByLineId({})
    setProjection(ZERO_PROJECTION)
  }, [])

  const hasSimulationChanges = React.useMemo(
    () => Object.keys(simulationByLineId).length > 0,
    [simulationByLineId]
  )

  const payoutBreakdownByClientLineId = React.useMemo(() => {
    const breakdownByLineId: Record<string, LinkedSubcontractorEntry[]> = {}

    for (const line of lines) {
      const linkedLines = linkedSubcontractorByClientLineId[line.id] ?? []
      if (linkedLines.length === 0) continue

      const baselinePct = z.coerce.number().catch(0).parse(line.lastApprovedPct ?? 0)
      const simulatedTotalPct = z.coerce
        .number()
        .catch(baselinePct)
        .parse(simulationByLineId[line.id] ?? baselinePct)
      const normalizedTotalPct = clampPercent(simulatedTotalPct, baselinePct, 100)
      const simulatedCurrentPct = clampPercent(normalizedTotalPct - baselinePct, 0, 100)

      breakdownByLineId[line.id] = linkedLines.map((linkedLine) => ({
        ...linkedLine,
        payoutAmount: roundOneDecimal(
          z.coerce.number().catch(0).parse(linkedLine.quantity) *
            z.coerce.number().catch(0).parse(linkedLine.unitPrice) *
            (simulatedCurrentPct / 100)
        ),
      }))
    }

    return breakdownByLineId
  }, [linkedSubcontractorByClientLineId, lines, simulationByLineId])

  const expectedSubcontractorPayout = React.useMemo(() => {
    const total = Object.values(payoutBreakdownByClientLineId).reduce((sum, entries) => {
      return (
        sum +
        entries.reduce(
          (lineTotal, entry) => lineTotal + z.coerce.number().catch(0).parse(entry.payoutAmount),
          0
        )
      )
    }, 0)

    return roundOneDecimal(total)
  }, [payoutBreakdownByClientLineId])

  const netMarginProfit = React.useMemo(() => {
    const simulatedRevenue = z.coerce.number().catch(0).parse(projection.projectedBillTotal)
    return roundOneDecimal(simulatedRevenue - expectedSubcontractorPayout)
  }, [expectedSubcontractorPayout, projection.projectedBillTotal])

  const freeCashLiquidity = React.useMemo(() => {
    const simulatedRevenue = z.coerce.number().catch(0).parse(projection.projectedBillTotal)
    const simulatedVendorCost = z.coerce.number().catch(0).parse(expectedSubcontractorPayout)
    const normalizedClientRetention = clampPercent(
      z.coerce.number().catch(0).parse(clientRetentionPct),
      0,
      100
    )
    const normalizedSubRetention = clampPercent(
      z.coerce.number().catch(0).parse(subcontractorRetentionPct),
      0,
      100
    )
    const normalizedVat = Math.max(0, z.coerce.number().catch(0).parse(vatPct))

    const clientCashAfterRetentionAndVat =
      simulatedRevenue *
      (1 - normalizedClientRetention / 100) *
      (1 + normalizedVat / 100)
    const subcontractorCashAfterRetentionAndVat =
      simulatedVendorCost *
      (1 - normalizedSubRetention / 100) *
      (1 + normalizedVat / 100)

    return roundOneDecimal(clientCashAfterRetentionAndVat - subcontractorCashAfterRetentionAndVat)
  }, [
    clientRetentionPct,
    expectedSubcontractorPayout,
    projection.projectedBillTotal,
    subcontractorRetentionPct,
    vatPct,
  ])

  const marginRiskByLineId = React.useMemo(() => {
    const riskMap: Record<string, boolean> = {}

    for (const line of lines) {
      const linkedLines = linkedSubcontractorByClientLineId[line.id] ?? []
      if (linkedLines.length === 0) {
        riskMap[line.id] = false
        continue
      }
      const highestSubcontractorUnitPrice = linkedLines.reduce((max, linkedLine) => {
        const price = z.coerce.number().catch(0).parse(linkedLine.unitPrice)
        return Math.max(max, price)
      }, 0)
      const clientUnitPrice = z.coerce.number().catch(0).parse(line.unitPrice)
      riskMap[line.id] = highestSubcontractorUnitPrice > clientUnitPrice
    }

    return riskMap
  }, [linkedSubcontractorByClientLineId, lines])

  return {
    simulationByLineId,
    updateSimulationPercent,
    clearSimulation,
    hasSimulationChanges,
    projection,
    linkedSubcontractorByClientLineId,
    payoutBreakdownByClientLineId,
    expectedSubcontractorPayout,
    netMarginProfit,
    freeCashLiquidity,
    marginRiskByLineId,
    loadingLinkedSubcontractors,
  }
}
