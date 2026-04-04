"use client"

import * as React from "react"

import {
  computePartialAccountDraftPreview,
  type DraftLineInput,
  type PartialAccountDraftPreview,
} from "@/lib/marker-ofek/partial-account-draft-calc"
import type { DeductionPercents } from "@/lib/marker-ofek/partial-account-calc"

export type DraftLineSeed = {
  lineKey: string
  lineBase: number
  /** End-of-baseline % (becomes Prev % on new account) */
  quantityPrevious: number
  /** Editable current % — default e.g. Gantt or same as previous */
  quantityCurrent: number
  label: string
  contract_line_item_id: string | null
  contract_milestone_id: string | null
}

export function usePartialAccountDraft(input: {
  previousCumulativeApproved: number
  contractTotal: number | null
  indexCoefficient: number
  deductionPercents: DeductionPercents
  seeds: DraftLineSeed[]
}) {
  const [rows, setRows] = React.useState<DraftLineSeed[]>(() => input.seeds)

  const draftLines: DraftLineInput[] = React.useMemo(
    () =>
      rows.map((r) => ({
        lineKey: r.lineKey,
        lineBase: r.lineBase,
        qPrev: r.quantityPrevious,
        qCur: r.quantityCurrent,
      })),
    [rows]
  )

  const preview: PartialAccountDraftPreview = React.useMemo(
    () =>
      computePartialAccountDraftPreview({
        previousCumulativeApproved: input.previousCumulativeApproved,
        contractTotal: input.contractTotal,
        indexCoefficient: input.indexCoefficient,
        deductionPercents: input.deductionPercents,
        lines: draftLines,
      }),
    [
      draftLines,
      input.previousCumulativeApproved,
      input.contractTotal,
      input.indexCoefficient,
      input.deductionPercents,
    ]
  )

  const previewByKey = React.useMemo(() => {
    const m = new Map<string, PartialAccountDraftPreview["perLine"][0]>()
    for (const p of preview.perLine) {
      m.set(p.lineKey, p)
    }
    return m
  }, [preview.perLine])

  function setCurrentPercent(lineKey: string, qCur: number) {
    setRows((prev) =>
      prev.map((r) =>
        r.lineKey === lineKey ? { ...r, quantityCurrent: qCur } : r
      )
    )
  }

  function setPreviousPercent(lineKey: string, qPrev: number) {
    setRows((prev) =>
      prev.map((r) =>
        r.lineKey === lineKey ? { ...r, quantityPrevious: qPrev } : r
      )
    )
  }

  function applyGanttToCurrent(getSuggestion: (lineKey: string) => number | null) {
    setRows((prev) =>
      prev.map((r) => {
        const g = getSuggestion(r.lineKey)
        if (g == null) return r
        return { ...r, quantityCurrent: g }
      })
    )
  }

  return {
    rows,
    preview,
    previewByKey,
    setCurrentPercent,
    setPreviousPercent,
    applyGanttToCurrent,
  }
}
