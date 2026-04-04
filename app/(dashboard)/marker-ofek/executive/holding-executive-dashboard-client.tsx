"use client"

import Link from "next/link"
import { Building2 } from "lucide-react"

import { useOrganizationBranding } from "@/components/organization-branding-context"
import type {
  ExecutiveProjectHealth,
  HoldingExecutivePayload,
} from "@/lib/marker-ofek/partner-metrics-actions"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { cn } from "@/lib/utils"

const ils = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 0,
})

const ilsFull = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
})

function RibbonCard({
  label,
  value,
  hint,
}: {
  label: string
  value: string
  hint?: string
}) {
  return (
    <div
      className={cn("rounded-xl border border-slate-100 bg-white p-5 shadow-sm")}
    >
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
        {label}
      </p>
      <p className="mt-2 font-currency-mono text-2xl font-semibold tabular-nums tracking-tight text-indigo-950">
        {value}
      </p>
      {hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
    </div>
  )
}

function HealthPill({ status }: { status: ExecutiveProjectHealth }) {
  const cfg = {
    ok: {
      dot: "bg-emerald-500",
      label: "תקין",
      ring: "border-emerald-100 bg-emerald-50/80 text-emerald-900",
    },
    warn: {
      dot: "bg-amber-500",
      label: "למעקב",
      ring: "border-amber-100 bg-amber-50/80 text-amber-950",
    },
    risk: {
      dot: "bg-red-500",
      label: "סיכון",
      ring: "border-red-100 bg-red-50/80 text-red-950",
    },
  }[status]
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium",
        cfg.ring
      )}
    >
      <span className={cn("size-1.5 shrink-0 rounded-full", cfg.dot)} aria-hidden />
      {cfg.label}
    </span>
  )
}

export function HoldingExecutiveDashboardClient({
  payload,
}: {
  payload: HoldingExecutivePayload
}) {
  const branding = useOrganizationBranding()
  const totalPortfolioNis = Number(payload?.totalPortfolioNis ?? 0) || 0
  const recognizedRevenueNis =
    Number(payload?.recognizedRevenueNis ?? 0) || 0
  const totalDirectCostNis = Number(payload?.totalDirectCostNis ?? 0) || 0
  const netProfitNis = Number(payload?.netProfitNis ?? 0) || 0
  const cashRunway90dNis = Number(payload?.cashRunway90dNis ?? 0) || 0
  const invoicesPaidNis = Number(payload?.invoicesPaidNis ?? 0) || 0
  const invoicesOutstandingNis =
    Number(payload?.invoicesOutstandingNis ?? 0) || 0
  const accountsReceivableNis =
    Number(payload?.accountsReceivableNis ?? 0) || 0
  const pendingProcurementApprovalNis =
    Number(payload?.pendingProcurementApprovalNis ?? 0) || 0
  const activeProjectCount = Math.max(
    0,
    Math.floor(Number(payload?.activeProjectCount ?? 0) || 0)
  )
  const rows = Array.isArray(payload?.rows) ? payload.rows : []
  const delayAlerts = Array.isArray(payload?.delayAlerts)
    ? payload.delayAlerts
    : []
  const executiveInsightAlerts = Array.isArray(
    payload?.executiveInsightAlerts
  )
    ? payload.executiveInsightAlerts
    : []

  const portfolioGrossProfitNis =
    Number(payload?.portfolioGrossProfitNis ?? 0) || 0
  const portfolioNetLoadedProfitNis =
    Number(payload?.portfolioNetLoadedProfitNis ?? 0) || 0
  const totalMonthlyCorporateOverheadNis =
    Number(payload?.totalMonthlyCorporateOverheadNis ?? 0) || 0
  const overheadAllocationLabel = String(
    payload?.overheadAllocationLabel ?? ""
  ).trim()

  const revCostDenom = Math.max(recognizedRevenueNis + totalDirectCostNis, 1)
  const revPct = Math.round((recognizedRevenueNis / revCostDenom) * 1000) / 10
  const costPct = Math.round((totalDirectCostNis / revCostDenom) * 1000) / 10

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-10">
      <header className="pharmacy-hero-card border-slate-100 bg-white p-6 md:p-8">
        <div className="flex flex-wrap items-start gap-4">
          <div className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-slate-100 bg-white shadow-sm">
            {branding.brandLogoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={branding.brandLogoUrl}
                alt=""
                className="size-full object-contain p-1.5"
              />
            ) : (
              <Building2
                className="size-6 text-[#1e1b4b]"
                aria-hidden
              />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-indigo-700">
              {branding.organizationName}
            </p>
            <h1 className="mt-2 text-2xl font-bold tracking-tight text-indigo-950 md:text-3xl">
              מרכז פיקוד הנהלה
            </h1>
            <p className="mt-1 text-xs font-medium text-slate-500">
              {branding.slogan}
            </p>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-500">
              הכנסות מוכרות מול עלות ישירה (רכש PO מאושר בלבד — ללא טיוטה וללא ממתין לאישור
              מנכ״ל), חוב לקוחות, סכום PO תלוי אישור מנכ״ל בנפרד, ובריאות פרויקט — פורמט אחיד.
              רווח נטו טעון משקף הקצאת עקיפות מרכזית לפי מדיניות (הכנסות או ימי עבודה בגאנט).
            </p>
          </div>
        </div>
      </header>

      <section className="rounded-xl border border-indigo-100 bg-indigo-50/25 p-5 shadow-sm">
        <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-indigo-800">
          רווח והפסד — רבדים (פורטפוליו)
        </h2>
        {overheadAllocationLabel ? (
          <p className="mt-1 text-xs text-slate-600">{overheadAllocationLabel}</p>
        ) : null}
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <RibbonCard
            label="רמה 1 — רווח גולמי"
            value={ilsFull.format(portfolioGrossProfitNis)}
            hint="הכנסה מוכרת פחות עלות ישירה (חברות ביצוע + רכש + שכר)"
          />
          <RibbonCard
            label="רמה 2 — תפעולי (לפני עקיפות חברה)"
            value={ilsFull.format(netProfitNis)}
            hint="מנוע שותפי ניהול — כולל קופה ועומס אתר"
          />
          <RibbonCard
            label="רמה 3 — קונסולידציה (נטו טעון)"
            value={ilsFull.format(portfolioNetLoadedProfitNis)}
            hint={`אחרי הקצאת עקיפות (${ilsFull.format(totalMonthlyCorporateOverheadNis)} חודש נוכחי)`}
          />
        </div>
      </section>

      <section className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm">
        <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
          הכנסות מוכרות מול עלות בפועל
        </h2>
        <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="font-currency-mono text-lg font-semibold tabular-nums text-indigo-950">
              {ilsFull.format(recognizedRevenueNis)}
              <span className="mx-2 text-slate-300">/</span>
              <span className="text-slate-700">
                {ilsFull.format(totalDirectCostNis)}
              </span>
            </p>
            <p className="mt-1 text-xs text-slate-500">
              רווח תפעולי מצטבר (לפני עקיפות חברה):{" "}
              <span className="font-currency-mono font-medium text-indigo-950">
                {ilsFull.format(netProfitNis)}
              </span>
              {" · "}
              נטו טעון:{" "}
              <span className="font-currency-mono font-medium text-indigo-950">
                {ilsFull.format(portfolioNetLoadedProfitNis)}
              </span>
            </p>
          </div>
          <p className="text-xs text-slate-400">
            יחס ויזואלי (לא 100% עסקי — רק פורטפוליו מסונן)
          </p>
        </div>
        <div
          className="mt-4 flex h-3 overflow-hidden rounded-full bg-slate-100"
          role="img"
          aria-label={`הכנסות ${revPct}% מול עלות ${costPct}%`}
        >
          <div
            className="bg-indigo-600 transition-all"
            style={{ width: `${Math.min(100, revPct)}%` }}
          />
          <div
            className="bg-slate-400 transition-all"
            style={{ width: `${Math.min(100, costPct)}%` }}
          />
        </div>
        <div className="mt-2 flex flex-wrap gap-4 text-[11px] text-slate-500">
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2 rounded-sm bg-indigo-600" aria-hidden />
            הכנסות מוכרות {revPct}%
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2 rounded-sm bg-slate-400" aria-hidden />
            עלות ישירה {costPct}%
          </span>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <RibbonCard
          label="שווי פורטפוליו (חוזי לקוח פעילים)"
          value={ilsFull.format(totalPortfolioNis)}
        />
        <RibbonCard
          label="הכנסות מוכרות מצטברות"
          value={ilsFull.format(recognizedRevenueNis)}
          hint="חשבוניות מאושרות/שולם + חשבונות חלקיים ללא כפילות"
        />
        <RibbonCard
          label="עלות ישירה מצטברת"
          value={ilsFull.format(totalDirectCostNis)}
          hint="רכש (PO מאושר בלבד; לא טיוטה / לא ממתין להנהלה) + שכר + ספקי ביצוע + קופה + עומס"
        />
        <RibbonCard
          label="רווח תפעולי (לפני עקיפות חברה)"
          value={ilsFull.format(netProfitNis)}
          hint="מנוע זהה למרכז שותפי ניהול"
        />
        <RibbonCard
          label="רווח נטו טעון (אחרי עקיפות)"
          value={ilsFull.format(portfolioNetLoadedProfitNis)}
          hint="מדיניות העמסה — רישום עקיפות"
        />
        <RibbonCard
          label="בריכת עקיפות (חודש נוכחי)"
          value={ilsFull.format(totalMonthlyCorporateOverheadNis)}
          hint="סכום פעיל מרישום העקיפות"
        />
        <RibbonCard
          label="חוב לקוחות (AR)"
          value={ilsFull.format(accountsReceivableNis)}
          hint="חשבוניות שטרם שולמו"
        />
        <RibbonCard
          label="רכש ממתין לאישור מנכ״ל"
          value={ilsFull.format(pendingProcurementApprovalNis)}
          hint="PO ללא is_ceo_approved או בסטטוס pending_ceo_approval"
        />
        <RibbonCard
          label="תזרים חשבוניות — שולם"
          value={ilsFull.format(invoicesPaidNis)}
        />
        <RibbonCard
          label="תזרים חשבוניות — לא שולם"
          value={ilsFull.format(invoicesOutstandingNis)}
          hint="מאושר, טיוטה וכו׳"
        />
        <RibbonCard
          label="תזרים צפוי (90 יום)"
          value={ilsFull.format(cashRunway90dNis)}
          hint="(רווח נטו טעון / 365) × 90 — פרוקסי"
        />
      </section>

      {executiveInsightAlerts.length > 0 ? (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold tracking-tight text-indigo-950">
            התראות הנהלה (מנוע כללים)
          </h2>
          <ul className="space-y-2 rounded-xl border border-indigo-100 bg-indigo-50/30 p-4">
            {executiveInsightAlerts.map((line, i) => (
              <li
                key={`${i}-${line.slice(0, 24)}`}
                className="text-sm leading-relaxed text-indigo-950"
              >
                • {line}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {delayAlerts.length > 0 ? (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold tracking-tight text-amber-900">
            לו״ז — משימות שעבר תאריך סיום
          </h2>
          <ul className="space-y-2 rounded-xl border border-amber-100 bg-amber-50/40 p-4">
            {delayAlerts.slice(0, 12).map((a) => (
              <li
                key={a.projectId}
                className="flex flex-wrap items-center justify-between gap-2 text-sm text-slate-800"
              >
                <Link
                  href={`/marker-ofek/execution/gantt/${a.projectId}`}
                  className="font-medium text-indigo-800 underline-offset-2 hover:underline"
                >
                  {a.name}
                  {a.code ? (
                    <span className="ms-1 font-mono text-xs text-slate-500">
                      ({a.code})
                    </span>
                  ) : null}
                </Link>
                <span className="font-currency-mono tabular-nums text-amber-900">
                  {a.overdueTaskCount} משימות
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="space-y-3">
        <h2 className="text-sm font-semibold tracking-tight text-indigo-950">
          בריאות פרויקטים
        </h2>
        <div className="overflow-x-auto rounded-xl border border-slate-100 bg-white shadow-sm">
          <Table>
            <TableHeader>
              <TableRow className="border-slate-100 hover:bg-transparent">
                <TableHead className="text-slate-600">פרויקט</TableHead>
                <TableHead className="text-slate-600">בריאות</TableHead>
                <TableHead className="text-slate-600">מרכז רווח</TableHead>
                <TableHead className="text-end text-slate-600">
                  ערך חוזה
                </TableHead>
                <TableHead className="text-end text-slate-600">
                  עלות מצטברת
                </TableHead>
                <TableHead className="text-end text-slate-600">
                  השלמה %
                </TableHead>
                <TableHead className="text-end text-slate-600">
                  רווח גולמי
                </TableHead>
                <TableHead className="text-end text-slate-600">
                  עקיפות מוקצית
                </TableHead>
                <TableHead className="text-end text-slate-600">
                  נטו טעון
                </TableHead>
                <TableHead className="text-end text-slate-600">
                  מרווח שותף %
                </TableHead>
                <TableHead className="text-end text-slate-600">
                  מרווח נטו טעון %
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={11}
                    className="text-center text-sm text-slate-500"
                  >
                    אין פרויקטים במערכת
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((row, idx) => (
                  <TableRow
                    key={row.projectId ?? `holding-${idx}`}
                    className="border-slate-100 hover:bg-slate-50/50"
                  >
                    <TableCell className="font-medium text-indigo-950">
                      <span className="block font-mono text-[11px] text-slate-400">
                        {row.code || "—"}
                      </span>
                      <Link
                        href={`/marker-ofek/partner-finance/${row.projectId}`}
                        className="hover:underline"
                      >
                        {row.name ?? "—"}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <HealthPill status={row.healthStatus} />
                    </TableCell>
                    <TableCell className="text-slate-700">
                      <span
                        className={cn(
                          row.profitCenterKey !== "other" &&
                            "rounded-md border border-indigo-100 bg-indigo-50/80 px-2 py-0.5 text-xs font-medium text-indigo-900"
                        )}
                      >
                        {row.profitCenterLabel ?? "—"}
                      </span>
                    </TableCell>
                    <TableCell className="text-end font-currency-mono tabular-nums text-indigo-950">
                      {ils.format(Number(row.contractValueNis ?? 0) || 0)}
                    </TableCell>
                    <TableCell className="text-end font-currency-mono tabular-nums text-slate-800">
                      {ils.format(Number(row.totalCostNis ?? 0) || 0)}
                    </TableCell>
                    <TableCell className="text-end font-currency-mono tabular-nums text-slate-800">
                      {row.completionPercent != null
                        ? `${row.completionPercent.toFixed(1)}%`
                        : "—"}
                    </TableCell>
                    <TableCell className="text-end font-currency-mono tabular-nums text-emerald-900">
                      {ils.format(Number(row.grossProfitNis ?? 0) || 0)}
                    </TableCell>
                    <TableCell className="text-end font-currency-mono tabular-nums text-amber-900">
                      {ils.format(
                        Number(row.allocatedCorporateOverheadNis ?? 0) || 0
                      )}
                    </TableCell>
                    <TableCell className="text-end font-currency-mono tabular-nums text-indigo-950">
                      {ils.format(Number(row.netLoadedProfitNis ?? 0) || 0)}
                    </TableCell>
                    <TableCell className="text-end font-currency-mono tabular-nums text-slate-800">
                      {row.netMarginPercent != null
                        ? `${row.netMarginPercent.toFixed(1)}%`
                        : "—"}
                    </TableCell>
                    <TableCell className="text-end font-currency-mono tabular-nums text-indigo-900">
                      {row.netLoadedMarginPercent != null
                        ? `${row.netLoadedMarginPercent.toFixed(1)}%`
                        : "—"}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
        <p className="text-xs text-slate-400">
          פרויקטים פעילים במערכת: {activeProjectCount}
        </p>
      </section>
    </div>
  )
}
