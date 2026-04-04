"use client"

import Link from "next/link"
import * as React from "react"
import { useRouter } from "next/navigation"
import {
  AlertTriangle,
  FileDown,
  GitCompareArrows,
  Loader2,
  Plus,
  RefreshCw,
  TrendingUp,
  X,
} from "lucide-react"
import { toast } from "sonner"

import { calculatePartialAccount } from "@/lib/marker-ofek/partial-account-actions"
import {
  contextMenuIcons,
  SmartTableContextMenuPortal,
  type SmartContextMenuAction,
} from "@/components/marker-ofek/smart-table-context-menu"
import { SyncProgressBar } from "@/components/marker-ofek/sync-progress-bar"
import { buttonVariants } from "@/components/ui/button-variants"
import { Input } from "@/components/ui/input"
import { cn, formatError } from "@/lib/utils"
import {
  buildGanttBillingSyncComparison,
  gapExceedsAlertThreshold,
  resolveFieldPercentForPartialLine,
} from "@/lib/marker-ofek/gantt-billing-sync"
import { downloadGapHunterPdfReport } from "@/lib/marker-ofek/gap-hunter-pdf"
import {
  buildLineEditsFromPartialAccounts,
  toRevenueGapLineInput,
} from "@/lib/marker-ofek/revenue-gap-partial-line"
import {
  getLineDualGapInfo,
  summarizeDualGapRibbon,
} from "@/lib/marker-ofek/revenue-gap"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import type { MoPartialAccountStatus } from "@/types/marker-ofek"

import { useModuleVisibilityOptional } from "@/components/marker-ofek/marker-ofek-dashboard-context"
import { CreateAccountDialog } from "./create-account-dialog"
import type { ContractBillingInitial } from "@/lib/marker-ofek/contract-billing-types"

export type { ContractBillingInitial } from "@/lib/marker-ofek/contract-billing-types"

const currencyFormatter = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  minimumFractionDigits: 2,
})

const STATUS_LABELS: Record<MoPartialAccountStatus, string> = {
  draft: "טיוטה",
  submitted: "הוגש",
  approved: "מאושר",
  paid: "שולם",
}

function buildLineEditsFromInitial(initial: ContractBillingInitial) {
  return buildLineEditsFromPartialAccounts(initial.partialAccounts)
}

export function ContractBillingCenterClient({
  initial,
}: {
  initial: ContractBillingInitial
}) {
  const router = useRouter()
  const [billingCtx, setBillingCtx] = React.useState<{
    x: number
    y: number
    partialId: string
    line: ContractBillingInitial["partialAccounts"][number]["lines"][number]
  } | null>(null)
  const [busyId, setBusyId] = React.useState<string | null>(null)
  const [createOpen, setCreateOpen] = React.useState(false)
  const [showSyncDialog, setShowSyncDialog] = React.useState(false)
  const [syncPartialId, setSyncPartialId] = React.useState<string | null>(null)
  const [lineEdits, setLineEdits] = React.useState(() =>
    buildLineEditsFromInitial(initial)
  )
  const [showExceptionsOnly, setShowExceptionsOnly] = React.useState<
    Record<string, boolean>
  >({})
  const [pdfPartialId, setPdfPartialId] = React.useState<string | null>(null)

  const moduleCtx = useModuleVisibilityOptional()
  const gapHunterEnabled = moduleCtx?.isModuleEnabled("gapHunter") ?? true
  const ganttModuleEnabled = moduleCtx?.isModuleEnabled("gantt") ?? true
  const tableColSpan = ganttModuleEnabled ? 7 : 6

  /** BOQ (`gantt_suggested_percent`) + fuzzy fallback; billing side = draft נוכחי % when present. */
  const syncRows = React.useMemo(() => {
    if (!syncPartialId) return []
    const pa = initial.partialAccounts.find((p) => p.id === syncPartialId)
    if (!pa) return []
    return buildGanttBillingSyncComparison(
      pa.lines.map((li) => {
        const draft = lineEdits[li.id]
        const qCur = draft?.quantity_current ?? li.quantity_current
        return {
          id: li.id,
          label: li.label,
          quantity_current: qCur,
          gantt_suggested_percent: li.gantt_suggested_percent,
          contract_line_item_id: li.contract_line_item_id,
          contract_milestone_id: li.contract_milestone_id,
        }
      }),
      initial.ganttTasksForSync
    )
  }, [
    initial.ganttTasksForSync,
    initial.partialAccounts,
    lineEdits,
    syncPartialId,
  ])

  function openSyncDialog(partialId: string) {
    setSyncPartialId(partialId)
    setShowSyncDialog(true)
  }

  function closeSyncDialog() {
    setShowSyncDialog(false)
    setSyncPartialId(null)
  }

  async function confirmSyncApplyToAccount() {
    if (!syncPartialId) return
    const pa = initial.partialAccounts.find((p) => p.id === syncPartialId)
    if (!pa) return

    const syncByLineId = new Map(syncRows.map((r) => [r.lineId, r]))
    const linePatches = pa.lines.map((li) => {
      const e = lineEdits[li.id] ?? {
        quantity_previous: li.quantity_previous,
        quantity_current: li.quantity_current,
      }
      const sync = syncByLineId.get(li.id)
      const quantity_current =
        sync?.ganttPercent != null ? sync.ganttPercent : e.quantity_current
      return {
        id: li.id,
        quantity_previous: e.quantity_previous,
        quantity_current,
      }
    })

    setBusyId(syncPartialId)
    try {
      const res = await calculatePartialAccount({
        partialAccountId: syncPartialId,
        linePatches,
        nextStatus: null,
      })
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      toast.success("החשבון עודכן לפי ביצוע הגנט")
      closeSyncDialog()
      window.location.reload()
    } catch (e) {
      toast.error(formatError(e))
    } finally {
      setBusyId(null)
    }
  }

  React.useEffect(() => {
    setLineEdits(buildLineEditsFromInitial(initial))
  }, [initial])

  const totalContract = initial.totalContract
  const recognized = initial.totalRecognized
  const remaining =
    totalContract != null && Number.isFinite(totalContract)
      ? Math.max(0, roundMoney(totalContract - recognized))
      : null

  const invoicedPctOfContract =
    totalContract != null &&
    totalContract > 0 &&
    Number.isFinite(recognized)
      ? Math.min(100, (recognized / totalContract) * 100)
      : null

  /** Fills draft נוכחי % from Gantt (BOQ + fuzzy); user may edit fields before / after. */
  function applyBridgeSyncToDraft(partialId: string) {
    const pa = initial.partialAccounts.find((p) => p.id === partialId)
    if (!pa) return
    const rows = buildGanttBillingSyncComparison(
      pa.lines.map((li) => {
        const draft = lineEdits[li.id]
        const qCur = draft?.quantity_current ?? li.quantity_current
        return {
          id: li.id,
          label: li.label,
          quantity_current: qCur,
          gantt_suggested_percent: li.gantt_suggested_percent,
          contract_line_item_id: li.contract_line_item_id,
          contract_milestone_id: li.contract_milestone_id,
        }
      }),
      initial.ganttTasksForSync
    )
    setLineEdits((prev) => {
      const next = { ...prev }
      for (const row of rows) {
        if (row.ganttPercent == null) continue
        const li = pa.lines.find((l) => l.id === row.lineId)
        if (!li) continue
        const cur = next[row.lineId] ?? {
          quantity_previous: li.quantity_previous,
          quantity_current: li.quantity_current,
        }
        next[row.lineId] = {
          ...cur,
          quantity_current: row.ganttPercent,
        }
      }
      return next
    })
    toast.message(
      "סונכרנו אחוזי נוכחי מהגאנט לטיוטה — ניתן לערוך ידנית ואז ״חישוב מצטבר״"
    )
  }

  function billingLineContextActions(
    partialId: string,
    line: ContractBillingInitial["partialAccounts"][number]["lines"][number],
    edit: { quantity_previous: number; quantity_current: number }
  ): SmartContextMenuAction[] {
    return [
      {
        id: "dup",
        label: "שכפול פרטי שורה",
        icon: contextMenuIcons.duplicate,
        onSelect: () => {
          const text = [
            line.label,
            `קודם %: ${edit.quantity_previous}`,
            `נוכחי %: ${edit.quantity_current}`,
            `שורה ${line.id}`,
            `חשבון ${partialId}`,
          ].join("\n")
          void navigator.clipboard.writeText(text).then(() => {
            toast.success("הועתק ללוח")
          })
        },
      },
      {
        id: "ai",
        label: "סנכרון AI",
        icon: contextMenuIcons.aiSync,
        onSelect: () => {
          router.push(
            `/chat?context=billing&line=${encodeURIComponent(line.id)}`
          )
        },
      },
      {
        id: "del",
        label: "מחיקה",
        icon: contextMenuIcons.delete,
        destructive: true,
        onSelect: () => {
          toast.message("מחיקת שורת חיוב", {
            description: "יושם דרך ניהול חוזה בגרסה הבאה.",
          })
        },
      },
    ]
  }

  async function handleRecalc(partialId: string, nextStatus?: MoPartialAccountStatus) {
    const pa = initial.partialAccounts.find((p) => p.id === partialId)
    const linePatches =
      pa?.lines.map((li) => {
        const e = lineEdits[li.id] ?? {
          quantity_previous: li.quantity_previous,
          quantity_current: li.quantity_current,
        }
        return {
          id: li.id,
          quantity_previous: e.quantity_previous,
          quantity_current: e.quantity_current,
        }
      }) ?? []

    setBusyId(partialId)
    try {
      const res = await calculatePartialAccount({
        partialAccountId: partialId,
        linePatches: linePatches.length > 0 ? linePatches : undefined,
        nextStatus: nextStatus ?? null,
      })
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      toast.success("החשבון חולק מחדש בהצלחה")
      window.location.reload()
    } catch (e) {
      toast.error(formatError(e))
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div
      className="min-h-[calc(100vh-4rem)] bg-[#FFFFFF] px-4 py-8 md:px-8"
      dir="rtl"
    >
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-8">
        <SmartTableContextMenuPortal
          open={billingCtx != null}
          x={billingCtx?.x ?? 0}
          y={billingCtx?.y ?? 0}
          onClose={() => setBillingCtx(null)}
          actions={
            billingCtx
              ? billingLineContextActions(
                  billingCtx.partialId,
                  billingCtx.line,
                  lineEdits[billingCtx.line.id] ?? {
                    quantity_previous: billingCtx.line.quantity_previous,
                    quantity_current: billingCtx.line.quantity_current,
                  }
                )
              : []
          }
          navItems={[
            {
              label: "לו״ז (גאנט)",
              href: `/marker-ofek/execution/gantt/${initial.projectId}`,
            },
          ]}
        />
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
              מרכז חוזים וחיוב
            </p>
            <h1 className="text-2xl font-bold tracking-tight text-[#1e293b]">
              {initial.projectName}
            </h1>
            <p className="text-sm text-slate-500">
              קוד:{" "}
              <span className="font-mono text-xs text-slate-600">
                {initial.internalCode}
              </span>{" "}
              · {initial.contractLabel}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {initial.newAccountBaseline ? (
              <button
                type="button"
                onClick={() => setCreateOpen(true)}
                className={cn(
                  buttonVariants({ variant: "default", size: "default" }),
                  "gap-2 border border-indigo-600 bg-indigo-600 text-white hover:bg-indigo-700"
                )}
              >
                <Plus className="size-4" aria-hidden />
                חשבון חלקי חדש
              </button>
            ) : null}
            <Link
              href={`/marker-ofek/contracts/${initial.contractId}`}
              className={cn(
                buttonVariants({ variant: "outline", size: "default" }),
                "border-slate-200 text-[#1e293b] hover:bg-slate-50"
              )}
            >
              פתיחת כרטיס חוזה
            </Link>
          </div>
        </div>

        {initial.newAccountBaseline ? (
          <CreateAccountDialog
            open={createOpen}
            onOpenChange={setCreateOpen}
            initial={initial}
          />
        ) : null}

        {showSyncDialog ? (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm"
            role="dialog"
            aria-modal="true"
            aria-labelledby="sync-dialog-title"
            onClick={closeSyncDialog}
          >
            <div
              className="max-h-[min(90vh,720px)] w-full max-w-2xl overflow-hidden rounded-xl border border-slate-100 bg-[#FFFFFF] shadow-lg"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between gap-3 border-b border-slate-100 bg-[#FFFFFF] p-4">
                <div className="flex items-center gap-2">
                  <GitCompareArrows
                    className="size-4 shrink-0 text-indigo-600"
                    aria-hidden
                  />
                  <h3
                    id="sync-dialog-title"
                    className="text-sm font-semibold text-[#1e293b]"
                  >
                    סנכרון נתוני ביצוע מהגאנט
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={closeSyncDialog}
                  className="text-slate-400 transition-colors hover:text-slate-600"
                  aria-label="סגירה"
                >
                  <X size={18} />
                </button>
              </div>

              <p className="border-b border-slate-100 px-4 pb-3 text-start text-xs text-slate-500">
                השוואה לפי קישור כתב כמויות (מק״ט) לגאנט; אם אין הצעה — התאמת שם יחידה.
                חיוב נוכחי משקף את <strong>הטיוטה</strong> בעמודת ״נוכחי %״.
              </p>

              <div className="max-h-[50vh] overflow-y-auto p-0">
                {syncRows.length === 0 ? (
                  <p className="py-8 text-center text-sm text-slate-500">
                    אין שורות
                  </p>
                ) : (
                  <table className="w-full border-collapse text-right">
                    <thead className="sticky top-0 z-[1] border-b border-slate-100 bg-slate-50/95 text-[11px] font-medium text-slate-500 backdrop-blur-sm">
                      <tr>
                        <th className="p-3 text-start">סעיף חוזה</th>
                        <th className="p-3 text-center font-currency-mono">
                          התקדמות גנט %
                        </th>
                        <th className="p-3 text-center font-currency-mono">
                          חיוב נוכחי %
                        </th>
                        <th className="p-3 text-center font-currency-mono">
                          פער
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-[13px]">
                      {syncRows.map((row) => (
                        <tr
                          key={row.lineId}
                          className="transition-colors hover:bg-slate-50/80"
                        >
                          <td className="p-3 font-medium text-slate-800">
                            {row.label}
                          </td>
                          <td className="bg-indigo-50/40 p-3 text-center font-currency-mono text-sm tabular-nums text-indigo-700">
                            {row.ganttPercent != null
                              ? `${row.ganttPercent.toFixed(2)}%`
                              : "—"}
                          </td>
                          <td className="p-3 text-center font-currency-mono text-sm tabular-nums text-slate-700">
                            {row.billingPercent.toFixed(2)}%
                          </td>
                          <td
                            className={cn(
                              "p-3 text-center font-currency-mono text-sm tabular-nums",
                              row.gap == null
                                ? "text-slate-400"
                                : gapExceedsAlertThreshold(row.gap)
                                  ? "font-semibold text-amber-600"
                                  : "text-slate-600"
                            )}
                          >
                            {row.gap == null
                              ? "—"
                              : row.gap > 0
                                ? `+${row.gap.toFixed(2)}%`
                                : `${row.gap.toFixed(2)}%`}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              <div className="flex flex-col gap-2 border-t border-slate-100 bg-[#FFFFFF] px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <button
                    type="button"
                    disabled={!syncPartialId || syncRows.length === 0}
                    onClick={() => {
                      if (syncPartialId) applyBridgeSyncToDraft(syncPartialId)
                    }}
                    className={cn(
                      buttonVariants({ variant: "outline", size: "sm" }),
                      "border-indigo-200 font-medium text-indigo-800 hover:bg-indigo-50"
                    )}
                  >
                    סנכרון הכל לטיוטה
                  </button>
                  <p className="max-w-md text-[11px] leading-snug text-slate-500">
                    ממלא את עמודת ״נוכחי %״ בערכי הגנט (כולל התאמת שם כשאין קישור
                    כמות). אפשר לערוך ידנית לפני ״חישוב מצטבר״ או ״אישור ועדכון
                    חשבון״.
                  </p>
                </div>
              </div>

              <div className="flex justify-end gap-3 border-t border-slate-100 bg-slate-50/40 p-4">
                <button
                  type="button"
                  onClick={closeSyncDialog}
                  className="rounded-md px-4 py-2 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-100"
                >
                  ביטול
                </button>
                <button
                  type="button"
                  disabled={busyId === syncPartialId || syncRows.length === 0}
                  onClick={() => void confirmSyncApplyToAccount()}
                  className="rounded-md bg-indigo-600 px-4 py-2 text-xs font-medium text-white shadow-sm transition-all hover:bg-indigo-700 disabled:pointer-events-none disabled:opacity-50"
                >
                  {busyId === syncPartialId ? "מעדכן…" : "אישור ועדכון חשבון"}
                </button>
              </div>
            </div>
          </div>
        ) : null}

        <section
          className="grid gap-3 rounded-xl border border-slate-100 bg-[#FFFFFF] p-4 sm:grid-cols-2 lg:grid-cols-5"
          aria-label="סיכום חוזה"
        >
          <SummaryCell
            label="סה״כ חוזה"
            value={
              totalContract != null
                ? currencyFormatter.format(totalContract)
                : "—"
            }
          />
          <SummaryCell
            label="מוכר מחשבוניות (מאושר/שולם)"
            value={currencyFormatter.format(initial.recognizedFromInvoices)}
          />
          <SummaryCell
            label="מוכר מחשבונות חלקיים מאושרים"
            value={currencyFormatter.format(initial.recognizedFromApprovedPartials)}
            hint="ללא כפל כאשר קיימת חשבונית מקושרת"
          />
          <SummaryCell
            label="סה״כ מוכר (הכנסה מוכרת)"
            value={currencyFormatter.format(recognized)}
            hint="מתאים לשורת ההכנסה בדשבורד שותפים"
          />
          <SummaryCell
            label="יתרה בחוזה"
            value={
              remaining != null ? currencyFormatter.format(remaining) : "—"
            }
            emphasize
          />
        </section>

        <ContractInvoicingProgressBar
          totalContract={totalContract}
          totalRecognized={recognized}
          percent={invoicedPctOfContract}
          ganttPercent={initial.contractGanttProgress}
          showGanttHint={ganttModuleEnabled}
        />

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-[#1e293b]">
            חשבונות חלקיים ושורות חיוב
          </h2>
          {initial.partialAccounts.length === 0 ? (
            <p className="rounded-xl border border-slate-100 bg-slate-50/50 px-4 py-8 text-center text-sm text-slate-500">
              אין עדיין חשבונות חלקיים לחוזה זה. ניתן ליצור מתוך כרטיס החוזה.
            </p>
          ) : (
            <div className="space-y-6">
              {initial.partialAccounts.map((pa) => {
                const gapInputs = pa.lines.map((li) =>
                  toRevenueGapLineInput(li, lineEdits)
                )
                const ribbon = summarizeDualGapRibbon(
                  gapInputs,
                  initial.ganttTasksForSync
                )
                const exceptionsOnly =
                  gapHunterEnabled && showExceptionsOnly[pa.id] === true
                const displayLines = exceptionsOnly
                  ? pa.lines.filter((li) =>
                      getLineDualGapInfo(
                        toRevenueGapLineInput(li, lineEdits),
                        initial.ganttTasksForSync
                      ).isException
                    )
                  : pa.lines

                return (
                <div
                  key={pa.id}
                  className="overflow-hidden rounded-xl border border-slate-100 bg-[#FFFFFF]"
                >
                  <div className="flex flex-col gap-3 border-b border-slate-100 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <p className="text-sm font-medium text-[#1e293b]">
                          חשבון חלקי מס׳ {pa.account_number}
                        </p>
                        <Link
                          href={`/marker-ofek/finance/contracts/billing/${pa.id}`}
                          className="text-xs font-medium text-indigo-600 underline-offset-2 hover:underline"
                        >
                          לוח חיוב מורחב
                        </Link>
                      </div>
                      <p className="text-xs text-slate-500">
                        {STATUS_LABELS[pa.status]} ·{" "}
                        <span className="font-currency-mono tabular-nums">
                          חיוב תקופתי (לתשלום):{" "}
                          {currencyFormatter.format(pa.payment_due)}
                        </span>
                        {pa.current_progress_percent != null &&
                        Number.isFinite(pa.current_progress_percent) ? (
                          <>
                            {" "}
                            · התקדמות בחוזה אחרי חשבון:{" "}
                            <span className="font-currency-mono tabular-nums">
                              {pa.current_progress_percent.toFixed(2)}%
                            </span>
                          </>
                        ) : null}
                      </p>
                      <p className="text-[11px] leading-snug text-slate-400">
                        עבודת תקופה מחושבת מהפרש אחוזים בין קודם לנוכחי בכל שורה; סכום לתשלום
                        לאחר ניכוי עכבון וביטוח על עבודת התקופה בלבד.
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {gapHunterEnabled ? (
                        <button
                          type="button"
                          aria-pressed={exceptionsOnly}
                          onClick={() =>
                            setShowExceptionsOnly((prev) => ({
                              ...prev,
                              [pa.id]: !prev[pa.id],
                            }))
                          }
                          className={cn(
                            buttonVariants({ variant: "outline", size: "sm" }),
                            "gap-2 border-slate-200",
                            exceptionsOnly
                              ? "border-slate-400 bg-slate-100/80 text-[#1e293b]"
                              : "text-slate-700 hover:bg-slate-50"
                          )}
                        >
                          הצג חריגים בלבד
                        </button>
                      ) : null}
                      {ganttModuleEnabled ? (
                        <button
                          type="button"
                          onClick={() => openSyncDialog(pa.id)}
                          className={cn(
                            buttonVariants({ variant: "outline", size: "sm" }),
                            "gap-2 border-slate-200 text-slate-800 hover:bg-slate-50"
                          )}
                        >
                          <GitCompareArrows className="size-4" aria-hidden />
                          סנכרון נתוני ביצוע מהגאנט
                        </button>
                      ) : null}
                      <button
                        type="button"
                        disabled={busyId === pa.id}
                        onClick={() => void handleRecalc(pa.id)}
                        className={cn(
                          buttonVariants({ variant: "outline", size: "sm" }),
                          "gap-2 border-indigo-200 text-indigo-700 hover:bg-indigo-50"
                        )}
                      >
                        {busyId === pa.id ? (
                          <Loader2 className="size-4 animate-spin" aria-hidden />
                        ) : (
                          <RefreshCw className="size-4" aria-hidden />
                        )}
                        חישוב מצטבר
                      </button>
                    </div>
                  </div>
                  {gapHunterEnabled ? (
                    <div
                      className="border-b border-slate-100 bg-slate-50/30 px-4 py-3"
                      aria-label="פערי ביצוע מול חיוב — לוח בקרה"
                    >
                      <div className="grid gap-2 sm:grid-cols-2">
                        <div className="flex min-w-0 items-start gap-2.5 rounded-xl border border-amber-200/90 bg-amber-50/40 px-3 py-2.5">
                          <TrendingUp
                            className="mt-0.5 size-4 shrink-0 text-amber-600"
                            aria-hidden
                          />
                          <div className="min-w-0">
                            <p className="text-[11px] font-medium text-amber-950/90">
                              ביצוע שלא חויב
                            </p>
                            <p className="font-currency-mono text-base font-semibold tabular-nums text-amber-950">
                              {currencyFormatter.format(
                                ribbon.totalUnbilledRevenueIls
                              )}
                            </p>
                            <p className="text-[10px] text-amber-900/70">
                              {ribbon.revenueExceptionCount} שורות · פער &gt; 10
                              נק׳
                            </p>
                          </div>
                        </div>
                        <div className="flex min-w-0 items-start gap-2.5 rounded-xl border border-rose-200/90 bg-rose-50/40 px-3 py-2.5">
                          <AlertTriangle
                            className="mt-0.5 size-4 shrink-0 text-rose-600"
                            aria-hidden
                          />
                          <div className="min-w-0">
                            <p className="text-[11px] font-medium text-rose-950/90">
                              חשיפת חיוב (מעל ביצוע)
                            </p>
                            <p className="font-currency-mono text-base font-semibold tabular-nums text-rose-950">
                              {currencyFormatter.format(
                                ribbon.totalBillingExposureIls
                              )}
                            </p>
                            <p className="text-[10px] text-rose-900/70">
                              {ribbon.riskExceptionCount} שורות · פער &gt; 5 נק׳
                            </p>
                          </div>
                        </div>
                      </div>
                      <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
                        <button
                          type="button"
                          disabled={pdfPartialId === pa.id}
                          onClick={() => {
                            void (async () => {
                              setPdfPartialId(pa.id)
                              try {
                                await downloadGapHunterPdfReport({
                                  projectName: initial.projectName,
                                  internalCode: initial.internalCode,
                                  partialAccountNumber: pa.account_number,
                                  totalContract: initial.totalContract,
                                  totalRecognized: initial.totalRecognized,
                                  lines: pa.lines,
                                  lineEdits,
                                  ganttTasksForSync: initial.ganttTasksForSync,
                                })
                                toast.success("דוח PDF הורד")
                              } catch (e) {
                                toast.error(formatError(e))
                              } finally {
                                setPdfPartialId(null)
                              }
                            })()
                          }}
                          className={cn(
                            buttonVariants({ variant: "outline", size: "sm" }),
                            "gap-2 border-indigo-200 bg-white text-indigo-800 hover:bg-indigo-50 disabled:opacity-50"
                          )}
                        >
                          {pdfPartialId === pa.id ? (
                            <Loader2 className="size-4 animate-spin" aria-hidden />
                          ) : (
                            <FileDown className="size-4" aria-hidden />
                          )}
                          Download PDF Report
                        </button>
                      </div>
                    </div>
                  ) : null}
                  <div className="grid gap-0 lg:grid-cols-[1fr,minmax(15.5rem,18rem)]">
                    <div className="min-w-0 overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-slate-100 hover:bg-transparent">
                        <TableHead className="min-w-[12rem] text-indigo-900">
                          שורה / סעיף
                        </TableHead>
                        <TableHead className="text-end font-currency-mono text-indigo-900">
                          קודם %
                        </TableHead>
                        <TableHead className="text-end font-currency-mono text-indigo-900">
                          נוכחי %
                        </TableHead>
                        <TableHead className="text-end font-currency-mono text-indigo-900">
                          מצטבר %
                        </TableHead>
                        <TableHead className="text-end font-currency-mono text-indigo-900">
                          סכום מצטבר ₪
                        </TableHead>
                        <TableHead className="text-end font-currency-mono text-indigo-900">
                          תקופה ₪
                        </TableHead>
                        {ganttModuleEnabled ? (
                          <TableHead className="text-end font-currency-mono text-indigo-900">
                            הצעת גנט %
                          </TableHead>
                        ) : null}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pa.lines.length === 0 ? (
                        <TableRow className="border-slate-100">
                          <TableCell
                            colSpan={tableColSpan}
                            className="text-center text-sm text-slate-500"
                          >
                            אין שורות מפורטות
                          </TableCell>
                        </TableRow>
                      ) : displayLines.length === 0 ? (
                        <TableRow className="border-slate-100">
                          <TableCell
                            colSpan={tableColSpan}
                            className="text-center text-sm text-slate-500"
                          >
                            אין חריגים (פער הכנסה &gt;10% או חשיפת חיוב &gt;5%)
                          </TableCell>
                        </TableRow>
                      ) : (
                        displayLines.map((li) => {
                          const edit = lineEdits[li.id] ?? {
                            quantity_previous: li.quantity_previous,
                            quantity_current: li.quantity_current,
                          }
                          const base = li.line_base_amount
                          const qPrev = Math.min(
                            100,
                            Math.max(0, Number(edit.quantity_previous) || 0)
                          )
                          const qCur = Math.min(
                            100,
                            Math.max(0, Number(edit.quantity_current) || 0)
                          )
                          const cumulativePreview = roundMoney((qCur / 100) * base)
                          const periodPreview = roundMoney(
                            (Math.max(0, qCur - qPrev) / 100) * base
                          )
                          const gapLine = toRevenueGapLineInput(li, lineEdits)
                          const dual = getLineDualGapInfo(
                            gapLine,
                            initial.ganttTasksForSync
                          )
                          return (
                            <TableRow
                              key={li.id}
                              className={cn(
                                "border-slate-100 align-top",
                                gapHunterEnabled &&
                                  dual.kind === "revenue" &&
                                  "border-l-4 border-l-amber-400 bg-amber-50/40",
                                gapHunterEnabled &&
                                  dual.kind === "risk" &&
                                  "border-l-4 border-l-rose-400 bg-rose-50/40"
                              )}
                              onContextMenu={(e) => {
                                e.preventDefault()
                                setBillingCtx({
                                  x: e.clientX,
                                  y: e.clientY,
                                  partialId: pa.id,
                                  line: li,
                                })
                              }}
                            >
                              <TableCell className="max-w-[17rem] text-indigo-950">
                                <div className="space-y-2">
                                  {!gapHunterEnabled ? (
                                    <p className="text-sm leading-snug">
                                      {li.label}
                                    </p>
                                  ) : dual.kind === "revenue" &&
                                  dual.fieldPercent != null ? (
                                    <Tooltip>
                                      <TooltipTrigger
                                        type="button"
                                        className="block w-full cursor-help rounded-md text-start outline-none"
                                      >
                                        <p className="text-sm leading-snug">
                                          {li.label}
                                        </p>
                                      </TooltipTrigger>
                                      <TooltipContent
                                        side="top"
                                        className="max-w-xs text-xs"
                                      >
                                        בגאנט {dual.fieldPercent.toFixed(1)}%
                                        לעומת {dual.billedPercent.toFixed(1)}%
                                        חויב — פער ביצוע מול חיוב. הערכת הכנסה
                                        שלא חויבה:{" "}
                                        <span className="font-currency-mono tabular-nums">
                                          {currencyFormatter.format(
                                            dual.unbilledRevenueIls
                                          )}
                                        </span>
                                      </TooltipContent>
                                    </Tooltip>
                                  ) : dual.kind === "risk" &&
                                    dual.fieldPercent != null ? (
                                    <Tooltip>
                                      <TooltipTrigger
                                        type="button"
                                        className="block w-full cursor-help rounded-md text-start outline-none"
                                      >
                                        <p className="text-sm leading-snug">
                                          {li.label}
                                        </p>
                                      </TooltipTrigger>
                                      <TooltipContent
                                        side="top"
                                        className="max-w-xs text-xs"
                                      >
                                        חויב {dual.billedPercent.toFixed(1)}%
                                        לעומת {dual.fieldPercent.toFixed(1)}% בגאנט
                                        — סיכון לדחיית אחוז. חשיפה מוערכת:{" "}
                                        <span className="font-currency-mono tabular-nums">
                                          {currencyFormatter.format(
                                            dual.billingExposureIls
                                          )}
                                        </span>
                                      </TooltipContent>
                                    </Tooltip>
                                  ) : (
                                    <p className="text-sm leading-snug">
                                      {li.label}
                                    </p>
                                  )}
                                  {ganttModuleEnabled ? (
                                    <SyncProgressBar
                                      fieldPercent={resolveFieldPercentForPartialLine(
                                        {
                                          label: li.label,
                                          gantt_suggested_percent:
                                            li.gantt_suggested_percent,
                                        },
                                        initial.ganttTasksForSync
                                      )}
                                      billedPercent={qCur}
                                    />
                                  ) : null}
                                </div>
                              </TableCell>
                              <TableCell className="w-[7rem] text-end">
                                <Input
                                  type="number"
                                  step="0.01"
                                  min={0}
                                  max={100}
                                  className="h-8 font-currency-mono text-end text-sm tabular-nums"
                                  value={Number.isFinite(edit.quantity_previous) ? edit.quantity_previous : ""}
                                  onChange={(e) => {
                                    const v = parseFloat(e.target.value)
                                    setLineEdits((prev) => {
                                      const cur = prev[li.id] ?? {
                                        quantity_previous: li.quantity_previous,
                                        quantity_current: li.quantity_current,
                                      }
                                      return {
                                        ...prev,
                                        [li.id]: {
                                          ...cur,
                                          quantity_previous: Number.isFinite(v)
                                            ? v
                                            : 0,
                                        },
                                      }
                                    })
                                  }}
                                  aria-label={`קודם — ${li.label}`}
                                />
                              </TableCell>
                              <TableCell className="w-[7rem] text-end">
                                <Input
                                  type="number"
                                  step="0.01"
                                  min={0}
                                  max={100}
                                  className="h-8 font-currency-mono text-end text-sm tabular-nums"
                                  value={Number.isFinite(edit.quantity_current) ? edit.quantity_current : ""}
                                  onChange={(e) => {
                                    const v = parseFloat(e.target.value)
                                    setLineEdits((prev) => {
                                      const cur = prev[li.id] ?? {
                                        quantity_previous: li.quantity_previous,
                                        quantity_current: li.quantity_current,
                                      }
                                      return {
                                        ...prev,
                                        [li.id]: {
                                          ...cur,
                                          quantity_current: Number.isFinite(v)
                                            ? v
                                            : 0,
                                        },
                                      }
                                    })
                                  }}
                                  aria-label={`נוכחי — ${li.label}`}
                                />
                              </TableCell>
                              <TableCell className="text-end font-currency-mono text-sm tabular-nums text-slate-700">
                                {qCur.toFixed(2)}%
                              </TableCell>
                              <TableCell className="text-end font-currency-mono text-sm tabular-nums text-[#1e293b]">
                                {currencyFormatter.format(cumulativePreview)}
                              </TableCell>
                              <TableCell className="text-end font-currency-mono text-sm tabular-nums text-slate-600">
                                {currencyFormatter.format(periodPreview)}
                              </TableCell>
                              {ganttModuleEnabled ? (
                                <TableCell className="text-end font-currency-mono text-sm tabular-nums text-slate-500">
                                  {li.gantt_suggested_percent != null ? (
                                    <button
                                      type="button"
                                      className="text-indigo-600 underline-offset-2 hover:underline"
                                      onClick={() => {
                                        const p = li.gantt_suggested_percent
                                        if (p == null) return
                                        setLineEdits((prev) => {
                                          const cur = prev[li.id] ?? {
                                            quantity_previous:
                                              li.quantity_previous,
                                            quantity_current:
                                              li.quantity_current,
                                          }
                                          return {
                                            ...prev,
                                            [li.id]: {
                                              ...cur,
                                              quantity_current: p,
                                            },
                                          }
                                        })
                                      }}
                                    >
                                      {li.gantt_suggested_percent.toFixed(0)}%
                                    </button>
                                  ) : (
                                    "—"
                                  )}
                                </TableCell>
                              ) : null}
                            </TableRow>
                          )
                        })
                      )}
                    </TableBody>
                  </Table>
                    </div>
                    <aside
                      className="border-t border-slate-100 bg-slate-50/50 p-4 lg:border-s lg:border-t-0 lg:border-slate-100"
                      aria-label="סיכום כספי לחשבון חלקי"
                    >
                      <PartialFinancialSummarySidebar
                        paymentDue={pa.payment_due}
                        periodWorkGross={pa.period_work_gross}
                        indexationAdjustment={pa.indexation_adjustment_amount}
                        retainageAmount={pa.retainage_amount}
                        formatMoney={(n) => currencyFormatter.format(n)}
                      />
                    </aside>
                  </div>
                </div>
                )
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

function PartialFinancialSummarySidebar({
  periodWorkGross,
  indexationAdjustment,
  retainageAmount,
  paymentDue,
  formatMoney,
}: {
  periodWorkGross: number
  indexationAdjustment: number
  retainageAmount: number
  paymentDue: number
  formatMoney: (n: number) => string
}) {
  const idx = Number(indexationAdjustment) || 0
  const idxCls =
    idx > 0
      ? "text-emerald-700"
      : idx < 0
        ? "text-rose-700"
        : "text-slate-600"
  const retain = Math.max(0, Number(retainageAmount) || 0)
  return (
    <div className="space-y-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-indigo-700">
        סיכום כספי
      </p>
      <ul className="space-y-3 text-sm">
        <li className="space-y-0.5">
          <p className="text-xs font-medium text-slate-500">סה״כ ביצוע (ברוטו)</p>
          <p className="font-currency-mono text-base font-semibold tabular-nums text-[#1e293b]">
            {formatMoney(Math.max(0, periodWorkGross))}
          </p>
        </li>
        <li className="space-y-0.5">
          <p className="text-xs font-medium text-slate-500">הפרשי הצמדה</p>
          <p
            className={cn(
              "font-currency-mono text-base font-semibold tabular-nums",
              idxCls
            )}
          >
            {idx >= 0 ? "+" : "−"}
            {formatMoney(Math.abs(idx))}
          </p>
        </li>
        <li className="space-y-0.5">
          <p className="text-xs font-medium text-slate-500">עכבון לביצוע</p>
          <p className="font-currency-mono text-base font-semibold tabular-nums text-rose-600">
            −{formatMoney(retain)}
          </p>
        </li>
        <li className="border-t border-slate-200 pt-3 space-y-0.5">
          <p className="text-xs font-semibold text-indigo-800">
            סה״כ לתשלום בחשבון
          </p>
          <p className="font-currency-mono text-lg font-bold tabular-nums text-indigo-700">
            {formatMoney(Math.max(0, paymentDue))}
          </p>
          <p className="text-[10px] leading-tight text-slate-400">
            נטו לאחר הצמדה וניכוי עכבון, ביטוח ואגרות על התקופה (לפי חישוב אחרון).
          </p>
        </li>
      </ul>
    </div>
  )
}

function ContractInvoicingProgressBar({
  totalContract,
  totalRecognized,
  percent,
  ganttPercent,
  showGanttHint = true,
}: {
  totalContract: number | null
  totalRecognized: number
  percent: number | null
  ganttPercent: number | null
  showGanttHint?: boolean
}) {
  const pct =
    percent != null && Number.isFinite(percent)
      ? Math.min(100, Math.max(0, percent))
      : 0
  return (
    <div
      className="space-y-2 rounded-xl border border-slate-100 bg-[#FFFFFF] p-4"
      aria-label="התקדמות גבייה מהחוזה"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-[#1e293b]">
          התקדמות גבייה מהחוזה
        </p>
        <p className="font-currency-mono text-sm tabular-nums text-slate-600">
          {totalContract != null ? (
            <>
              {currencyFormatter.format(totalRecognized)} {" / "}
              {currencyFormatter.format(totalContract)}
              {percent != null ? (
                <span className="text-indigo-600"> ({pct.toFixed(1)}%)</span>
              ) : null}
            </>
          ) : (
            "—"
          )}
        </p>
      </div>
      <div className="h-3 w-full overflow-hidden rounded-full border border-slate-100 bg-slate-50">
        <div
          className="h-full rounded-full bg-indigo-600 transition-[width] duration-300"
          style={{ width: `${pct}%` }}
          role="progressbar"
          aria-valuenow={Math.round(pct)}
          aria-valuemin={0}
          aria-valuemax={100}
        />
      </div>
      {showGanttHint && ganttPercent != null ? (
        <p className="text-[10px] text-slate-400">
          להשוואת ביצוע: התקדמות בגנט {ganttPercent.toFixed(0)}% (אינה הכנסה מוכרת
          עד להפקת חשבונית / אישור חשבון חלקי)
        </p>
      ) : null}
    </div>
  )
}

function SummaryCell({
  label,
  value,
  emphasize,
  hint,
}: {
  label: string
  value: string
  emphasize?: boolean
  hint?: string
}) {
  return (
    <div
      className={cn(
        "rounded-lg border border-slate-100 px-3 py-2",
        emphasize && "border-indigo-100 bg-indigo-50/40"
      )}
    >
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p
        className={cn(
          "font-currency-mono text-lg font-semibold tabular-nums tracking-tight text-[#1e293b]",
          emphasize && "text-indigo-900"
        )}
      >
        {value}
      </p>
      {hint ? (
        <p className="mt-0.5 text-[10px] leading-tight text-slate-400">{hint}</p>
      ) : null}
    </div>
  )
}

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100
}
