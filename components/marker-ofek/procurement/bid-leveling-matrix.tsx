"use client"

/**
 * Sprint T12 — Tender Bid Leveling & Award Matrix (UI).
 *
 * Side-by-side comparison of vendor quotes for one RFQ:
 *   1. Header — title / project / valid_until / target budget.
 *   2. Matrix — left column = BOQ (description + qty), right columns =
 *      contractors. The cell with the lowest unit price for each row is
 *      highlighted in soft emerald. Subtotals row at the bottom shows
 *      total per contractor + variance vs. target budget (% colour-coded).
 *   3. Award row — one big CTA button per contractor that closes the loop
 *      via `awardContractAction`, with loader spinner + sonner toast.
 */

import * as React from "react"
import { toast } from "sonner"
import { CheckCircle2, Crown, Info, Loader2, Trophy } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  awardContractAction,
  type TenderComparison,
} from "@/lib/marker-ofek/procurement/t12-tender-comparison-actions"
import { cn } from "@/lib/utils"

const ILS = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 0,
})

const ILS_PRECISE = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 2,
})

const HE_DATE = new Intl.DateTimeFormat("he-IL", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
})

export function BidLevelingMatrix({
  comparison: initialComparison,
}: {
  comparison: TenderComparison
}) {
  const [comparison, setComparison] = React.useState(initialComparison)
  const [awardingQuoteId, setAwardingQuoteId] = React.useState<string | null>(null)
  const [winningQuoteId, setWinningQuoteId] = React.useState<string | null>(
    initialComparison.contractors.find((c) => c.isWinner)?.quoteId ?? null,
  )

  const isClosed = comparison.status === "CLOSED" || winningQuoteId !== null

  // Pre-compute, per BOQ line, the minimum unit price across all contractors
  // — drives the green-tile highlight in the matrix.
  const minPriceByLineId = React.useMemo(() => {
    const map: Record<string, number> = {}
    for (const line of comparison.lines) {
      const prices = comparison.contractors
        .map((c) => c.unitPriceByLineId[line.id] ?? 0)
        .filter((p) => p > 0)
      map[line.id] = prices.length > 0 ? Math.min(...prices) : 0
    }
    return map
  }, [comparison])

  const handleAward = async (quoteId: string) => {
    setAwardingQuoteId(quoteId)
    try {
      const res = await awardContractAction({
        quoteId,
        isMock: comparison.isMock,
      })
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      toast.success(res.message, {
        description:
          res.mode === "mock"
            ? "מצב הדגמה — בייצור פעולה זו תיצור חוזה אמיתי בטבלת erp_subcontractor_contracts."
            : res.contractId
              ? `מזהה חוזה: ${res.contractId.slice(0, 8)}…`
              : undefined,
      })
      setWinningQuoteId(quoteId)
      // Reflect winner status locally for instant visual feedback.
      setComparison((prev) => ({
        ...prev,
        status: "CLOSED",
        contractors: prev.contractors.map((c) => ({
          ...c,
          isWinner: c.quoteId === quoteId,
        })),
      }))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "שגיאה לא צפויה")
    } finally {
      setAwardingQuoteId(null)
    }
  }

  const targetBudget = comparison.targetBudget

  return (
    <div dir="rtl" className="flex flex-col gap-5">
      {/* ---------- Header ---------- */}
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[10px] font-mono uppercase tracking-[0.18em] text-muted-foreground">
            Sprint T12 · MedaTech §7 Tender Bid Leveling
          </p>
          <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            {comparison.title}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            <span className="font-medium text-foreground/90">
              {comparison.projectName}
            </span>
            {" · "}
            מס׳ מכרז {comparison.rfqNumber}
            {comparison.validUntil ? (
              <>
                {" · "}
                סגירה ב-{HE_DATE.format(new Date(comparison.validUntil))}
              </>
            ) : null}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {comparison.isMock ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-300 bg-amber-50 px-2.5 py-1 text-[11px] font-medium text-amber-900">
              <Info className="size-3.5" aria-hidden />
              מצב הדגמה — נתונים לדוגמה
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-300 bg-emerald-50 px-2.5 py-1 text-[11px] font-medium text-emerald-900">
              <CheckCircle2 className="size-3.5" aria-hidden />
              נתונים חיים מה-DB
            </span>
          )}
          <span
            className={cn(
              "inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-medium",
              isClosed
                ? "border-slate-300 bg-slate-100 text-slate-700"
                : "border-indigo-300 bg-indigo-50 text-indigo-900",
            )}
          >
            סטטוס: {isClosed ? "סגור" : "פתוח להגשות"}
          </span>
        </div>
      </header>

      {/* ---------- Target budget banner ---------- */}
      <Card className="flex flex-wrap items-center justify-between gap-3 border-indigo-200 bg-indigo-50/50 p-4">
        <div className="flex items-center gap-2">
          <Trophy className="size-5 text-indigo-700" aria-hidden />
          <div>
            <p className="text-[11px] font-mono uppercase text-indigo-800/80">
              תקציב יעד · Target Budget
            </p>
            <p className="font-mono text-xl font-bold tabular-nums text-indigo-950">
              {ILS.format(targetBudget)}
            </p>
          </div>
        </div>
        <p className="max-w-md text-xs text-indigo-900/80">
          תקציב היעד מחושב ממינימום מחיר-יחידה לכל סעיף × כמות, ומשמש כעוגן לחישוב
          סטיית כל הצעה (% מתחת/מעל).
        </p>
      </Card>

      {/* ---------- Matrix ---------- */}
      <Card className="border-border/70 p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead className="min-w-[260px] whitespace-nowrap">
                  סעיף כתב כמויות (BOQ)
                </TableHead>
                <TableHead className="text-end whitespace-nowrap">כמות</TableHead>
                {comparison.contractors.map((c) => (
                  <TableHead
                    key={c.quoteId}
                    className={cn(
                      "min-w-[180px] text-center whitespace-nowrap",
                      c.isWinner && "bg-emerald-100/70",
                    )}
                  >
                    <div className="flex flex-col items-center gap-0.5">
                      <span className="flex items-center gap-1 font-semibold text-foreground">
                        {c.isWinner ? (
                          <Crown
                            className="size-3.5 text-amber-500"
                            aria-hidden
                          />
                        ) : null}
                        {c.contractorName}
                      </span>
                      <span className="font-mono text-[10px] uppercase text-muted-foreground">
                        {c.quoteNumber}
                      </span>
                    </div>
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {comparison.lines.map((line) => {
                const minPrice = minPriceByLineId[line.id] ?? 0
                return (
                  <TableRow key={line.id}>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="text-sm font-medium text-foreground">
                          {line.lineNumber}. {line.description}
                        </span>
                        {line.uom ? (
                          <span className="text-[10px] font-mono uppercase text-muted-foreground">
                            יחידה: {line.uom}
                          </span>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell className="text-end font-mono tabular-nums text-foreground/80">
                      {line.quantity.toLocaleString("he-IL")}
                    </TableCell>
                    {comparison.contractors.map((c) => {
                      const unit = c.unitPriceByLineId[line.id] ?? 0
                      const lineTotal = unit * line.quantity
                      const isBest = unit > 0 && unit === minPrice
                      return (
                        <TableCell
                          key={`${line.id}-${c.quoteId}`}
                          className={cn(
                            "text-center align-middle transition-colors",
                            isBest &&
                              "bg-emerald-50 ring-1 ring-inset ring-emerald-300",
                          )}
                        >
                          {unit > 0 ? (
                            <div className="flex flex-col items-center gap-0.5">
                              <span
                                className={cn(
                                  "font-mono text-sm font-semibold tabular-nums",
                                  isBest
                                    ? "text-emerald-800"
                                    : "text-foreground",
                                )}
                              >
                                {ILS_PRECISE.format(unit)}
                              </span>
                              <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
                                סה״כ {ILS.format(lineTotal)}
                              </span>
                              {isBest ? (
                                <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-600 px-1.5 py-0.5 text-[9px] font-bold uppercase text-white">
                                  Best
                                </span>
                              ) : null}
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground/60">
                              —
                            </span>
                          )}
                        </TableCell>
                      )
                    })}
                  </TableRow>
                )
              })}

              {/* Totals row */}
              <TableRow className="bg-slate-50 font-semibold hover:bg-slate-50">
                <TableCell className="text-foreground">
                  סה״כ הצעה
                </TableCell>
                <TableCell />
                {comparison.contractors.map((c) => {
                  const variance =
                    targetBudget > 0
                      ? ((c.totalAmount - targetBudget) / targetBudget) * 100
                      : 0
                  const varianceColor =
                    variance <= 0
                      ? "text-emerald-700"
                      : variance <= 5
                        ? "text-amber-700"
                        : "text-rose-700"
                  return (
                    <TableCell
                      key={`total-${c.quoteId}`}
                      className={cn(
                        "text-center",
                        c.isWinner && "bg-emerald-100/70",
                      )}
                    >
                      <div className="flex flex-col items-center gap-0.5">
                        <span className="font-mono text-base font-bold tabular-nums text-foreground">
                          {ILS.format(c.totalAmount)}
                        </span>
                        <span className={cn("font-mono text-[11px] tabular-nums", varianceColor)}>
                          {variance >= 0 ? "+" : ""}
                          {variance.toFixed(1)}% מהיעד
                        </span>
                      </div>
                    </TableCell>
                  )
                })}
              </TableRow>

              {/* Award row */}
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={2} className="bg-card">
                  <span className="text-xs text-muted-foreground">
                    בחירת זוכה תסגור את המכרז ותפיק חוזה קבלן משנה אוטומטית.
                  </span>
                </TableCell>
                {comparison.contractors.map((c) => {
                  const isAwarding = awardingQuoteId === c.quoteId
                  const isThisWinner = winningQuoteId === c.quoteId
                  return (
                    <TableCell
                      key={`award-${c.quoteId}`}
                      className={cn(
                        "p-3 text-center",
                        c.isWinner && "bg-emerald-100/70",
                      )}
                    >
                      {isThisWinner ? (
                        <span className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-3 py-2 text-xs font-bold text-white shadow-sm">
                          <Crown className="size-3.5" aria-hidden />
                          זכה במכרז
                        </span>
                      ) : (
                        <Button
                          type="button"
                          size="sm"
                          disabled={isClosed || isAwarding || awardingQuoteId !== null}
                          onClick={() => void handleAward(c.quoteId)}
                          className={cn(
                            "w-full gap-1.5 bg-indigo-600 text-white shadow-sm transition-all hover:bg-indigo-700",
                            "disabled:cursor-not-allowed disabled:opacity-50",
                          )}
                        >
                          {isAwarding ? (
                            <>
                              <Loader2 className="size-3.5 animate-spin" aria-hidden />
                              מעבד…
                            </>
                          ) : (
                            <>
                              <Trophy className="size-3.5" aria-hidden />
                              בחר כזוכה
                            </>
                          )}
                        </Button>
                      )}
                    </TableCell>
                  )
                })}
              </TableRow>
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  )
}
