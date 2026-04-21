"use client"

import Link from "next/link"
import * as React from "react"
import { ArrowRight, ClipboardList, Download, Loader2 } from "lucide-react"
import { toast } from "sonner"

import {
  applyApprovedFieldLogsToPartialAccount,
  generatePartialAccount,
} from "@/lib/marker-ofek/billing-engine-actions"
import { FieldBillingSyncSheet } from "@/components/marker-ofek/field-billing-sync-sheet"
import {
  contextMenuIcons,
  SmartTableContextMenuPortal,
} from "@/components/marker-ofek/smart-table-context-menu"
import { calculatePartialAccount } from "@/lib/marker-ofek/partial-account-actions"
import {
  downloadPartialAccountPdf,
  type PartialAccountPdfLine,
} from "@/lib/marker-ofek/partial-account-pdf"
import { buttonVariants } from "@/components/ui/button-variants"
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

export type PartialAccountDetailLine = {
  id: string
  section: string
  description: string
  unit: string
  contractQty: number | null
  unitPrice: number | null
  quantity_previous: number
  quantity_current: number
  cumulative_amount: number
  line_total_price: number
  isMilestone: boolean
}

export type PartialAccountVariationLine = {
  voNumber: number
  voTitle: string
  section_code: string | null
  description: string
  unit: string | null
  quantity: number
  unit_price: number
  line_total: number
}

export type PartialAccountPdfMeta = {
  seriesCode: string
  baseIndex: { index_value: number; index_date: string } | null
  currentIndex: { index_value: number; index_date: string } | null
  indexRatio: number | null
  indexationAdjustment: number
  retainageAmount: number
  storedPeriodGross: number
}

export type PartialAccountDetailInitial = {
  partialId: string
  contractId: string
  accountNumber: number
  status: string
  projectName: string
  internalCode: string
  contractLabel: string
  paymentDue: number
  totalCumulative: number
  periodWorkIndexed: number
  retention: number
  insurance: number
  labFees: number
  periodWorkGross: number
  pdfMeta: PartialAccountPdfMeta
  lines: PartialAccountDetailLine[]
  variations: PartialAccountVariationLine[]
}

const currencyFormatter = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  minimumFractionDigits: 2,
})

const STATUS_HE: Record<string, string> = {
  draft: "טיוטה",
  submitted: "הוגש",
  approved: "מאושר",
  paid: "שולם",
}

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100
}

export function PartialAccountDetailClient({
  initial,
}: {
  initial: PartialAccountDetailInitial
}) {
  const [lines, setLines] = React.useState(initial.lines)
  const [periodStart, setPeriodStart] = React.useState("")
  const [periodEnd, setPeriodEnd] = React.useState("")
  const [busy, setBusy] = React.useState<string | null>(null)
  const [fieldSyncOpen, setFieldSyncOpen] = React.useState(false)
  const [lineCtx, setLineCtx] = React.useState<{
    x: number
    y: number
    line: PartialAccountDetailLine
    periodNis: string
  } | null>(null)

  React.useEffect(() => {
    setLines(initial.lines)
  }, [initial])

  const isDraft = initial.status === "draft"

  async function handleFieldFetch() {
    setBusy("field")
    try {
      const res = await applyApprovedFieldLogsToPartialAccount({
        partialAccountId: initial.partialId,
        periodStart: periodStart.trim() || null,
        periodEnd: periodEnd.trim() || null,
      })
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      toast.success(
        `עודכנו ${res.updatedLineCount} שורות מתוך ${res.logsUsed} יומנים מאושרים`
      )
      window.location.reload()
    } catch (e) {
      toast.error(formatError(e))
    } finally {
      setBusy(null)
    }
  }

  async function handleRecalc() {
    setBusy("recalc")
    try {
      const patches = lines.map((li) => ({
        id: li.id,
        quantity_previous: li.quantity_previous,
        quantity_current: li.quantity_current,
      }))
      const res = await calculatePartialAccount({
        partialAccountId: initial.partialId,
        linePatches: patches,
        nextStatus: null,
      })
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      toast.success("החשבון חולק מחדש")
      window.location.reload()
    } catch (e) {
      toast.error(formatError(e))
    } finally {
      setBusy(null)
    }
  }

  async function handlePdf() {
    setBusy("pdf")
    try {
      const pdfLines: PartialAccountPdfLine[] = lines.map((li) => {
        const base =
          li.contractQty != null && li.unitPrice != null
            ? roundMoney(li.contractQty * li.unitPrice)
            : li.isMilestone
              ? roundMoney(li.unitPrice ?? 0)
              : 0
        const qPrev = Math.min(100, Math.max(0, li.quantity_previous))
        const qCur = Math.min(100, Math.max(0, li.quantity_current))
        const cum = base > 0 ? roundMoney((qCur / 100) * base) : li.cumulative_amount
        const period = base > 0
          ? roundMoney((Math.max(0, qCur - qPrev) / 100) * base)
          : li.line_total_price
        return {
          section: li.section,
          description: li.description,
          unit: li.unit || "—",
          contractQty: li.contractQty ?? (li.isMilestone ? 1 : 0),
          unitPrice: li.unitPrice ?? 0,
          qtyPrevious: qPrev,
          qtyCurrent: qCur,
          cumulativeAmount: cum,
          periodAmount: period,
        }
      })

      const pm = initial.pdfMeta
      const indexBlock =
        pm.baseIndex && pm.currentIndex && pm.indexRatio != null
          ? {
              seriesLabel: pm.seriesCode,
              baseDateLabel: pm.baseIndex.index_date,
              baseValue: pm.baseIndex.index_value,
              currentDateLabel: pm.currentIndex.index_date,
              currentValue: pm.currentIndex.index_value,
              ratio: pm.indexRatio,
              adjustmentAmount: pm.indexationAdjustment,
            }
          : null

      await downloadPartialAccountPdf({
        projectName: initial.projectName,
        internalCode: initial.internalCode,
        contractLabel: initial.contractLabel,
        accountNumber: initial.accountNumber,
        statusLabel: STATUS_HE[initial.status] ?? initial.status,
        issuedAt: new Date(),
        lines: pdfLines,
        periodWorkGross: initial.periodWorkGross,
        periodWorkIndexed: initial.periodWorkIndexed,
        retention: initial.retention,
        insurance: initial.insurance,
        labFees: initial.labFees,
        paymentDue: initial.paymentDue,
        totalCumulative: initial.totalCumulative,
        indexationBlock: indexBlock,
        retainageBlock: {
          amountThisPeriod: pm.retainageAmount,
        },
      })
      toast.success("הורדת PDF")
    } catch (e) {
      toast.error(formatError(e))
    } finally {
      setBusy(null)
    }
  }

  return (
    <div
      className="min-h-[calc(100vh-4rem)] bg-[#FFFFFF] px-4 py-8 md:px-8"
      dir="rtl"
    >
      <SmartTableContextMenuPortal
        open={lineCtx != null}
        x={lineCtx?.x ?? 0}
        y={lineCtx?.y ?? 0}
        onClose={() => setLineCtx(null)}
        actions={
          lineCtx
            ? [
                {
                  id: "copy-line-desc",
                  label: "העתק תיאור שורה",
                  icon: contextMenuIcons.duplicate,
                  onSelect: () => {
                    void navigator.clipboard.writeText(lineCtx.line.description)
                    toast.success("התיאור הועתק")
                  },
                },
                {
                  id: "copy-period-nis",
                  label: "העתק סכום תקופה (₪)",
                  icon: contextMenuIcons.catalog,
                  onSelect: () => {
                    void navigator.clipboard.writeText(lineCtx.periodNis)
                    toast.success("סכום התקופה הועתק")
                  },
                },
              ]
            : []
        }
        navItems={[
          {
            label: "מרכז חיוב החוזה",
            href: `/marker-ofek/finance/contracts/${initial.contractId}`,
          },
          {
            label: "חשבון חלקי (מזהה)",
            href: `/marker-ofek/finance/contracts/billing/${initial.partialId}`,
          },
        ]}
      />
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Link
            href={`/marker-ofek/finance/contracts/${initial.contractId}`}
            className="inline-flex w-fit items-center gap-2 text-sm text-slate-500 transition-colors hover:text-indigo-600"
          >
            <ArrowRight className="size-4 rotate-180" aria-hidden />
            חזרה למרכז חיוב החוזה
          </Link>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => void handlePdf()}
              className={cn(
                buttonVariants({ variant: "outline", size: "sm" }),
                "gap-2 border-indigo-200 text-indigo-800 hover:bg-indigo-50"
              )}
            >
              {busy === "pdf" ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <Download className="size-4" aria-hidden />
              )}
              הורד PDF — חשבון חלקי
            </button>
            <button
              type="button"
              disabled={busy !== null}
              onClick={() =>
                void (async () => {
                  setBusy("next")
                  try {
                    const res = await generatePartialAccount(initial.contractId)
                    if (!res.ok) {
                      toast.error(res.error)
                      return
                    }
                    toast.success(`נוצר חשבון מס׳ ${res.accountNumber}`)
                    window.location.href = `/marker-ofek/finance/contracts/billing/${res.partialAccountId}`
                  } catch (e) {
                    toast.error(formatError(e))
                  } finally {
                    setBusy(null)
                  }
                })()
              }
              className={cn(
                buttonVariants({ variant: "outline", size: "sm" }),
                "border-slate-200"
              )}
            >
              {busy === "next" ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : null}
              הפקת חשבון חלקי הבא
            </button>
          </div>
        </div>

        <header className="space-y-2 border-b border-slate-100 pb-6">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-indigo-600">
            לוח חיוב — חשבון חלקי
          </p>
          <h1 className="text-2xl font-bold tracking-tight text-[#1e293b]">
            {initial.projectName}{" "}
            <span className="font-currency-mono text-lg font-semibold text-slate-500">
              · מס׳ {initial.accountNumber}
            </span>
          </h1>
          <p className="text-sm text-slate-500">
            {initial.contractLabel} · קוד פרויקט{" "}
            <span className="font-currency-mono">{initial.internalCode}</span> ·{" "}
            {STATUS_HE[initial.status] ?? initial.status}
          </p>
          <div className="flex flex-wrap gap-4 pt-2 font-currency-mono text-sm tabular-nums text-[#1e293b]">
            <span>
              לתשלום (תקופה):{" "}
              <strong className="text-indigo-700">
                {currencyFormatter.format(initial.paymentDue)}
              </strong>
            </span>
            <span>
              מצטבר:{" "}
              <strong>{currencyFormatter.format(initial.totalCumulative)}</strong>
            </span>
          </div>
        </header>

        {isDraft ? (
          <section
            className="flex flex-col gap-3 rounded-xl border border-slate-100 bg-background/40 p-4"
            aria-label="משיכת נתוני שדה"
          >
            <FieldBillingSyncSheet
              partialId={initial.partialId}
              open={fieldSyncOpen}
              onOpenChange={setFieldSyncOpen}
            />
            <div className="flex flex-wrap items-center gap-2">
              <ClipboardList className="size-4 text-indigo-600" aria-hidden />
              <h2 className="text-sm font-semibold text-[#1e293b]">
                משיכת נתוני שטח (יומנים מאושרים)
              </h2>
            </div>
            <p className="text-xs text-slate-500">
              יומנים במצב ״מאושר לחיוב״ בפרויקט — מוצעים אחוזי ביצוע נוכחי לפי משימות
              וקישור כתב כמויות. השארו תאריכים ריקים לכל היומנים המאושרים.
            </p>
            <div className="flex flex-wrap items-end gap-3">
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => setFieldSyncOpen(true)}
                className={cn(
                  buttonVariants({ variant: "default", size: "sm" }),
                  "border border-indigo-600 bg-indigo-600 text-white hover:bg-indigo-700"
                )}
              >
                סנכרן נתוני ביצוע מהשטח
              </button>
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-500">
                  מתאריך
                </label>
                <Input
                  type="date"
                  className="h-9 w-40 font-currency-mono text-sm"
                  value={periodStart}
                  onChange={(e) => setPeriodStart(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-500">
                  עד תאריך
                </label>
                <Input
                  type="date"
                  className="h-9 w-40 font-currency-mono text-sm"
                  value={periodEnd}
                  onChange={(e) => setPeriodEnd(e.target.value)}
                />
              </div>
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => void handleFieldFetch()}
                className={cn(
                  buttonVariants({ variant: "outline", size: "sm" }),
                  "border-slate-200 text-slate-700"
                )}
              >
                {busy === "field" ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                ) : null}
                יישום מהיר (ללא תצוגה מקדימה)
              </button>
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => void handleRecalc()}
                className={cn(
                  buttonVariants({ variant: "outline", size: "sm" }),
                  "border-slate-200"
                )}
              >
                {busy === "recalc" ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                ) : null}
                חישוב מצטבר
              </button>
            </div>
          </section>
        ) : null}

        <section className="space-y-2" aria-label="טבלת חיוב">
          <h2 className="text-lg font-semibold text-[#1e293b]">
            פירוט שורות חוזה
          </h2>
          <div className="overflow-x-auto rounded-xl border border-slate-100">
            <Table>
              <TableHeader>
                <TableRow className="border-slate-100 hover:bg-transparent">
                  <TableHead className="text-slate-600">סעיף</TableHead>
                  <TableHead className="text-slate-600">תיאור</TableHead>
                  <TableHead className="text-slate-600">יחידה</TableHead>
                  <TableHead className="text-end font-currency-mono text-slate-600">
                    כמות חוזה
                  </TableHead>
                  <TableHead className="text-end font-currency-mono text-slate-600">
                    מחיר יח׳
                  </TableHead>
                  <TableHead className="text-end font-currency-mono text-slate-600">
                    מצטבר קודם %
                  </TableHead>
                  <TableHead className="text-end font-currency-mono text-slate-600">
                    ביצוע נוכחי %
                  </TableHead>
                  <TableHead className="text-end font-currency-mono text-slate-600">
                    סה״כ לתשלום (תקופה)
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lines.map((li) => {
                  const base =
                    li.contractQty != null && li.unitPrice != null
                      ? roundMoney(li.contractQty * li.unitPrice)
                      : li.isMilestone
                        ? roundMoney(li.unitPrice ?? 0)
                        : 0
                  const qPrev = Math.min(
                    100,
                    Math.max(0, Number(li.quantity_previous) || 0)
                  )
                  const qCur = Math.min(
                    100,
                    Math.max(0, Number(li.quantity_current) || 0)
                  )
                  const period =
                    base > 0
                      ? roundMoney((Math.max(0, qCur - qPrev) / 100) * base)
                      : li.line_total_price
                  return (
                    <TableRow
                      key={li.id}
                      className="border-slate-100 align-top"
                      onContextMenu={(e) => {
                        e.preventDefault()
                        setLineCtx({
                          x: e.clientX,
                          y: e.clientY,
                          line: li,
                          periodNis: currencyFormatter.format(period),
                        })
                      }}
                    >
                      <TableCell className="font-currency-mono text-sm text-[#1e293b]">
                        {li.section}
                      </TableCell>
                      <TableCell className="max-w-[14rem] text-sm text-slate-800">
                        {li.description}
                      </TableCell>
                      <TableCell className="font-currency-mono text-sm text-slate-600">
                        {li.unit || "—"}
                      </TableCell>
                      <TableCell className="text-end font-currency-mono text-sm tabular-nums">
                        {li.contractQty != null
                          ? new Intl.NumberFormat("he-IL", {
                              maximumFractionDigits: 2,
                            }).format(li.contractQty)
                          : "—"}
                      </TableCell>
                      <TableCell className="text-end font-currency-mono text-sm tabular-nums">
                        {li.unitPrice != null
                          ? currencyFormatter.format(li.unitPrice)
                          : "—"}
                      </TableCell>
                      <TableCell className="w-[6.5rem] text-end">
                        {isDraft ? (
                          <Input
                            type="number"
                            step="0.01"
                            min={0}
                            max={100}
                            className="h-8 font-currency-mono text-end text-sm"
                            value={li.quantity_previous}
                            onChange={(e) => {
                              const v = parseFloat(e.target.value)
                              setLines((prev) =>
                                prev.map((x) =>
                                  x.id === li.id
                                    ? {
                                        ...x,
                                        quantity_previous: Number.isFinite(v)
                                          ? v
                                          : 0,
                                      }
                                    : x
                                )
                              )
                            }}
                          />
                        ) : (
                          <span className="font-currency-mono text-sm tabular-nums">
                            {li.quantity_previous.toFixed(2)}%
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="w-[6.5rem] text-end">
                        {isDraft ? (
                          <Input
                            type="number"
                            step="0.01"
                            min={0}
                            max={100}
                            className="h-8 font-currency-mono text-end text-sm"
                            value={li.quantity_current}
                            onChange={(e) => {
                              const v = parseFloat(e.target.value)
                              setLines((prev) =>
                                prev.map((x) =>
                                  x.id === li.id
                                    ? {
                                        ...x,
                                        quantity_current: Number.isFinite(v)
                                          ? v
                                          : 0,
                                      }
                                    : x
                                )
                              )
                            }}
                          />
                        ) : (
                          <span className="font-currency-mono text-sm tabular-nums">
                            {li.quantity_current.toFixed(2)}%
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-end font-currency-mono text-sm font-medium tabular-nums text-indigo-800">
                        {currencyFormatter.format(period)}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        </section>

        <section className="space-y-2" aria-label="חריגים מאושרים">
          <h2 className="text-lg font-semibold text-indigo-800">
            הזמנות שינוי (חריגים) מאושרות
          </h2>
          {initial.variations.length === 0 ? (
            <p className="rounded-xl border border-slate-100 bg-background/30 px-4 py-6 text-sm text-slate-500">
              אין VO מאושרים רשומים לחוזה זה.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-indigo-100 bg-indigo-50/20">
              <Table>
                <TableHeader>
                  <TableRow className="border-indigo-100 hover:bg-transparent">
                    <TableHead className="text-slate-600">מס׳ VO</TableHead>
                    <TableHead className="text-slate-600">כותרת</TableHead>
                    <TableHead className="text-slate-600">סעיף</TableHead>
                    <TableHead className="text-slate-600">תיאור</TableHead>
                    <TableHead className="text-end font-currency-mono text-slate-600">
                      כמות
                    </TableHead>
                    <TableHead className="text-end font-currency-mono text-slate-600">
                      מחיר יח׳
                    </TableHead>
                    <TableHead className="text-end font-currency-mono text-slate-600">
                      סה״כ
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {initial.variations.map((v, i) => (
                    <TableRow key={`${v.voNumber}-${i}`} className="border-indigo-100">
                      <TableCell className="font-currency-mono text-sm">
                        {v.voNumber}
                      </TableCell>
                      <TableCell className="text-sm">{v.voTitle}</TableCell>
                      <TableCell className="font-currency-mono text-sm">
                        {v.section_code ?? "—"}
                      </TableCell>
                      <TableCell className="text-sm text-slate-800">
                        {v.description}
                      </TableCell>
                      <TableCell className="text-end font-currency-mono text-sm tabular-nums">
                        {new Intl.NumberFormat("he-IL", {
                          maximumFractionDigits: 2,
                        }).format(v.quantity)}
                      </TableCell>
                      <TableCell className="text-end font-currency-mono text-sm tabular-nums">
                        {currencyFormatter.format(v.unit_price)}
                      </TableCell>
                      <TableCell className="text-end font-currency-mono text-sm font-semibold tabular-nums">
                        {currencyFormatter.format(v.line_total)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
