"use client"

/**
 * Sprint W2 Phase 2 — Dual-Pane Bill Editor (§3.2.2.1 submitted vs approved).
 *
 * Side-by-side table:
 *   • LEFT  (RTL: right) — submitted ledger (what the subcontractor claimed).
 *   • RIGHT (RTL: left)  — approved ledger (what we approve to pay).
 *
 * Empty `approved_amount` defaults to the submitted figure to let approvers
 * accept-as-is with one click.
 *
 * Submission calls `approveBillAction` which:
 *   1. Writes approved_amount/approved_qty/approved_by/approved_at.
 *   2. Recomputes the entire waterfall in the same transaction.
 *
 * AGGREGATE bills (entry_mode='AGGREGATE') get a single-total input row
 * instead of the per-line grid — enforcing the spec rule that aggregate
 * submitted forbids detailed approval.
 */

import * as React from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { cn } from "@/lib/utils"

import { approveBillAction } from "@/lib/marker-ofek/contracts/w2-engine-actions"
import type {
  BillEntryMode,
  BillLineForApproval,
} from "@/lib/marker-ofek/contracts/w2-engine-types"

const ils = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 0,
})
const ilsDetailed = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 2,
})

type Props = {
  billId: string
  entryMode: BillEntryMode
  lines: BillLineForApproval[]
  /** Current cumulative_executed for AGGREGATE mode. */
  aggregateCurrent?: number
}

export function DualPaneBillEditor({
  billId,
  entryMode,
  lines,
  aggregateCurrent,
}: Props) {
  const initialApproved = React.useMemo(() => {
    const map: Record<string, string> = {}
    for (const line of lines) {
      const v =
        line.approvedAmount ?? line.submittedAmount ?? line.cumulativeAmount
      map[line.id] = String(v ?? 0)
    }
    return map
  }, [lines])

  const [approvedAmounts, setApprovedAmounts] = React.useState(initialApproved)
  const [aggregate, setAggregate] = React.useState<string>(
    String(aggregateCurrent ?? 0),
  )
  const [pending, startTransition] = React.useTransition()
  const [feedback, setFeedback] = React.useState<{
    tone: "ok" | "err"
    text: string
  } | null>(null)

  const submittedTotal = React.useMemo(
    () =>
      lines.reduce(
        (sum, l) => sum + (l.submittedAmount ?? l.cumulativeAmount ?? 0),
        0,
      ),
    [lines],
  )
  const approvedTotal = React.useMemo(() => {
    if (entryMode === "AGGREGATE") return Number(aggregate) || 0
    return Object.values(approvedAmounts).reduce(
      (s, v) => s + (Number(v) || 0),
      0,
    )
  }, [entryMode, aggregate, approvedAmounts])

  function setApproved(id: string, val: string) {
    setApprovedAmounts((prev) => ({ ...prev, [id]: val }))
  }

  function copySubmitted() {
    if (entryMode === "AGGREGATE") {
      setAggregate(String(submittedTotal))
      return
    }
    const next: Record<string, string> = {}
    for (const line of lines) {
      const v = line.submittedAmount ?? line.cumulativeAmount
      next[line.id] = String(v ?? 0)
    }
    setApprovedAmounts(next)
  }

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFeedback(null)
    const payload =
      entryMode === "AGGREGATE"
        ? [
            {
              bill_line_id: "00000000-0000-0000-0000-000000000000",
              approved_amount: Number(aggregate) || 0,
            },
          ]
        : lines.map((line) => ({
            bill_line_id: line.id,
            approved_qty: line.submittedQty,
            approved_amount: Number(approvedAmounts[line.id]) || 0,
          }))

    startTransition(async () => {
      const res = await approveBillAction({ billId, lines: payload })
      if (res.ok) {
        setFeedback({
          tone: "ok",
          text: `אושר. ${res.rowsUpdated} שורות עודכנו. ה-Waterfall חושב מחדש.`,
        })
      } else {
        setFeedback({ tone: "err", text: res.error })
      }
    })
  }

  if (entryMode === "AGGREGATE") {
    return (
      <Card
        className="space-y-4 border-slate-200 bg-card p-5 shadow-sm"
        dir="rtl"
      >
        <header className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold tracking-tight">
              חשבון מאושר (Aggregate)
            </h3>
            <p className="text-xs text-muted-foreground">
              §3.2.2.2 — חשבון מוגש מרוכז: רק סה&quot;כ. שורות BOQ מפורטות חסומות.
            </p>
          </div>
          <Badge
            variant="outline"
            className="border-amber-300 bg-amber-50 text-amber-800"
          >
            AGGREGATE
          </Badge>
        </header>
        <form onSubmit={onSubmit} className="space-y-3">
          <label className="flex flex-col gap-1 text-xs">
            <span className="font-medium text-slate-700">סה&quot;כ מאושר (₪)</span>
            <input
              type="number"
              step="0.01"
              min="0"
              value={aggregate}
              onChange={(e) => setAggregate(e.target.value)}
              className="rounded-md border border-slate-300 bg-white px-3 py-2 text-base font-semibold tabular-nums focus:border-slate-500 focus:outline-none"
            />
          </label>
          <div className="flex items-center justify-between gap-3">
            <span className="text-[11px] text-muted-foreground">
              מוגש: {ilsDetailed.format(submittedTotal)}
            </span>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={copySubmitted}
              >
                העתק מהמוגש
              </Button>
              <Button type="submit" disabled={pending} size="sm">
                {pending ? "מאשר…" : "אישור החשבון"}
              </Button>
            </div>
          </div>
          {feedback ? (
            <p
              className={cn(
                "text-xs font-medium",
                feedback.tone === "ok" ? "text-emerald-700" : "text-rose-700",
              )}
            >
              {feedback.text}
            </p>
          ) : null}
        </form>
      </Card>
    )
  }

  return (
    <Card
      className="space-y-4 border-slate-200 bg-card p-5 shadow-sm"
      dir="rtl"
    >
      <header className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-bold tracking-tight">
            חשבון מאושר — דו-לדג&apos;ר
          </h3>
          <p className="text-xs text-muted-foreground">
            §3.2.2.1 — מוגש (קבלן) מול מאושר (אנחנו). מילוי ריק = שווה למוגש.
          </p>
        </div>
        <Badge variant="outline" className="border-slate-300">
          DETAILED — {lines.length} שורות
        </Badge>
      </header>

      <form onSubmit={onSubmit} className="space-y-3">
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full min-w-[640px] text-right text-xs">
            <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2 font-semibold">#</th>
                <th className="px-3 py-2 font-semibold">תיאור</th>
                <th className="px-3 py-2 text-end font-semibold">מוגש</th>
                <th className="px-3 py-2 text-end font-semibold">מאושר</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {lines.map((line) => {
                const submitted = line.submittedAmount ?? line.cumulativeAmount
                return (
                  <tr key={line.id}>
                    <td className="px-3 py-2 font-mono text-[11px] text-slate-600">
                      {line.boqLineNo ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-slate-900">
                      {line.boqDescription ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-end font-currency-mono tabular-nums text-slate-700">
                      {ilsDetailed.format(submitted ?? 0)}
                    </td>
                    <td className="px-3 py-2 text-end">
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={approvedAmounts[line.id] ?? ""}
                        onChange={(e) => setApproved(line.id, e.target.value)}
                        className="w-32 rounded-md border border-slate-300 bg-white px-2 py-1 text-end font-currency-mono text-sm tabular-nums focus:border-slate-500 focus:outline-none"
                      />
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot className="bg-slate-50 text-slate-900">
              <tr>
                <td colSpan={2} className="px-3 py-2 text-end font-bold">
                  סה&quot;כ:
                </td>
                <td className="px-3 py-2 text-end font-currency-mono font-bold tabular-nums">
                  {ils.format(submittedTotal)}
                </td>
                <td className="px-3 py-2 text-end font-currency-mono font-bold tabular-nums">
                  {ils.format(approvedTotal)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        <div className="flex items-center justify-between gap-3">
          {feedback ? (
            <p
              className={cn(
                "text-xs font-medium",
                feedback.tone === "ok" ? "text-emerald-700" : "text-rose-700",
              )}
            >
              {feedback.text}
            </p>
          ) : (
            <span className="text-[11px] text-muted-foreground">
              לחיצה על &quot;אישור החשבון&quot; מריצה Waterfall מלא ומעדכנת את הסכום לתשלום.
            </span>
          )}
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={copySubmitted}
            >
              העתק מהמוגש
            </Button>
            <Button type="submit" disabled={pending} size="sm">
              {pending ? "מאשר…" : "אישור החשבון"}
            </Button>
          </div>
        </div>
      </form>
    </Card>
  )
}
