/**
 * Sprint W2 — Contracts Engine waterfall visualization.
 *
 * Renders the MedaTech §3.2.2 calculation cascade as a horizontal/vertical
 * bar story: cumulative executed → escalation → deductions → previous billed
 * → amount to pay → VAT → grand total. Pure client component, no DB calls.
 */

"use client"

import * as React from "react"
import { ArrowDownRight, ArrowUpRight, Equal } from "lucide-react"

import { cn } from "@/lib/utils"
import type { WaterfallStep, WaterfallSummary } from "@/lib/marker-ofek/contracts/w2-engine-types"
import { buildWaterfallSteps } from "@/lib/marker-ofek/contracts/w2-engine-types"

function formatCurrency(value: number): string {
  const sign = value < 0 ? "−" : ""
  const abs = Math.abs(Math.round(value))
  return `${sign}₪${abs.toLocaleString("he-IL")}`
}

function StepRow({ step, maxAbs }: { step: WaterfallStep; maxAbs: number }) {
  const ratio = Math.min(1, Math.abs(step.amount) / Math.max(maxAbs, 1))
  const isTotal = step.tone === "total"
  const toneClass =
    step.tone === "negative"
      ? "bg-gradient-to-r from-rose-500/80 to-rose-500/40"
      : step.tone === "total"
        ? "bg-gradient-to-r from-emerald-600 to-emerald-400"
        : "bg-gradient-to-r from-sky-500/80 to-sky-500/40"

  const Icon =
    step.tone === "negative"
      ? ArrowDownRight
      : step.tone === "total"
        ? Equal
        : ArrowUpRight

  return (
    <div
      className={cn(
        "rounded-2xl border border-border bg-card/70 p-3 sm:p-4 shadow-sm transition-all",
        isTotal && "border-emerald-300/70 bg-emerald-50/50 dark:bg-emerald-950/30",
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span
            className={cn(
              "flex size-9 items-center justify-center rounded-xl shrink-0",
              step.tone === "negative" && "bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300",
              step.tone === "total" && "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300",
              (step.tone === "positive" || step.tone === "neutral") &&
                "bg-sky-100 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300",
            )}
            aria-hidden
          >
            <Icon className="size-4" />
          </span>
          <div className="text-right">
            <div className="text-sm font-semibold text-foreground">
              {step.hebrewLabel}
            </div>
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
              {step.label}
              <span className="mx-1 text-muted-foreground/60">·</span>
              <span className="font-mono">{step.specRef}</span>
            </div>
          </div>
        </div>
        <div
          className={cn(
            "text-base sm:text-lg font-semibold tabular-nums",
            step.tone === "negative" && "text-rose-700 dark:text-rose-300",
            step.tone === "total" && "text-emerald-700 dark:text-emerald-300",
            (step.tone === "positive" || step.tone === "neutral") &&
              "text-foreground",
          )}
        >
          {formatCurrency(step.amount)}
        </div>
      </div>
      <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={cn("h-full rounded-full", toneClass)}
          style={{ width: `${Math.max(4, ratio * 100)}%` }}
        />
      </div>
    </div>
  )
}

export function WaterfallCanvas({
  summary,
  variant,
}: {
  summary: WaterfallSummary
  variant: "live" | "illustrative"
}) {
  const steps = buildWaterfallSteps(summary)
  const maxAbs = Math.max(...steps.map((s) => Math.abs(s.amount)), 1)

  return (
    <div className="space-y-3" dir="rtl">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold tracking-tight">
          מפל חישוב חשבון חלקי
        </h3>
        <span
          className={cn(
            "rounded-full px-3 py-1 text-[11px] font-medium",
            variant === "live"
              ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
              : "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300",
          )}
        >
          {variant === "live" ? "נתונים חיים" : "תרשים המחשה"}
        </span>
      </div>
      <div className="grid gap-2.5">
        {steps.map((s) => (
          <StepRow key={s.id} step={s} maxAbs={maxAbs} />
        ))}
      </div>
    </div>
  )
}
