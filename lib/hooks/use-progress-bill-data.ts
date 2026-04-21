"use client"

import * as React from "react"
import { z } from "zod"

import { apiFetch, parseApiData } from "@/lib/utils/api-client"
import type { ErpClientProgressBill, ErpClientProgressBillLine } from "@/types/erp"

const progressBillSchema = z
  .object({
    id: z.string().uuid(),
    companyId: z.string(),
    clientContractId: z.string().uuid(),
    billNumber: z.string(),
    periodStart: z.string().nullable(),
    periodEnd: z.string().nullable(),
    status: z.enum(["DRAFT", "SUBMITTED", "PARTIALLY_APPROVED", "APPROVED"]),
    submittedTotalAmount: z.coerce.number(),
    approvedTotalAmount: z.coerce.number(),
    indexedSubmittedAmount: z.coerce.number(),
    indexedApprovedAmount: z.coerce.number(),
    retentionDeductedAmount: z.coerce.number(),
    advanceRepaymentAmount: z.coerce.number(),
    netApprovedPayable: z.coerce.number(),
  })

const progressBillLineSchema = z
  .object({
    id: z.string().uuid(),
    companyId: z.string(),
    progressBillId: z.string().uuid(),
    contractLineId: z.string().uuid(),
    submittedQuantity: z.coerce.number(),
    submittedAmount: z.coerce.number(),
    submittedPercent: z.coerce.number(),
    approvedQuantity: z.coerce.number().nullable(),
    approvedAmount: z.coerce.number().nullable(),
    approvedPercent: z.coerce.number().nullable(),
    approvedManualOverride: z.boolean(),
  })

const progressBillLinesSchema = z.array(progressBillLineSchema)

export type ProgressBillSnapshot = {
  bill: ErpClientProgressBill
  lines: ErpClientProgressBillLine[]
}

export function useProgressBillData(input: {
  contractId: string
  billId: string
}) {
  const { contractId, billId } = input
  const [data, setData] = React.useState<ProgressBillSnapshot | null>(null)
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const fetchSnapshot = React.useCallback(
    async (signal?: AbortSignal): Promise<ProgressBillSnapshot> => {
      const [billResponse, linesResponse] = await Promise.all([
        apiFetch(`/api/erp/client-contracts/${contractId}/progress-bills/${billId}`, {
          method: "GET",
          signal,
        }),
        apiFetch(`/api/erp/client-contracts/${contractId}/progress-bills/${billId}/lines`, {
          method: "GET",
          signal,
        }),
      ])

      const [bill, lines] = await Promise.all([
        parseApiData(billResponse, { schema: progressBillSchema, signal }),
        parseApiData(linesResponse, { schema: progressBillLinesSchema, signal }),
      ])

      return {
        bill,
        lines,
      }
    },
    [billId, contractId]
  )

  const reload = React.useCallback(async (): Promise<ProgressBillSnapshot | null> => {
    if (!contractId || !billId) {
      setData(null)
      setLoading(false)
      setError(null)
      return null
    }

    const snapshot = await fetchSnapshot()
    setData(snapshot)
    setError(null)
    return snapshot
  }, [billId, contractId, fetchSnapshot])

  React.useEffect(() => {
    const controller = new AbortController()

    if (!contractId || !billId) {
      setData(null)
      setLoading(false)
      setError(null)
      return
    }

    // Prevent stale data flashes when quickly switching bills.
    setData(null)
    setLoading(true)
    setError(null)

    void (async () => {
      try {
        const snapshot = await fetchSnapshot(controller.signal)
        if (controller.signal.aborted) return
        setData(snapshot)
      } catch (e) {
        if (controller.signal.aborted) return
        setData(null)
        setError(e instanceof Error ? e.message : "טעינת נתוני חשבון נכשלה")
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    })()

    return () => {
      controller.abort()
    }
  }, [billId, contractId, fetchSnapshot])

  return {
    data,
    loading,
    error,
    setData,
    reload,
  }
}
