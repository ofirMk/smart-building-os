"use client"

import * as React from "react"
import { AlertTriangle, Loader2, RefreshCw } from "lucide-react"
import { toast } from "sonner"

import {
  applyBillingSyncSuggestions,
  suggestBillingQuantities,
  type BillingSyncLineSuggestion,
  type BillingSyncSuggestPayload,
} from "@/lib/marker-ofek/contracts/billing-sync-actions"
import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { cn, formatError } from "@/lib/utils"

type Props = {
  partialId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

function initEdits(lines: BillingSyncLineSuggestion[]): Record<string, number> {
  const o: Record<string, number> = {}
  for (const li of lines) {
    o[li.partialLineItemId] = li.modelSuggestedPercent
  }
  return o
}

export function FieldBillingSyncSheet({ partialId, open, onOpenChange }: Props) {
  const [loading, setLoading] = React.useState(false)
  const [applying, setApplying] = React.useState(false)
  const [data, setData] = React.useState<BillingSyncSuggestPayload | null>(null)
  const [edits, setEdits] = React.useState<Record<string, number>>({})

  React.useEffect(() => {
    if (!open) return
    let cancelled = false
    setLoading(true)
    setData(null)
    void (async () => {
      try {
        const res = await suggestBillingQuantities(partialId)
        if (cancelled) return
        if (!res.ok) {
          toast.error(res.error)
          return
        }
        setData(res.data)
        setEdits(initEdits(res.data.lineSuggestions))
      } catch (e) {
        if (!cancelled) toast.error(formatError(e))
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [open, partialId])

  async function handleApply() {
    if (!data?.lineSuggestions.length) {
      toast.message("אין שורות הצעה לעדכון — בדקו יומנים מאושרים וקישור גאנט–כמות")
      return
    }
    setApplying(true)
    try {
      const patches = data.lineSuggestions.map((li) => ({
        partialLineItemId: li.partialLineItemId,
        quantity_current:
          edits[li.partialLineItemId] ?? li.modelSuggestedPercent,
      }))
      const res = await applyBillingSyncSuggestions({
        partialAccountId: partialId,
        patches,
      })
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      toast.success(`עודכנו ${res.updatedLineCount} שורות בחשבון החלקי`)
      onOpenChange(false)
      window.location.reload()
    } catch (e) {
      toast.error(formatError(e))
    } finally {
      setApplying(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="left"
        className="flex w-full max-w-xl flex-col border-slate-100 bg-[#FFFFFF] sm:max-w-2xl"
        overlayClassName="bg-slate-900/40"
      >
        <SheetHeader className="border-b border-slate-100 pb-4 text-start">
          <SheetTitle className="text-lg text-[#1e293b]">
            סנכרון ביצוע מהשטח לחיוב
          </SheetTitle>
          <SheetDescription className="text-start text-slate-500">
            יומני שטח, כוח אדם מובנה והצעת אחוזים לפי משימות מאושרות וקישור לכתב
            כמויות. ניתן להתאים לפני החל על החשבון.
          </SheetDescription>
        </SheetHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-16 text-slate-500">
              <Loader2 className="size-5 animate-spin" aria-hidden />
              טוען נתוני שטח…
            </div>
          ) : data ? (
            <div className="flex flex-col gap-8">
              <section className="space-y-2 rounded-xl border border-slate-100 bg-background/50 p-3 text-sm">
                <p className="font-medium text-[#1e293b]">טווח תאריכים</p>
                <p className="font-currency-mono text-slate-600">
                  {data.period.startIso} → {data.period.endIso}
                </p>
                <p className="text-xs text-slate-500">{data.period.rationaleHe}</p>
                <p className="text-xs text-slate-600">
                  יומנים בטווח: {data.totalLogCount} · מאושרים לחיוב:{" "}
                  {data.approvedLogCount}
                </p>
              </section>

              <section className="space-y-2">
                <h3 className="text-sm font-semibold text-[#1e293b]">
                  דיווחי שטח
                </h3>
                {data.fieldReports.length === 0 ? (
                  <p className="rounded-lg border border-slate-100 bg-card px-3 py-4 text-sm text-slate-500">
                    אין יומנים בטווח התאריכים.
                  </p>
                ) : (
                  <ul className="flex max-h-56 flex-col gap-2 overflow-y-auto pe-1">
                    {data.fieldReports.map((r) => (
                      <li
                        key={r.logId}
                        className={cn(
                          "rounded-lg border px-3 py-2 text-xs",
                          r.includedInSuggestion
                            ? "border-emerald-100 bg-emerald-50/40"
                            : "border-slate-100 bg-card"
                        )}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-currency-mono font-medium text-[#1e293b]">
                            {r.logDate}
                          </span>
                          <span
                            className={cn(
                              "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase",
                              r.approvalStatus === "approved"
                                ? "bg-emerald-100 text-emerald-800"
                                : "bg-amber-100 text-amber-900"
                            )}
                          >
                            {r.approvalStatus === "approved"
                              ? "מאושר לחיוב"
                              : "טיוטה"}
                          </span>
                        </div>
                        <p className="mt-1 text-slate-600">
                          צוות: {r.crewCount} · {r.workPerformedSnippet || "—"}
                        </p>
                        {r.manpowerLines.length > 0 ? (
                          <ul className="mt-2 space-y-1 border-t border-slate-100 pt-2 text-slate-500">
                            {r.manpowerLines.map((m) => (
                              <li key={m.id}>
                                {m.roleLabelHe} ×{m.count} · {m.hours} ש׳
                                {m.taskName ? ` · ${m.taskName}` : ""}
                              </li>
                            ))}
                          </ul>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section className="space-y-2">
                <h3 className="text-sm font-semibold text-[#1e293b]">
                  הצעות לשורות חוזה (% נוכחי)
                </h3>
                {data.lineSuggestions.length === 0 ? (
                  <p className="rounded-lg border border-amber-100 bg-amber-50/40 px-3 py-4 text-sm text-amber-950">
                    לא נמצאה התאמה בין משימות ביומנים מאושרים לשורות החשבון. ודאו
                    קישור גאנט–כמות ושהיומנים במצב ״מאושר לחיוב״.
                  </p>
                ) : (
                  <div className="overflow-x-auto rounded-xl border border-slate-100">
                    <Table>
                      <TableHeader>
                        <TableRow className="border-slate-100 hover:bg-transparent">
                          <TableHead className="text-slate-600">סעיף</TableHead>
                          <TableHead className="text-slate-600">משימות</TableHead>
                          <TableHead className="w-24 text-end font-currency-mono text-slate-600">
                            מוצע %
                          </TableHead>
                          <TableHead className="w-28 text-end font-currency-mono text-slate-600">
                            מתאים
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {data.lineSuggestions.map((li) => {
                          const v =
                            edits[li.partialLineItemId] ?? li.modelSuggestedPercent
                          const warn = li.warnings.length > 0
                          return (
                            <TableRow
                              key={li.partialLineItemId}
                              className={cn(
                                "border-slate-100 align-top",
                                warn && "bg-amber-50/30"
                              )}
                            >
                              <TableCell className="text-sm">
                                <span className="font-currency-mono text-[#1e293b]">
                                  {li.sectionLabel}
                                </span>
                                <p className="mt-0.5 text-xs text-slate-500">
                                  {li.descriptionSnippet}
                                </p>
                                {warn ? (
                                  <div className="mt-2 flex items-start gap-1 text-xs text-amber-900">
                                    <AlertTriangle
                                      className="mt-0.5 size-3.5 shrink-0"
                                      aria-hidden
                                    />
                                    <span>{li.warnings.join(" · ")}</span>
                                  </div>
                                ) : null}
                              </TableCell>
                              <TableCell className="max-w-[10rem] text-xs text-slate-600">
                                {li.contributingTasks.length === 0 ? (
                                  "—"
                                ) : (
                                  <ul className="space-y-0.5">
                                    {li.contributingTasks.map((t) => (
                                      <li key={t.id}>
                                        {t.name}{" "}
                                        <span className="font-currency-mono">
                                          ({Math.round(t.progress)}%)
                                        </span>
                                      </li>
                                    ))}
                                  </ul>
                                )}
                              </TableCell>
                              <TableCell className="text-end font-currency-mono text-sm tabular-nums">
                                {li.rawSuggestedPercent > 100 ? (
                                  <span className="text-amber-800">
                                    {li.rawSuggestedPercent.toFixed(1)}
                                  </span>
                                ) : (
                                  li.modelSuggestedPercent.toFixed(1)
                                )}
                              </TableCell>
                              <TableCell className="text-end">
                                <div className="flex flex-col items-end gap-1">
                                  <Input
                                    type="number"
                                    step="0.1"
                                    min={0}
                                    max={100}
                                    className="h-8 w-20 font-currency-mono text-end text-sm"
                                    value={Number.isFinite(v) ? v : 0}
                                    onChange={(e) => {
                                      const n = parseFloat(e.target.value)
                                      setEdits((prev) => ({
                                        ...prev,
                                        [li.partialLineItemId]: Number.isFinite(n)
                                          ? n
                                          : 0,
                                      }))
                                    }}
                                  />
                                  <button
                                    type="button"
                                    className="inline-flex items-center gap-1 text-[10px] text-indigo-600 hover:text-indigo-500"
                                    onClick={() =>
                                      setEdits((prev) => ({
                                        ...prev,
                                        [li.partialLineItemId]:
                                          li.modelSuggestedPercent,
                                      }))
                                    }
                                  >
                                    <RefreshCw className="size-3" aria-hidden />
                                    איפוס להצעה
                                  </button>
                                </div>
                              </TableCell>
                            </TableRow>
                          )
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </section>
            </div>
          ) : null}
        </div>

        <SheetFooter className="border-t border-slate-100 pt-4">
          <div className="flex w-full flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              className="border-slate-200"
              disabled={applying}
              onClick={() => onOpenChange(false)}
            >
              ביטול
            </Button>
            <Button
              type="button"
              disabled={loading || applying || !data?.lineSuggestions.length}
              className="border border-indigo-600 bg-indigo-600 text-white hover:bg-indigo-700"
              onClick={() => void handleApply()}
            >
              {applying ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : null}
              אשר והחל על החשבון
            </Button>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
