"use client"

import * as React from "react"
import {
  Banknote,
  FlaskConical,
  Percent,
  TrendingDown,
  TrendingUp,
} from "lucide-react"

import { HOLDEN_SLATE_CARD_TINT, formatIls1Decimal, formatSignedPercent1Decimal } from "@/lib/theme/holden-slate"
import { cn } from "@/lib/utils"

export type SimulationImpactInput = {
  /** Baseline cash inflow computed from committed, persisted lines. */
  baselineCashInflow: number
  /** Cash inflow computed from simulated (local-only) lines. */
  simulatedCashInflow: number
  /** Baseline margin ratio (0..1). */
  baselineMarginPct: number
  /** Simulated margin ratio (0..1). */
  simulatedMarginPct: number
  /** True when the underlying hook has at least one override. */
  isDirty: boolean
  /** Display title override. */
  title?: string
}

export function SimulationImpactSummary({
  baselineCashInflow,
  simulatedCashInflow,
  baselineMarginPct,
  simulatedMarginPct,
  isDirty,
  title = "Simulation Impact",
}: SimulationImpactInput) {
  const cashDelta = simulatedCashInflow - baselineCashInflow
  const marginDeltaPct = simulatedMarginPct - baselineMarginPct
  const cashTrendUp = cashDelta >= 0
  const marginTrendUp = marginDeltaPct >= 0

  return (
    <section className={cn(HOLDEN_SLATE_CARD_TINT, "p-3 text-right")} dir="rtl">
      <header className="mb-2 flex items-center justify-between">
        <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-700">
          <FlaskConical className="size-3.5 text-amber-600" />
          {title}
        </p>
        <span
          className={cn(
            "rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
            isDirty
              ? "border border-amber-200 bg-amber-50 text-amber-800"
              : "border border-slate-200 bg-card text-slate-500"
          )}
        >
          {isDirty ? "What-If" : "Live"}
        </span>
      </header>

      <div className="space-y-2">
        <div className="rounded-xl border border-slate-200 bg-card p-2">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-slate-500">
              <Banknote className="size-3" />
              Projected Cash Inflow
            </span>
            <span
              className={cn(
                "inline-flex items-center gap-0.5 text-[11px] font-semibold",
                cashTrendUp ? "text-emerald-700" : "text-rose-700"
              )}
            >
              {cashTrendUp ? (
                <TrendingUp className="size-3" />
              ) : (
                <TrendingDown className="size-3" />
              )}
              {formatSignedPercent1Decimal(
                baselineCashInflow > 0 ? (cashDelta / baselineCashInflow) * 100 : 0
              )}
            </span>
          </div>
          <p className="mt-1 font-mono text-sm font-semibold text-foreground">
            {formatIls1Decimal(simulatedCashInflow)}
          </p>
          <p className="text-[11px] text-slate-500">
            Baseline: <span className="font-mono">{formatIls1Decimal(baselineCashInflow)}</span>
            {" · Δ "}
            <span
              className={cn(
                "font-mono",
                cashTrendUp ? "text-emerald-700" : "text-rose-700"
              )}
            >
              {formatIls1Decimal(cashDelta)}
            </span>
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-card p-2">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-slate-500">
              <Percent className="size-3" />
              Projected Margin
            </span>
            <span
              className={cn(
                "inline-flex items-center gap-0.5 text-[11px] font-semibold",
                marginTrendUp ? "text-emerald-700" : "text-rose-700"
              )}
            >
              {marginTrendUp ? (
                <TrendingUp className="size-3" />
              ) : (
                <TrendingDown className="size-3" />
              )}
              {formatSignedPercent1Decimal(marginDeltaPct)}
            </span>
          </div>
          <p className="mt-1 font-mono text-sm font-semibold text-foreground">
            {simulatedMarginPct.toFixed(1)}%
          </p>
          <p className="text-[11px] text-slate-500">
            Baseline:{" "}
            <span className="font-mono">{baselineMarginPct.toFixed(1)}%</span>
            {" · Δ "}
            <span
              className={cn(
                "font-mono",
                marginTrendUp ? "text-emerald-700" : "text-rose-700"
              )}
            >
              {formatSignedPercent1Decimal(marginDeltaPct)}
            </span>
          </p>
        </div>
      </div>

      {!isDirty ? (
        <p className="mt-2 rounded-xl border border-dashed border-slate-300 bg-card/70 px-2 py-1.5 text-[10px] text-slate-500">
          הפעילו Simulation Mode כדי לחשב השפעה על תזרים ומרווח בזמן אמת.
        </p>
      ) : null}
    </section>
  )
}
