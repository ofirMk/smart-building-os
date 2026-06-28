"use client"

/**
 * Shared utilities for Phase 9 procurement report pages.
 *
 * Exports:
 *   ReportShell        — page wrapper with title, period selector, export hint
 *   ReportKpiCard      — single metric tile
 *   ReportEmptyState   — empty state for when no data is returned
 *   ReportErrorState   — error state
 *   formatNis          — ILS currency formatter
 *   formatPct          — percentage formatter
 *   COLOR_PALETTE      — Recharts color array aligned with CSS var(--chart-N)
 *   usePeriod          — hook for date range state + URL sync
 */

import * as React from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { AlertTriangle, Download, Loader2, TrendingDown, TrendingUp, Minus } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"

// ─────────────────────────────────────────────────────────────────────────────
// Formatters
// ─────────────────────────────────────────────────────────────────────────────

export function formatNis(
  n: number,
  opts?: { compact?: boolean; decimals?: number },
): string {
  if (opts?.compact && Math.abs(n) >= 1_000_000) {
    return `₪${(n / 1_000_000).toFixed(1)}M`
  }
  if (opts?.compact && Math.abs(n) >= 1_000) {
    return `₪${(n / 1_000).toFixed(1)}K`
  }
  return new Intl.NumberFormat("he-IL", {
    style: "currency",
    currency: "ILS",
    maximumFractionDigits: opts?.decimals ?? 0,
  }).format(n)
}

export function formatPct(n: number | null, decimals = 1): string {
  if (n === null) return "—"
  return `${n >= 0 ? "+" : ""}${n.toFixed(decimals)}%`
}

// ─────────────────────────────────────────────────────────────────────────────
// Colors
// ─────────────────────────────────────────────────────────────────────────────

// These align with shadcn chart CSS variables
export const COLOR_PALETTE = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
]

export const TAILWIND_COLORS = [
  "#3b82f6", // blue-500
  "#10b981", // emerald-500
  "#f59e0b", // amber-500
  "#ef4444", // red-500
  "#8b5cf6", // violet-500
  "#06b6d4", // cyan-500
  "#f97316", // orange-500
  "#84cc16", // lime-500
]

// ─────────────────────────────────────────────────────────────────────────────
// usePeriod hook
// ─────────────────────────────────────────────────────────────────────────────

function defaultFrom() {
  const d = new Date()
  d.setFullYear(d.getFullYear() - 1)
  return d.toISOString().slice(0, 10)
}
function defaultTo() {
  return new Date().toISOString().slice(0, 10)
}

export function usePeriod() {
  const router = useRouter()
  const params = useSearchParams()
  const [from, setFrom] = React.useState(params?.get("from") ?? defaultFrom())
  const [to, setTo] = React.useState(params?.get("to") ?? defaultTo())

  function apply(newFrom: string, newTo: string) {
    setFrom(newFrom)
    setTo(newTo)
    const sp = new URLSearchParams(window.location.search)
    sp.set("from", newFrom)
    sp.set("to", newTo)
    router.replace(`?${sp.toString()}`, { scroll: false })
  }

  return { from, to, apply }
}

// ─────────────────────────────────────────────────────────────────────────────
// ReportShell
// ─────────────────────────────────────────────────────────────────────────────

export function ReportShell({
  title,
  subtitle,
  icon,
  from,
  to,
  onApplyPeriod,
  loading,
  children,
}: {
  title: string
  subtitle?: string
  icon?: React.ReactNode
  from: string
  to: string
  onApplyPeriod: (from: string, to: string) => void
  loading: boolean
  children: React.ReactNode
}) {
  const [localFrom, setLocalFrom] = React.useState(from)
  const [localTo, setLocalTo] = React.useState(to)

  React.useEffect(() => {
    setLocalFrom(from)
    setLocalTo(to)
  }, [from, to])

  return (
    <div dir="rtl" className="min-h-screen space-y-5 p-4 md:p-6">
      {/* Page header */}
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-border pb-4">
        <div className="flex items-center gap-3">
          {icon && (
            <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
              {icon}
            </div>
          )}
          <div>
            <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
            {subtitle && (
              <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>
            )}
          </div>
        </div>

        {/* Period + controls */}
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex items-end gap-2">
            <div className="space-y-1">
              <Label className="text-[11px] font-medium text-muted-foreground">מתאריך</Label>
              <Input
                type="date"
                value={localFrom}
                onChange={(e) => setLocalFrom(e.target.value)}
                className="h-8 w-32 text-xs"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px] font-medium text-muted-foreground">עד תאריך</Label>
              <Input
                type="date"
                value={localTo}
                onChange={(e) => setLocalTo(e.target.value)}
                className="h-8 w-32 text-xs"
              />
            </div>
            <Button
              size="sm"
              className="h-8 text-xs"
              onClick={() => onApplyPeriod(localFrom, localTo)}
              disabled={loading}
            >
              {loading ? <Loader2 className="size-3.5 animate-spin" /> : "החל"}
            </Button>
          </div>
          <Button variant="outline" size="sm" className="h-8 text-xs" disabled>
            <Download className="size-3.5" aria-hidden />
            יצוא CSV
          </Button>
        </div>
      </header>

      {loading ? (
        <div className="flex h-64 items-center justify-center gap-3 text-muted-foreground">
          <Loader2 className="size-5 animate-spin" />
          <span className="text-sm">טוען נתונים…</span>
        </div>
      ) : (
        children
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// ReportKpiCard
// ─────────────────────────────────────────────────────────────────────────────

type KpiTone = "neutral" | "success" | "warning" | "danger" | "info"

export function ReportKpiCard({
  title,
  value,
  sub,
  tone = "neutral",
  trend,
}: {
  title: string
  value: string | React.ReactNode
  sub?: string
  tone?: KpiTone
  trend?: "up" | "down" | "flat"
}) {
  const valueTone: Record<KpiTone, string> = {
    neutral: "text-foreground",
    success: "text-emerald-600 dark:text-emerald-400",
    warning: "text-amber-600 dark:text-amber-400",
    danger: "text-rose-600 dark:text-rose-400",
    info: "text-sky-600 dark:text-sky-400",
  }
  const TrendIcon =
    trend === "up" ? TrendingUp : trend === "down" ? TrendingDown : Minus

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className={cn("text-2xl font-bold tabular-nums", valueTone[tone])}>
          {value}
        </div>
        {(sub || trend) && (
          <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
            {trend && (
              <TrendIcon
                className={cn(
                  "size-3",
                  trend === "up"
                    ? "text-emerald-500"
                    : trend === "down"
                      ? "text-rose-500"
                      : "text-slate-400",
                )}
              />
            )}
            {sub && <span>{sub}</span>}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// ReportEmptyState / ReportErrorState
// ─────────────────────────────────────────────────────────────────────────────

export function ReportEmptyState({ message = "אין נתונים לתקופה הנבחרת" }: { message?: string }) {
  return (
    <div className="flex h-48 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border text-muted-foreground">
      <AlertTriangle className="size-8 opacity-40" />
      <p className="text-sm">{message}</p>
    </div>
  )
}

export function ReportErrorState({ message }: { message: string }) {
  return (
    <div className="flex h-48 flex-col items-center justify-center gap-2 rounded-xl border border-rose-200 bg-rose-50 text-rose-700">
      <AlertTriangle className="size-8" />
      <p className="text-sm font-medium">{message}</p>
    </div>
  )
}
