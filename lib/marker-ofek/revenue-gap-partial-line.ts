import type { RevenueGapLineInput } from "@/lib/marker-ofek/revenue-gap"

/** Minimal partial line shape for Gap Hunter mapping (decoupled from page-specific types). */
export type PartialLineForGapInput = {
  id: string
  label: string
  quantity_previous: number
  quantity_current: number
  gantt_suggested_percent: number | null
  line_base_amount: number
}

export function toRevenueGapLineInput(
  li: PartialLineForGapInput,
  lineEdits: Record<string, { quantity_previous: number; quantity_current: number }>
): RevenueGapLineInput {
  const edit = lineEdits[li.id] ?? {
    quantity_previous: li.quantity_previous,
    quantity_current: li.quantity_current,
  }
  const qCur = Math.min(100, Math.max(0, Number(edit.quantity_current) || 0))
  return {
    id: li.id,
    label: li.label,
    quantity_current: qCur,
    gantt_suggested_percent: li.gantt_suggested_percent,
    line_base_amount: li.line_base_amount,
  }
}

export function buildLineEditsFromPartialAccounts<
  T extends { lines: PartialLineForGapInput[] },
>(partialAccounts: T[]): Record<string, { quantity_previous: number; quantity_current: number }> {
  const m: Record<string, { quantity_previous: number; quantity_current: number }> = {}
  for (const pa of partialAccounts) {
    for (const li of pa.lines) {
      m[li.id] = {
        quantity_previous: li.quantity_previous,
        quantity_current: li.quantity_current,
      }
    }
  }
  return m
}
