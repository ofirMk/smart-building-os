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
  subcontractorUnitPrice: number
  subcontractorQuantity: number
  payoutAmount: number
}

type UseBillingSimulationInput = {
  isEnabled: boolean
  calculateProjection: (
    overrides: Record<string, number>,
    signal: AbortSignal
  ) => BillingSimulationProjection | Promise<BillingSimulationProjection>
  projectId: string | undefined
  lines: BillingSimulationLineInput[]
  clientRetentionPct: number
  subcontractorRetentionPct: number
  vatPct: number
}

type UseBillingSimulationResult = {
  simulationByLineId: Record<string, number>
  updateSimulationPercent: (lineId: string, pct: number) => void
  clearSimulation: () => void
  hasSimulationChanges: boolean
  projection: BillingSimulationProjection
  linkedSubcontractorByClientLineId: Record<string, LinkedSubcontractorEntry[]>
  payoutBreakdownByClientLineId: Record<string, LinkedSubcontractorEntry[]>
  expectedSubcontractorPayout: number
  netProjectMarginThisBill: number
  netMarginProfit: number
  freeCashLiquidity: number
  marginRiskByLineId: Record<string, boolean>
  loadingLinkedSubcontractors: boolean
}

const linkedSubcontractorSchema = z.object({
  contractId: z.string().uuid(),
  contractNumber: z.string(),
  supplierId: z.string().uuid(),
  lineId: z.string().uuid(),
  description: z.string(),
  subcontractorUnitPrice: z.coerce.number(),
  subcontractorQuantity: z.coerce.number(),
  subcontractorTotalPrice: z.coerce.number(),
})

const linkedClientLineSchema = z.object({
  clientLineId: z.string().uuid(),
  boqRef: z.string(),
  clientUnitPrice: z.coerce.number(),
  links: z.array(linkedSubcontractorSchema),
})

const ZERO_PROJECTION: BillingSimulationProjection = {
  projectedBillTotal: 0,
  netCashInflow: 0,
  marginImpact: 0,
}

function roundOne(value: number): number {
  return Number(z.coerce.number().catch(0).parse(value).toFixed(1))
}

function clampPercent(value: number, min = 0, max = 100): number {
  return Math.min(max, Math.max(min, value))
}

export function useBillingSimulation(
  options: UseBillingSimulationInput
): UseBillingSimulationResult {
  const {
    isEnabled,
    calculateProjection,
    projectId,
    lines,
    clientRetentionPct,
    subcontractorRetentionPct,
    vatPct,
  } = options

  const [simulationByLineId, setSimulationByLineId] = React.useState<Record<string, number>>({})
  const [projection, setProjection] = React.useState<BillingSimulationProjection>(ZERO_PROJECTION)
  const [loadingLinkedSubcontractors, setLoadingLinkedSubcontractors] = React.useState(false)
  const [linkedSubcontractorByClientLineId, setLinkedSubcontractorByClientLineId] =
    React.useState<Record<string, LinkedSubcontractorEntry[]>>({})

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
        setProjection(next ?? ZERO_PROJECTION)
      } catch {
        if (controller.signal.aborted) return
        setProjection(ZERO_PROJECTION)
      }
    })()
    return () => controller.abort()
  }, [isEnabled, simulationByLineId, calculateProjection])

  React.useEffect(() => {
    setLinkedSubcontractorByClientLineId({})
    if (!projectId || lines.length === 0) {
      setLoadingLinkedSubcontractors(false)
      return
    }
    const controller = new AbortController()
    setLoadingLinkedSubcontractors(true)

    void (async () => {
      try {
        const rows = await apiGet(
          `/api/erp/projects/${projectId}/linked-subcontractor-lines`,
          { schema: linkedClientLineSchema.array(), signal: controller.signal }
        )
        if (controller.signal.aborted) return
        const lineIdSet = new Set(lines.map((line) => line.id))
        const nextMap: Record<string, LinkedSubcontractorEntry[]> = {}
        for (const row of rows) {
          if (!lineIdSet.has(row.clientLineId)) continue
          nextMap[row.clientLineId] = row.links.map((entry) => ({
            contractId: entry.contractId,
            lineId: entry.lineId,
            supplierId: entry.supplierId,
            contractNumber: entry.contractNumber,
            description: entry.description,
            subcontractorUnitPrice: z.coerce.number().catch(0).parse(entry.subcontractorUnitPrice),
            subcontractorQuantity: z.coerce.number().catch(0).parse(entry.subcontractorQuantity),
            payoutAmount: 0,
          }))
        }
        setLinkedSubcontractorByClientLineId(nextMap)
      } catch {
        if (!controller.signal.aborted) {
          setLinkedSubcontractorByClientLineId({})
        }
      } finally {
        if (!controller.signal.aborted) setLoadingLinkedSubcontractors(false)
      }
    })()
    return () => controller.abort()
  }, [projectId, lines])

  const lineById = React.useMemo(() => {
    const map = new Map<string, BillingSimulationLineInput>()
    for (const line of lines) map.set(line.id, line)
    return map
  }, [lines])

  const payoutBreakdownByClientLineId = React.useMemo(() => {
    const next: Record<string, LinkedSubcontractorEntry[]> = {}
    if (!isEnabled) return next
    for (const [lineId, linkedEntries] of Object.entries(linkedSubcontractorByClientLineId)) {
      const line = lineById.get(lineId)
      if (!line) continue
      const baselinePct = z.coerce.number().catch(0).parse(line.lastApprovedPct ?? 0)
      const simulatedTotalPct = z.coerce.number().catch(baselinePct).parse(simulationByLineId[lineId] ?? baselinePct)
      const normalizedTotalPct = clampPercent(simulatedTotalPct, baselinePct, 100)
      const simulatedCurrentPct = clampPercent(normalizedTotalPct - baselinePct, 0, 100)
      next[lineId] = linkedEntries.map((entry) => {
        const lineCost =
          z.coerce.number().catch(0).parse(entry.subcontractorUnitPrice) *
          z.coerce.number().catch(0).parse(entry.subcontractorQuantity)
        return {
          ...entry,
          payoutAmount: roundOne((lineCost * simulatedCurrentPct) / 100),
        }
      })
    }
    return next
  }, [isEnabled, linkedSubcontractorByClientLineId, lineById, simulationByLineId])

  const expectedSubcontractorPayout = React.useMemo(() => {
    let total = 0
    for (const entries of Object.values(payoutBreakdownByClientLineId)) {
      for (const entry of entries) {
        total += z.coerce.number().catch(0).parse(entry.payoutAmount)
      }
    }
    return roundOne(total)
  }, [payoutBreakdownByClientLineId])

  const netMarginProfit = React.useMemo(() => {
    const simulatedRevenue = z.coerce.number().catch(0).parse(projection.projectedBillTotal)
    return roundOne(simulatedRevenue - expectedSubcontractorPayout)
  }, [projection.projectedBillTotal, expectedSubcontractorPayout])

  const netProjectMarginThisBill = React.useMemo(() => {
    const simulatedCashInflow = z.coerce.number().catch(0).parse(projection.netCashInflow)
    return roundOne(simulatedCashInflow - expectedSubcontractorPayout)
  }, [projection.netCashInflow, expectedSubcontractorPayout])

  const freeCashLiquidity = React.useMemo(() => {
    const simulatedRevenue = z.coerce.number().catch(0).parse(projection.projectedBillTotal)
    const clientRetention = z.coerce.number().catch(0).parse(clientRetentionPct)
    const subcontractorRetention = z.coerce.number().catch(0).parse(subcontractorRetentionPct)
    const vat = z.coerce.number().catch(0).parse(vatPct)
    const clientCashIn =
      simulatedRevenue * (1 - clampPercent(clientRetention, 0, 100) / 100) * (1 + Math.max(0, vat) / 100)
    const subcontractorCashOut =
      expectedSubcontractorPayout *
      (1 - clampPercent(subcontractorRetention, 0, 100) / 100) *
      (1 + Math.max(0, vat) / 100)
    return roundOne(clientCashIn - subcontractorCashOut)
  }, [projection.projectedBillTotal, expectedSubcontractorPayout, clientRetentionPct, subcontractorRetentionPct, vatPct])

  const marginRiskByLineId = React.useMemo(() => {
    const next: Record<string, boolean> = {}
    for (const line of lines) {
      const clientUnitPrice = z.coerce.number().catch(0).parse(line.unitPrice ?? 0)
      const linked = linkedSubcontractorByClientLineId[line.id] ?? []
      next[line.id] = linked.some(
        (entry) =>
          z.coerce.number().catch(0).parse(entry.subcontractorUnitPrice) > clientUnitPrice
      )
    }
    return next
  }, [linkedSubcontractorByClientLineId, lines])

  const updateSimulationPercent = React.useCallback(
    (lineId: string, pct: number) => {
      if (!isEnabled) return
      setSimulationByLineId((prev) => {
        const nextPct = z.coerce.number().catch(0).parse(pct)
        if (prev[lineId] === nextPct) return prev
        return { ...prev, [lineId]: nextPct }
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

  return {
    simulationByLineId,
    updateSimulationPercent,
    clearSimulation,
    hasSimulationChanges,
    projection,
    linkedSubcontractorByClientLineId,
    payoutBreakdownByClientLineId,
    expectedSubcontractorPayout,
    netProjectMarginThisBill,
    netMarginProfit,
    freeCashLiquidity,
    marginRiskByLineId,
    loadingLinkedSubcontractors,
  }
}
/*
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
  subcontractorUnitPrice: number
  subcontractorQuantity: number
  payoutAmount: number
}

type UseBillingSimulationInput = {
  isEnabled: boolean
  calculateProjection: (
    overrides: Record<string, number>,
    signal: AbortSignal
  ) => BillingSimulationProjection | Promise<BillingSimulationProjection>
  projectId: string | undefined
  lines: BillingSimulationLineInput[]
  clientRetentionPct: number
  subcontractorRetentionPct: number
  vatPct: number
}

type UseBillingSimulationResult = {
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

const linkedSubcontractorSchema = z.object({
  contractId: z.string().uuid(),
  contractNumber: z.string(),
  supplierId: z.string().uuid(),
  lineId: z.string().uuid(),
  description: z.string(),
  subcontractorUnitPrice: z.coerce.number(),
  subcontractorQuantity: z.coerce.number(),
  subcontractorTotalPrice: z.coerce.number(),
})

const linkedClientLineSchema = z.object({
  clientLineId: z.string().uuid(),
  boqRef: z.string(),
  clientUnitPrice: z.coerce.number(),
  links: z.array(linkedSubcontractorSchema),
})

const ZERO_PROJECTION: BillingSimulationProjection = {
  projectedBillTotal: 0,
  netCashInflow: 0,
  marginImpact: 0,
}

function roundOne(value: number): number {
  return Number(z.coerce.number().catch(0).parse(value).toFixed(1))
}

function clampPercent(value: number, min = 0, max = 100): number {
  return Math.min(max, Math.max(min, value))
}

export function useBillingSimulation(
  options: UseBillingSimulationInput
): UseBillingSimulationResult {
  const {
    isEnabled,
    calculateProjection,
    projectId,
    lines,
    clientRetentionPct,
    subcontractorRetentionPct,
    vatPct,
  } = options

  const [simulationByLineId, setSimulationByLineId] = React.useState<
    Record<string, number>
  >({})
  const [projection, setProjection] =
    React.useState<BillingSimulationProjection>(ZERO_PROJECTION)
  const [loadingLinkedSubcontractors, setLoadingLinkedSubcontractors] =
    React.useState(false)
  const [linkedSubcontractorByClientLineId, setLinkedSubcontractorByClientLineId] =
    React.useState<Record<string, LinkedSubcontractorEntry[]>>({})

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
        setProjection(next ?? ZERO_PROJECTION)
      } catch {
        if (controller.signal.aborted) return
        setProjection(ZERO_PROJECTION)
      }
    })()

    return () => controller.abort()
  }, [isEnabled, simulationByLineId, calculateProjection])

  React.useEffect(() => {
    setLinkedSubcontractorByClientLineId({})
    if (!projectId || lines.length === 0) {
      setLoadingLinkedSubcontractors(false)
      return
    }

    const controller = new AbortController()
    setLoadingLinkedSubcontractors(true)

    void (async () => {
      try {
        const rows = await apiGet(
          `/api/erp/projects/${projectId}/linked-subcontractor-lines`,
          { schema: linkedClientLineSchema.array(), signal: controller.signal }
        )
        if (controller.signal.aborted) return

        const lineIdSet = new Set(lines.map((line) => line.id))
        const nextMap: Record<string, LinkedSubcontractorEntry[]> = {}
        for (const row of rows) {
          if (!lineIdSet.has(row.clientLineId)) continue
          nextMap[row.clientLineId] = row.links.map((entry) => ({
            contractId: entry.contractId,
            lineId: entry.lineId,
            supplierId: entry.supplierId,
            contractNumber: entry.contractNumber,
            description: entry.description,
            subcontractorUnitPrice: z.coerce.number().catch(0).parse(entry.subcontractorUnitPrice),
            subcontractorQuantity: z.coerce.number().catch(0).parse(entry.subcontractorQuantity),
            payoutAmount: 0,
          }))
        }
        setLinkedSubcontractorByClientLineId(nextMap)
      } catch {
        if (controller.signal.aborted) return
        setLinkedSubcontractorByClientLineId({})
      } finally {
        if (!controller.signal.aborted) setLoadingLinkedSubcontractors(false)
      }
    })()

    return () => controller.abort()
  }, [projectId, lines])

  const lineById = React.useMemo(() => {
    const map = new Map<string, BillingSimulationLineInput>()
    for (const line of lines) map.set(line.id, line)
    return map
  }, [lines])

  const payoutBreakdownByClientLineId = React.useMemo(() => {
    const next: Record<string, LinkedSubcontractorEntry[]> = {}
    if (!isEnabled) return next

    for (const [lineId, linkedEntries] of Object.entries(
      linkedSubcontractorByClientLineId
    )) {
      const line = lineById.get(lineId)
      if (!line) continue
      const baselinePct = z.coerce.number().catch(0).parse(line.lastApprovedPct ?? 0)
      const simulatedTotalPct = z.coerce
        .number()
        .catch(baselinePct)
        .parse(simulationByLineId[lineId] ?? baselinePct)
      const normalizedTotalPct = clampPercent(simulatedTotalPct, baselinePct, 100)
      const simulatedCurrentPct = clampPercent(normalizedTotalPct - baselinePct, 0, 100)

      next[lineId] = linkedEntries.map((entry) => {
        const lineCost =
          z.coerce.number().catch(0).parse(entry.subcontractorUnitPrice) *
          z.coerce.number().catch(0).parse(entry.subcontractorQuantity)
        return {
          ...entry,
          payoutAmount: roundOne((lineCost * simulatedCurrentPct) / 100),
        }
      })
    }

    return next
  }, [isEnabled, linkedSubcontractorByClientLineId, lineById, simulationByLineId])

  const marginRiskByLineId = React.useMemo(() => {
    const next: Record<string, boolean> = {}
    for (const line of lines) {
      const clientUnitPrice = z.coerce.number().catch(0).parse(line.unitPrice ?? 0)
      const linked = linkedSubcontractorByClientLineId[line.id] ?? []
      next[line.id] = linked.some(
        (entry) =>
          z.coerce.number().catch(0).parse(entry.subcontractorUnitPrice) > clientUnitPrice
      )
    }
    return next
  }, [linkedSubcontractorByClientLineId, lines])

  const expectedSubcontractorPayout = React.useMemo(() => {
    let total = 0
    for (const entries of Object.values(payoutBreakdownByClientLineId)) {
      for (const entry of entries) {
        total += z.coerce.number().catch(0).parse(entry.payoutAmount)
      }
    }
    return roundOne(total)
  }, [payoutBreakdownByClientLineId])

  const netMarginProfit = React.useMemo(() => {
    const simulatedRevenue = z.coerce.number().catch(0).parse(projection.projectedBillTotal)
    return roundOne(simulatedRevenue - expectedSubcontractorPayout)
  }, [projection.projectedBillTotal, expectedSubcontractorPayout])

  const freeCashLiquidity = React.useMemo(() => {
    const simulatedRevenue = z.coerce.number().catch(0).parse(projection.projectedBillTotal)
    const clientRetention = z.coerce.number().catch(0).parse(clientRetentionPct)
    const subcontractorRetention = z.coerce
      .number()
      .catch(0)
      .parse(subcontractorRetentionPct)
    const vat = z.coerce.number().catch(0).parse(vatPct)

    const clientCashIn =
      simulatedRevenue *
      (1 - clampPercent(clientRetention, 0, 100) / 100) *
      (1 + Math.max(0, vat) / 100)
    const subcontractorCashOut =
      expectedSubcontractorPayout *
      (1 - clampPercent(subcontractorRetention, 0, 100) / 100) *
      (1 + Math.max(0, vat) / 100)

    return roundOne(clientCashIn - subcontractorCashOut)
  }, [
    projection.projectedBillTotal,
    expectedSubcontractorPayout,
    clientRetentionPct,
    subcontractorRetentionPct,
    vatPct,
  ])

  const updateSimulationPercent = React.useCallback(
    (lineId: string, pct: number) => {
      if (!isEnabled) return
      setSimulationByLineId((prev) => {
        const nextPct = z.coerce.number().catch(0).parse(pct)
        if (prev[lineId] === nextPct) return prev
        return { ...prev, [lineId]: nextPct }
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
  subcontractorUnitPrice: number
  subcontractorQuantity: number
  payoutAmount: number
}

type UseBillingSimulationInput = {
  isEnabled: boolean
  calculateProjection: (
    overrides: Record<string, number>,
    signal: AbortSignal
  ) => BillingSimulationProjection | Promise<BillingSimulationProjection>
  projectId: string | undefined
  lines: BillingSimulationLineInput[]
  clientRetentionPct: number
  subcontractorRetentionPct: number
  vatPct: number
}

type UseBillingSimulationResult = {
  simulationByLineId: Record<string, number>
  updateSimulationPercent: (lineId: string, pct: number) => void
  clearSimulation: () => void
  hasSimulationChanges: boolean
  projection: BillingSimulationProjection
  linkedSubcontractorByClientLineId: Record<string, LinkedSubcontractorEntry[]>
  payoutBreakdownByClientLineId: Record<string, LinkedSubcontractorEntry[]>
  expectedSubcontractorPayout: number
  netProjectMarginThisBill: number
  netMarginProfit: number
  freeCashLiquidity: number
  marginRiskByLineId: Record<string, boolean>
  loadingLinkedSubcontractors: boolean
}

const linkedSubcontractorSchema = z.object({
  contractId: z.string().uuid(),
  contractNumber: z.string(),
  supplierId: z.string().uuid(),
  lineId: z.string().uuid(),
  description: z.string(),
  subcontractorUnitPrice: z.coerce.number(),
  subcontractorQuantity: z.coerce.number(),
  subcontractorTotalPrice: z.coerce.number(),
})

const linkedClientLineSchema = z.object({
  clientLineId: z.string().uuid(),
  boqRef: z.string(),
  clientUnitPrice: z.coerce.number(),
  links: z.array(linkedSubcontractorSchema),
})

const ZERO_PROJECTION: BillingSimulationProjection = {
  projectedBillTotal: 0,
  netCashInflow: 0,
  marginImpact: 0,
}

function roundOne(value: number): number {
  return Number(z.coerce.number().catch(0).parse(value).toFixed(1))
}

function clampPercent(value: number, min = 0, max = 100): number {
  return Math.min(max, Math.max(min, value))
}

export function useBillingSimulation(
  options: UseBillingSimulationInput
): UseBillingSimulationResult {
  const {
    isEnabled,
    calculateProjection,
    projectId,
    lines,
    clientRetentionPct,
    subcontractorRetentionPct,
    vatPct,
  } = options

  const [simulationByLineId, setSimulationByLineId] = React.useState<
    Record<string, number>
  >({})
  const [projection, setProjection] =
    React.useState<BillingSimulationProjection>(ZERO_PROJECTION)
  const [loadingLinkedSubcontractors, setLoadingLinkedSubcontractors] =
    React.useState(false)
  const [linkedSubcontractorByClientLineId, setLinkedSubcontractorByClientLineId] =
    React.useState<Record<string, LinkedSubcontractorEntry[]>>({})

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
        setProjection(next ?? ZERO_PROJECTION)
      } catch {
        if (controller.signal.aborted) return
        setProjection(ZERO_PROJECTION)
      }
    })()

    return () => controller.abort()
  }, [isEnabled, simulationByLineId, calculateProjection])

  React.useEffect(() => {
    setLinkedSubcontractorByClientLineId({})
    if (!projectId || lines.length === 0) {
      setLoadingLinkedSubcontractors(false)
      return
    }

    const controller = new AbortController()
    setLoadingLinkedSubcontractors(true)

    void (async () => {
      try {
        const rows = await apiGet(
          `/api/erp/projects/${projectId}/linked-subcontractor-lines`,
          { schema: linkedClientLineSchema.array(), signal: controller.signal }
        )
        if (controller.signal.aborted) return

        const lineIdSet = new Set(lines.map((line) => line.id))
        const nextMap: Record<string, LinkedSubcontractorEntry[]> = {}
        for (const row of rows) {
          if (!lineIdSet.has(row.clientLineId)) continue
          nextMap[row.clientLineId] = row.links.map((entry) => ({
            contractId: entry.contractId,
            lineId: entry.lineId,
            supplierId: entry.supplierId,
            contractNumber: entry.contractNumber,
            description: entry.description,
            subcontractorUnitPrice: z.coerce
              .number()
              .catch(0)
              .parse(entry.subcontractorUnitPrice),
            subcontractorQuantity: z.coerce
              .number()
              .catch(0)
              .parse(entry.subcontractorQuantity),
            payoutAmount: 0,
          }))
        }
        setLinkedSubcontractorByClientLineId(nextMap)
      } catch {
        if (controller.signal.aborted) return
        setLinkedSubcontractorByClientLineId({})
      } finally {
        if (!controller.signal.aborted) setLoadingLinkedSubcontractors(false)
      }
    })()

    return () => controller.abort()
  }, [projectId, lines])

  const lineById = React.useMemo(() => {
    const map = new Map<string, BillingSimulationLineInput>()
    for (const line of lines) map.set(line.id, line)
    return map
  }, [lines])

  const payoutBreakdownByClientLineId = React.useMemo(() => {
    const next: Record<string, LinkedSubcontractorEntry[]> = {}
    if (!isEnabled) return next

    for (const [lineId, linkedEntries] of Object.entries(
      linkedSubcontractorByClientLineId
    )) {
      const line = lineById.get(lineId)
      if (!line) continue
      const baselinePct = z.coerce.number().catch(0).parse(line.lastApprovedPct ?? 0)
      const simulatedTotalPct = z.coerce
        .number()
        .catch(baselinePct)
        .parse(simulationByLineId[lineId] ?? baselinePct)
      const normalizedTotalPct = clampPercent(simulatedTotalPct, baselinePct, 100)
      const simulatedCurrentPct = clampPercent(normalizedTotalPct - baselinePct, 0, 100)

      next[lineId] = linkedEntries.map((entry) => {
        const lineCost =
          z.coerce.number().catch(0).parse(entry.subcontractorUnitPrice) *
          z.coerce.number().catch(0).parse(entry.subcontractorQuantity)
        return {
          ...entry,
          payoutAmount: roundOne((lineCost * simulatedCurrentPct) / 100),
        }
      })
    }

    return next
  }, [isEnabled, linkedSubcontractorByClientLineId, lineById, simulationByLineId])

  const marginRiskByLineId = React.useMemo(() => {
    const next: Record<string, boolean> = {}
    for (const line of lines) {
      const clientUnitPrice = z.coerce.number().catch(0).parse(line.unitPrice ?? 0)
      const linked = linkedSubcontractorByClientLineId[line.id] ?? []
      next[line.id] = linked.some(
        (entry) =>
          z.coerce.number().catch(0).parse(entry.subcontractorUnitPrice) > clientUnitPrice
      )
    }
    return next
  }, [linkedSubcontractorByClientLineId, lines])

  const expectedSubcontractorPayout = React.useMemo(() => {
    let total = 0
    for (const entries of Object.values(payoutBreakdownByClientLineId)) {
      for (const entry of entries) {
        total += z.coerce.number().catch(0).parse(entry.payoutAmount)
      }
    }
    return roundOne(total)
  }, [payoutBreakdownByClientLineId])

  const netMarginProfit = React.useMemo(() => {
    const simulatedRevenue = z.coerce.number().catch(0).parse(projection.projectedBillTotal)
    return roundOne(simulatedRevenue - expectedSubcontractorPayout)
  }, [projection.projectedBillTotal, expectedSubcontractorPayout])

  const netProjectMarginThisBill = React.useMemo(() => {
    const simulatedCashInflow = z.coerce.number().catch(0).parse(projection.netCashInflow)
    return roundOne(simulatedCashInflow - expectedSubcontractorPayout)
  }, [projection.netCashInflow, expectedSubcontractorPayout])

  const freeCashLiquidity = React.useMemo(() => {
    const simulatedRevenue = z.coerce.number().catch(0).parse(projection.projectedBillTotal)
    const clientRetention = z.coerce.number().catch(0).parse(clientRetentionPct)
    const subcontractorRetention = z.coerce
      .number()
      .catch(0)
      .parse(subcontractorRetentionPct)
    const vat = z.coerce.number().catch(0).parse(vatPct)

    const clientCashIn =
      simulatedRevenue *
      (1 - clampPercent(clientRetention, 0, 100) / 100) *
      (1 + Math.max(0, vat) / 100)
    const subcontractorCashOut =
      expectedSubcontractorPayout *
      (1 - clampPercent(subcontractorRetention, 0, 100) / 100) *
      (1 + Math.max(0, vat) / 100)

    return roundOne(clientCashIn - subcontractorCashOut)
  }, [
    projection.projectedBillTotal,
    expectedSubcontractorPayout,
    clientRetentionPct,
    subcontractorRetentionPct,
    vatPct,
  ])

  const updateSimulationPercent = React.useCallback(
    (lineId: string, pct: number) => {
      if (!isEnabled) return
      setSimulationByLineId((prev) => {
        const nextPct = z.coerce.number().catch(0).parse(pct)
        if (prev[lineId] === nextPct) return prev
        return { ...prev, [lineId]: nextPct }
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

  return {
    simulationByLineId,
    updateSimulationPercent,
    clearSimulation,
    hasSimulationChanges,
    projection,
    linkedSubcontractorByClientLineId,
    payoutBreakdownByClientLineId,
    expectedSubcontractorPayout,
    netProjectMarginThisBill,
    netMarginProfit,
    freeCashLiquidity,
    marginRiskByLineId,
    loadingLinkedSubcontractors,
  }
}
"use client"
export function useBillingSimulation() {
  return null
}
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
  subcontractorUnitPrice: number
  subcontractorQuantity: number
  payoutAmount: number
}

type UseBillingSimulationInput = {
  isEnabled: boolean
  calculateProjection: (
    overrides: Record<string, number>,
    signal: AbortSignal
  ) => BillingSimulationProjection | Promise<BillingSimulationProjection>
  projectId: string | undefined
  lines: BillingSimulationLineInput[]
  clientRetentionPct: number
  subcontractorRetentionPct: number
  vatPct: number
}

type UseBillingSimulationResult = {
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

const linkedSubcontractorSchema = z.object({
  contractId: z.string().uuid(),
  contractNumber: z.string(),
  supplierId: z.string().uuid(),
  lineId: z.string().uuid(),
  description: z.string(),
  subcontractorUnitPrice: z.coerce.number(),
  subcontractorQuantity: z.coerce.number(),
  subcontractorTotalPrice: z.coerce.number(),
})

const linkedClientLineSchema = z.object({
  clientLineId: z.string().uuid(),
  boqRef: z.string(),
  clientUnitPrice: z.coerce.number(),
  links: z.array(linkedSubcontractorSchema),
})

const ZERO_PROJECTION: BillingSimulationProjection = {
  projectedBillTotal: 0,
  netCashInflow: 0,
  marginImpact: 0,
}

function roundOne(value: number): number {
  return Number(z.coerce.number().catch(0).parse(value).toFixed(1))
}

function clampPercent(value: number, min = 0, max = 100): number {
  return Math.min(max, Math.max(min, value))
}

export function useBillingSimulation(
  options: UseBillingSimulationInput
): UseBillingSimulationResult {
  const {
    isEnabled,
    calculateProjection,
    projectId,
    lines,
    clientRetentionPct,
    subcontractorRetentionPct,
    vatPct,
  } = options

  const [simulationByLineId, setSimulationByLineId] = React.useState<
    Record<string, number>
  >({})
  const [projection, setProjection] =
    React.useState<BillingSimulationProjection>(ZERO_PROJECTION)
  const [loadingLinkedSubcontractors, setLoadingLinkedSubcontractors] =
    React.useState(false)
  const [linkedSubcontractorByClientLineId, setLinkedSubcontractorByClientLineId] =
    React.useState<Record<string, LinkedSubcontractorEntry[]>>({})

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
        setProjection(next ?? ZERO_PROJECTION)
      } catch {
        if (controller.signal.aborted) return
        setProjection(ZERO_PROJECTION)
      }
    })()

    return () => controller.abort()
  }, [isEnabled, simulationByLineId, calculateProjection])

  React.useEffect(() => {
    setLinkedSubcontractorByClientLineId({})
    if (!projectId || lines.length === 0) {
      setLoadingLinkedSubcontractors(false)
      return
    }

    const controller = new AbortController()
    setLoadingLinkedSubcontractors(true)

    void (async () => {
      try {
        const rows = await apiGet(
          `/api/erp/projects/${projectId}/linked-subcontractor-lines`,
          { schema: linkedClientLineSchema.array(), signal: controller.signal }
        )
        if (controller.signal.aborted) return

        const lineIdSet = new Set(lines.map((line) => line.id))
        const nextMap: Record<string, LinkedSubcontractorEntry[]> = {}
        for (const row of rows) {
          if (!lineIdSet.has(row.clientLineId)) continue
          nextMap[row.clientLineId] = row.links.map((entry) => ({
            contractId: entry.contractId,
            lineId: entry.lineId,
            supplierId: entry.supplierId,
            contractNumber: entry.contractNumber,
            description: entry.description,
            subcontractorUnitPrice: z.coerce.number().catch(0).parse(entry.subcontractorUnitPrice),
            subcontractorQuantity: z.coerce.number().catch(0).parse(entry.subcontractorQuantity),
            payoutAmount: 0,
          }))
        }
        setLinkedSubcontractorByClientLineId(nextMap)
      } catch {
        if (controller.signal.aborted) return
        setLinkedSubcontractorByClientLineId({})
      } finally {
        if (!controller.signal.aborted) setLoadingLinkedSubcontractors(false)
      }
    })()

    return () => controller.abort()
  }, [projectId, lines])

  const lineById = React.useMemo(() => {
    const map = new Map<string, BillingSimulationLineInput>()
    for (const line of lines) map.set(line.id, line)
    return map
  }, [lines])

  const payoutBreakdownByClientLineId = React.useMemo(() => {
    const next: Record<string, LinkedSubcontractorEntry[]> = {}
    if (!isEnabled) return next

    for (const [lineId, linkedEntries] of Object.entries(
      linkedSubcontractorByClientLineId
    )) {
      const line = lineById.get(lineId)
      if (!line) continue
      const baselinePct = z.coerce.number().catch(0).parse(line.lastApprovedPct ?? 0)
      const simulatedTotalPct = z.coerce
        .number()
        .catch(baselinePct)
        .parse(simulationByLineId[lineId] ?? baselinePct)
      const normalizedTotalPct = clampPercent(simulatedTotalPct, baselinePct, 100)
      const simulatedCurrentPct = clampPercent(normalizedTotalPct - baselinePct, 0, 100)

      next[lineId] = linkedEntries.map((entry) => {
        const lineCost =
          z.coerce.number().catch(0).parse(entry.subcontractorUnitPrice) *
          z.coerce.number().catch(0).parse(entry.subcontractorQuantity)
        return {
          ...entry,
          payoutAmount: roundOne((lineCost * simulatedCurrentPct) / 100),
        }
      })
    }

    return next
  }, [isEnabled, linkedSubcontractorByClientLineId, lineById, simulationByLineId])

  const marginRiskByLineId = React.useMemo(() => {
    const next: Record<string, boolean> = {}
    for (const line of lines) {
      const clientUnitPrice = z.coerce.number().catch(0).parse(line.unitPrice ?? 0)
      const linked = linkedSubcontractorByClientLineId[line.id] ?? []
      next[line.id] = linked.some(
        (entry) =>
          z.coerce.number().catch(0).parse(entry.subcontractorUnitPrice) > clientUnitPrice
      )
    }
    return next
  }, [linkedSubcontractorByClientLineId, lines])

  const expectedSubcontractorPayout = React.useMemo(() => {
    let total = 0
    for (const entries of Object.values(payoutBreakdownByClientLineId)) {
      for (const entry of entries) {
        total += z.coerce.number().catch(0).parse(entry.payoutAmount)
      }
    }
    return roundOne(total)
  }, [payoutBreakdownByClientLineId])

  const netMarginProfit = React.useMemo(() => {
    const simulatedRevenue = z.coerce.number().catch(0).parse(projection.projectedBillTotal)
    return roundOne(simulatedRevenue - expectedSubcontractorPayout)
  }, [projection.projectedBillTotal, expectedSubcontractorPayout])

  const freeCashLiquidity = React.useMemo(() => {
    const simulatedRevenue = z.coerce.number().catch(0).parse(projection.projectedBillTotal)
    const clientRetention = z.coerce.number().catch(0).parse(clientRetentionPct)
    const subcontractorRetention = z.coerce
      .number()
      .catch(0)
      .parse(subcontractorRetentionPct)
    const vat = z.coerce.number().catch(0).parse(vatPct)

    const clientCashIn =
      simulatedRevenue *
      (1 - clampPercent(clientRetention, 0, 100) / 100) *
      (1 + Math.max(0, vat) / 100)
    const subcontractorCashOut =
      expectedSubcontractorPayout *
      (1 - clampPercent(subcontractorRetention, 0, 100) / 100) *
      (1 + Math.max(0, vat) / 100)

    return roundOne(clientCashIn - subcontractorCashOut)
  }, [
    projection.projectedBillTotal,
    expectedSubcontractorPayout,
    clientRetentionPct,
    subcontractorRetentionPct,
    vatPct,
  ])

  const updateSimulationPercent = React.useCallback(
    (lineId: string, pct: number) => {
      if (!isEnabled) return
      setSimulationByLineId((prev) => {
        const nextPct = z.coerce.number().catch(0).parse(pct)
        if (prev[lineId] === nextPct) return prev
        return { ...prev, [lineId]: nextPct }
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
  subcontractorUnitPrice: number
  subcontractorQuantity: number
  payoutAmount: number
}

type UseBillingSimulationInput = {
  isEnabled: boolean
  calculateProjection: (
    overrides: Record<string, number>,
    signal: AbortSignal
  ) => BillingSimulationProjection | Promise<BillingSimulationProjection>
  projectId: string | undefined
  lines: BillingSimulationLineInput[]
  clientRetentionPct: number
  subcontractorRetentionPct: number
  vatPct: number
}

type UseBillingSimulationResult = {
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

const linkedSubcontractorSchema = z.object({
  contractId: z.string().uuid(),
  contractNumber: z.string(),
  supplierId: z.string().uuid(),
  lineId: z.string().uuid(),
  description: z.string(),
  subcontractorUnitPrice: z.coerce.number(),
  subcontractorQuantity: z.coerce.number(),
  subcontractorTotalPrice: z.coerce.number(),
})

const linkedClientLineSchema = z.object({
  clientLineId: z.string().uuid(),
  boqRef: z.string(),
  clientUnitPrice: z.coerce.number(),
  links: z.array(linkedSubcontractorSchema),
})

const ZERO_PROJECTION: BillingSimulationProjection = {
  projectedBillTotal: 0,
  netCashInflow: 0,
  marginImpact: 0,
}

function roundOne(value: number): number {
  return Number(z.coerce.number().catch(0).parse(value).toFixed(1))
}

function clampPercent(value: number, min = 0, max = 100): number {
  return Math.min(max, Math.max(min, value))
}

export function useBillingSimulation(
  options: UseBillingSimulationInput
): UseBillingSimulationResult {
  const {
    isEnabled,
    calculateProjection,
    projectId,
    lines,
    clientRetentionPct,
    subcontractorRetentionPct,
    vatPct,
  } = options

  const [simulationByLineId, setSimulationByLineId] = React.useState<
    Record<string, number>
  >({})
  const [projection, setProjection] =
    React.useState<BillingSimulationProjection>(ZERO_PROJECTION)
  const [loadingLinkedSubcontractors, setLoadingLinkedSubcontractors] =
    React.useState(false)
  const [linkedSubcontractorByClientLineId, setLinkedSubcontractorByClientLineId] =
    React.useState<Record<string, LinkedSubcontractorEntry[]>>({})

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
        setProjection(next ?? ZERO_PROJECTION)
      } catch {
        if (controller.signal.aborted) return
        setProjection(ZERO_PROJECTION)
      }
    })()

    return () => controller.abort()
  }, [isEnabled, simulationByLineId, calculateProjection])

  React.useEffect(() => {
    setLinkedSubcontractorByClientLineId({})
    if (!projectId || lines.length === 0) {
      setLoadingLinkedSubcontractors(false)
      return
    }

    const controller = new AbortController()
    setLoadingLinkedSubcontractors(true)

    void (async () => {
      try {
        const rows = await apiGet(
          `/api/erp/projects/${projectId}/linked-subcontractor-lines`,
          { schema: linkedClientLineSchema.array(), signal: controller.signal }
        )
        if (controller.signal.aborted) return

        const lineIdSet = new Set(lines.map((line) => line.id))
        const nextMap: Record<string, LinkedSubcontractorEntry[]> = {}
        for (const row of rows) {
          if (!lineIdSet.has(row.clientLineId)) continue
          nextMap[row.clientLineId] = row.links.map((entry) => ({
            contractId: entry.contractId,
            lineId: entry.lineId,
            supplierId: entry.supplierId,
            contractNumber: entry.contractNumber,
            description: entry.description,
            subcontractorUnitPrice: z.coerce.number().catch(0).parse(entry.subcontractorUnitPrice),
            subcontractorQuantity: z.coerce.number().catch(0).parse(entry.subcontractorQuantity),
            payoutAmount: 0,
          }))
        }
        setLinkedSubcontractorByClientLineId(nextMap)
      } catch {
        if (controller.signal.aborted) return
        setLinkedSubcontractorByClientLineId({})
      } finally {
        if (!controller.signal.aborted) setLoadingLinkedSubcontractors(false)
      }
    })()

    return () => controller.abort()
  }, [projectId, lines])

  const lineById = React.useMemo(() => {
    const map = new Map<string, BillingSimulationLineInput>()
    for (const line of lines) map.set(line.id, line)
    return map
  }, [lines])

  const payoutBreakdownByClientLineId = React.useMemo(() => {
    const next: Record<string, LinkedSubcontractorEntry[]> = {}
    if (!isEnabled) return next

    for (const [lineId, linkedEntries] of Object.entries(
      linkedSubcontractorByClientLineId
    )) {
      const line = lineById.get(lineId)
      if (!line) continue
      const baselinePct = z.coerce.number().catch(0).parse(line.lastApprovedPct ?? 0)
      const simulatedTotalPct = z.coerce
        .number()
        .catch(baselinePct)
        .parse(simulationByLineId[lineId] ?? baselinePct)
      const normalizedTotalPct = clampPercent(simulatedTotalPct, baselinePct, 100)
      const simulatedCurrentPct = clampPercent(normalizedTotalPct - baselinePct, 0, 100)

      next[lineId] = linkedEntries.map((entry) => {
        const lineCost =
          z.coerce.number().catch(0).parse(entry.subcontractorUnitPrice) *
          z.coerce.number().catch(0).parse(entry.subcontractorQuantity)
        return {
          ...entry,
          payoutAmount: roundOne((lineCost * simulatedCurrentPct) / 100),
        }
      })
    }

    return next
  }, [isEnabled, linkedSubcontractorByClientLineId, lineById, simulationByLineId])

  const marginRiskByLineId = React.useMemo(() => {
    const next: Record<string, boolean> = {}
    for (const line of lines) {
      const clientUnitPrice = z.coerce.number().catch(0).parse(line.unitPrice ?? 0)
      const linked = linkedSubcontractorByClientLineId[line.id] ?? []
      next[line.id] = linked.some(
        (entry) =>
          z.coerce.number().catch(0).parse(entry.subcontractorUnitPrice) > clientUnitPrice
      )
    }
    return next
  }, [linkedSubcontractorByClientLineId, lines])

  const expectedSubcontractorPayout = React.useMemo(() => {
    let total = 0
    for (const entries of Object.values(payoutBreakdownByClientLineId)) {
      for (const entry of entries) {
        total += z.coerce.number().catch(0).parse(entry.payoutAmount)
      }
    }
    return roundOne(total)
  }, [payoutBreakdownByClientLineId])

  const netMarginProfit = React.useMemo(() => {
    const simulatedRevenue = z.coerce.number().catch(0).parse(projection.projectedBillTotal)
    return roundOne(simulatedRevenue - expectedSubcontractorPayout)
  }, [projection.projectedBillTotal, expectedSubcontractorPayout])

  const freeCashLiquidity = React.useMemo(() => {
    const simulatedRevenue = z.coerce.number().catch(0).parse(projection.projectedBillTotal)
    const clientRetention = z.coerce.number().catch(0).parse(clientRetentionPct)
    const subcontractorRetention = z.coerce
      .number()
      .catch(0)
      .parse(subcontractorRetentionPct)
    const vat = z.coerce.number().catch(0).parse(vatPct)

    const clientCashIn =
      simulatedRevenue *
      (1 - clampPercent(clientRetention, 0, 100) / 100) *
      (1 + Math.max(0, vat) / 100)
    const subcontractorCashOut =
      expectedSubcontractorPayout *
      (1 - clampPercent(subcontractorRetention, 0, 100) / 100) *
      (1 + Math.max(0, vat) / 100)

    return roundOne(clientCashIn - subcontractorCashOut)
  }, [
    projection.projectedBillTotal,
    expectedSubcontractorPayout,
    clientRetentionPct,
    subcontractorRetentionPct,
    vatPct,
  ])

  const updateSimulationPercent = React.useCallback(
    (lineId: string, pct: number) => {
      if (!isEnabled) return
      setSimulationByLineId((prev) => {
        const nextPct = z.coerce.number().catch(0).parse(pct)
        if (prev[lineId] === nextPct) return prev
        return { ...prev, [lineId]: nextPct }
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

type SimulationProjection = {
  projectedBillTotal: number
  netCashInflow: number
  marginImpact: number
}

type SimulationLineContext = {
  id: string
  boqRef: string | null
  itemId: string | null
  lastApprovedPct: number
  unitPrice?: number
}

type LinkedSubcontractorLine = {
  contractId: string
  contractNumber: string
  supplierId: string
  lineId: string
  description: string
  boqLineId: string | null
  itemId: string | null
  quantity: number
  unitPrice: number
}

type PayoutBreakdownEntry = LinkedSubcontractorLine & {
  payoutAmount: number
}

type UseBillingSimulationOptions = {
  isEnabled?: boolean
  calculateProjection: (
    overrides: Record<string, number>,
    signal: AbortSignal
  ) => Promise<SimulationProjection> | SimulationProjection
  projectId?: string
  lines?: SimulationLineContext[]
  clientRetentionPct?: number
  subcontractorRetentionPct?: number
  vatPct?: number
}

const simulationProjectionSchema = z.object({
  projectedBillTotal: z.coerce.number(),
  netCashInflow: z.coerce.number(),
  marginImpact: z.coerce.number(),
})

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

function parseNumber(value: unknown): number {
  return z.coerce.number().catch(0).parse(value)
}

function roundOneDecimal(value: number): number {
  return Number(parseNumber(value).toFixed(1))
}

export function useBillingSimulation(options: UseBillingSimulationOptions) {
  const {
    calculateProjection,
    isEnabled = true,
    projectId,
    lines = [],
    clientRetentionPct = 0,
    subcontractorRetentionPct = 0,
    vatPct = 17,
  } = options
  const [simulationByLineId, setSimulationByLineId] = React.useState<Record<string, number>>({})
  const [projection, setProjection] = React.useState<SimulationProjection>({
    projectedBillTotal: 0,
    netCashInflow: 0,
    marginImpact: 0,
  })
  const [linkedSubcontractorByClientLineId, setLinkedSubcontractorByClientLineId] = React.useState<
    Record<string, LinkedSubcontractorLine[]>
  >({})
  const [loadingLinkedSubcontractors, setLoadingLinkedSubcontractors] = React.useState(false)

  const updateSimulationPercent = React.useCallback((lineId: string, totalPercent: number) => {
    setSimulationByLineId((current) => ({
      ...current,
      [lineId]: parseNumber(totalPercent),
    }))
  }, [])

  const clearSimulation = React.useCallback(() => {
    setSimulationByLineId({})
  }, [])

  const hasSimulationChanges = React.useMemo(
    () => Object.keys(simulationByLineId).length > 0,
    [simulationByLineId]
  )

  React.useEffect(() => {
    if (!projectId || lines.length === 0) {
      setLinkedSubcontractorByClientLineId({})
      setLoadingLinkedSubcontractors(false)
      return
    }

    const controller = new AbortController()
    setLoadingLinkedSubcontractors(true)

    void (async () => {
      try {
        const contracts = await apiGet<
          Array<{
            id: string
            contractNumber: string
            supplierId: string
          }>
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
              quantity: parseNumber(line.quantity),
              unitPrice: parseNumber(line.unitPrice),
            }))
          })
        )
        if (controller.signal.aborted) return

        const nextMap: Record<string, LinkedSubcontractorLine[]> = {}
        const linkedLines = linkedBuckets.flat()
        for (const clientLine of lines) {
          const linked = linkedLines.filter((subLine) => {
            const byBoqRef =
              Boolean(clientLine.boqRef) &&
              Boolean(subLine.boqLineId) &&
              subLine.boqLineId === clientLine.boqRef
            const byItemId =
              Boolean(clientLine.itemId) &&
              Boolean(subLine.itemId) &&
              subLine.itemId === clientLine.itemId
            return byBoqRef || byItemId
          })
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
  }, [lines, projectId])

  React.useEffect(() => {
    const controller = new AbortController()
    if (!isEnabled) {
      setProjection({
        projectedBillTotal: 0,
        netCashInflow: 0,
        marginImpact: 0,
      })
      return () => controller.abort()
    }

    const project = async () => {
      const next = await calculateProjection(simulationByLineId, controller.signal)
      if (controller.signal.aborted) return
      const parsed = simulationProjectionSchema.safeParse(next)
      if (!parsed.success) return
      setProjection(parsed.data)
    }

    void project()
    return () => controller.abort()
  }, [calculateProjection, isEnabled, simulationByLineId])

  const payoutBreakdownByClientLineId = React.useMemo(() => {
    const breakdownByLineId: Record<string, PayoutBreakdownEntry[]> = {}
    for (const line of lines) {
      const linkedLines = linkedSubcontractorByClientLineId[line.id] ?? []
      if (linkedLines.length === 0) continue

      const baselinePct = parseNumber(line.lastApprovedPct ?? 0)
      const simulatedTotalPct = parseNumber(simulationByLineId[line.id] ?? baselinePct)
      const simulatedCurrentPct = Math.max(0, Math.min(100, simulatedTotalPct - baselinePct))

      breakdownByLineId[line.id] = linkedLines.map((linkedLine) => ({
        ...linkedLine,
        payoutAmount: roundOneDecimal(
          parseNumber(linkedLine.quantity) *
            parseNumber(linkedLine.unitPrice) *
            (simulatedCurrentPct / 100)
        ),
      }))
    }
    return breakdownByLineId
  }, [lines, linkedSubcontractorByClientLineId, simulationByLineId])

  const expectedSubcontractorPayout = React.useMemo(() => {
    const total = Object.values(payoutBreakdownByClientLineId).reduce((sum, entries) => {
      return sum + entries.reduce((entrySum, entry) => entrySum + parseNumber(entry.payoutAmount), 0)
    }, 0)
    return roundOneDecimal(total)
  }, [payoutBreakdownByClientLineId])

  const netProjectMarginThisBill = React.useMemo(() => {
    return roundOneDecimal(parseNumber(projection.netCashInflow) - expectedSubcontractorPayout)
  }, [expectedSubcontractorPayout, projection.netCashInflow])

  const netMarginProfit = React.useMemo(() => {
    return roundOneDecimal(parseNumber(projection.projectedBillTotal) - expectedSubcontractorPayout)
  }, [expectedSubcontractorPayout, projection.projectedBillTotal])

  const freeCashLiquidity = React.useMemo(() => {
    const simulatedRevenue = parseNumber(projection.projectedBillTotal)
    const clientRetention = parseNumber(clientRetentionPct)
    const subcontractorRetention = parseNumber(subcontractorRetentionPct)
    const vat = parseNumber(vatPct)

    const clientCashIn =
      simulatedRevenue * (1 - Math.max(0, Math.min(100, clientRetention)) / 100) * (1 + Math.max(0, vat) / 100)
    const subcontractorCashOut =
      expectedSubcontractorPayout *
      (1 - Math.max(0, Math.min(100, subcontractorRetention)) / 100) *
      (1 + Math.max(0, vat) / 100)

    return roundOneDecimal(clientCashIn - subcontractorCashOut)
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
      const highestSubUnitPrice = linkedLines.reduce(
        (max, linkedLine) => Math.max(max, parseNumber(linkedLine.unitPrice)),
        0
      )
      const clientUnitPrice = parseNumber(line.unitPrice ?? 0)
      riskMap[line.id] = highestSubUnitPrice > clientUnitPrice
    }
    return riskMap
  }, [lines, linkedSubcontractorByClientLineId])

  return {
    simulationByLineId,
    updateSimulationPercent,
    clearSimulation,
    hasSimulationChanges,
    projection,
    linkedSubcontractorByClientLineId,
    payoutBreakdownByClientLineId,
    expectedSubcontractorPayout,
    netProjectMarginThisBill,
    netMarginProfit,
    freeCashLiquidity,
    marginRiskByLineId,
    loadingLinkedSubcontractors,
  }
}
*/
