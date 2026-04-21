"use client"

import type { PlanWbsDiscrepancyRow } from "@/lib/marker-ofek/ai/projects/plan-vs-wbs-discrepancy"
import type { InvoicePoDeviationLine } from "@/lib/marker-ofek/ai/procurement/invoice-po-deviations"
import { cn } from "@/lib/utils"

function severityShell(severity: PlanWbsDiscrepancyRow["severity"]) {
  switch (severity) {
    case "critical":
      return "border-red-200 bg-red-50/80"
    case "warn":
      return "border-amber-200 bg-amber-50/60"
    case "info":
      return "border-sky-200 bg-sky-50/50"
    default:
      return "border-slate-100 bg-card"
  }
}

function invoiceSeverityShell(
  row: InvoicePoDeviationLine
): string {
  const sevs = [
    row.quantity_severity,
    row.unit_price_severity,
    row.line_total_severity,
  ]
  if (sevs.includes("critical")) return "border-red-200 bg-red-50/80"
  if (sevs.includes("warn")) return "border-amber-200 bg-amber-50/60"
  if (!row.best_match) return "border-violet-200 bg-violet-50/40"
  if (sevs.includes("info")) return "border-sky-200 bg-sky-50/40"
  return "border-slate-100 bg-card"
}

export function AiPlanWbsSummaryGrid({
  rows,
  className,
}: {
  rows: PlanWbsDiscrepancyRow[]
  className?: string
}) {
  if (rows.length === 0) {
    return (
      <p className="rounded-xl border border-slate-100 bg-card px-4 py-6 text-center text-sm text-slate-500">
        אין שורות דוח להצגה
      </p>
    )
  }

  return (
    <ul
      className={cn("grid gap-3 sm:grid-cols-2 lg:grid-cols-3", className)}
      dir="rtl"
    >
      {rows.map((r, i) => (
        <li
          key={`${r.wbs_node_id ?? "u"}-${r.plan_item_name}-${i}`}
          className={cn(
            "rounded-xl border p-4 shadow-sm transition-shadow hover:shadow-md",
            severityShell(r.severity)
          )}
        >
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            {r.wbs_code ? `WBS ${r.wbs_code}` : "התאמה תוכנית"}
          </p>
          <p className="mt-1 text-sm font-semibold text-[#1e293b]">
            {r.plan_item_name}
          </p>
          {r.wbs_label ? (
            <p className="mt-0.5 text-xs text-slate-500">{r.wbs_label}</p>
          ) : null}
          <p className="mt-3 font-currency-mono text-sm tabular-nums text-[#1e293b]">
            {r.summary_he}
          </p>
          {r.gap != null && Number.isFinite(r.gap) ? (
            <p className="mt-2 font-currency-mono text-xs tabular-nums text-slate-600">
              פער מספרי:{" "}
              <span className="font-semibold">
                {r.gap > 0 ? "+" : ""}
                {r.gap}
              </span>
            </p>
          ) : null}
        </li>
      ))}
    </ul>
  )
}

function fmtNum(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—"
  return String(n)
}

export function AiInvoicePoSummaryGrid({
  rows,
  className,
}: {
  rows: InvoicePoDeviationLine[]
  className?: string
}) {
  if (rows.length === 0) {
    return (
      <p className="rounded-xl border border-slate-100 bg-card px-4 py-6 text-center text-sm text-slate-500">
        אין שורות חשבונית להצגה
      </p>
    )
  }

  return (
    <ul className={cn("grid gap-3", className)} dir="rtl">
      {rows.map((r, i) => (
        <li
          key={`${r.invoice_line.line_no}-${i}`}
          className={cn(
            "rounded-xl border p-4 shadow-sm transition-shadow hover:shadow-md",
            invoiceSeverityShell(r)
          )}
        >
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="font-currency-mono text-xs text-slate-500">
                שורה {r.invoice_line.line_no}
              </p>
              <p className="mt-0.5 text-sm font-semibold text-[#1e293b]">
                {r.invoice_line.description}
              </p>
            </div>
            {r.best_match ? (
              <p className="shrink-0 rounded-md border border-slate-100 bg-card px-2 py-1 font-currency-mono text-xs text-slate-600">
                הזמנה {r.best_match.po_number}
              </p>
            ) : null}
          </div>
          <p className="mt-3 text-sm text-slate-700">{r.finding_he}</p>
          {r.best_match ? (
            <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 font-currency-mono text-xs tabular-nums text-slate-600 sm:grid-cols-4">
              <div>
                <dt className="text-slate-400">כמות חשבונית</dt>
                <dd>{fmtNum(r.invoice_line.quantity)}</dd>
              </div>
              <div>
                <dt className="text-slate-400">כמות הזמנה</dt>
                <dd>{fmtNum(r.best_match.quantity)}</dd>
              </div>
              <div>
                <dt className="text-slate-400">מחיר יח׳ חשבונית</dt>
                <dd>{fmtNum(r.invoice_line.unit_price)}</dd>
              </div>
              <div>
                <dt className="text-slate-400">מחיר יח׳ הזמנה</dt>
                <dd>{fmtNum(r.best_match.unit_price)}</dd>
              </div>
            </dl>
          ) : null}
        </li>
      ))}
    </ul>
  )
}

/** כרטיסי KPI קומפקטיים — מעל רשתות הפירוט */
export function AiComparisonKpiStrip({
  items,
  className,
}: {
  items: { label: string; value: string; hint?: string }[]
  className?: string
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap gap-3 rounded-2xl border border-slate-100 bg-card p-4 shadow-sm",
        className
      )}
      dir="rtl"
    >
      {items.map((it) => (
        <div
          key={it.label}
          className="min-w-[8rem] flex-1 rounded-xl border border-slate-100 bg-background/40 px-4 py-3"
        >
          <p className="text-xs font-medium text-slate-500">{it.label}</p>
          <p className="font-currency-mono mt-1 text-lg font-semibold tabular-nums text-[#1e293b]">
            {it.value}
          </p>
          {it.hint ? (
            <p className="mt-0.5 text-[11px] text-slate-400">{it.hint}</p>
          ) : null}
        </div>
      ))}
    </div>
  )
}
