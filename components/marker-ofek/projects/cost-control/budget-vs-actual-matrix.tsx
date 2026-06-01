"use client"

/**
 * Sprint T13 — WBS Budget vs Actual Variance Matrix (UI).
 *
 * A collapsible Tree-Table that shows, for one project:
 *   1. Top KPI strip — Total Budget, Actual Cost, Cost to Complete, Overall
 *      Utilisation %, mock-vs-live badge.
 *   2. Two-level tree (sections → items) with budget / actual / variance /
 *      utilisation % columns.
 *   3. Inline Excel-style data-bar inside each "% utilisation" cell.
 *   4. RAG-style highlighting: amber tint when utilisation ≥90%, rose row
 *      background + bold red number when utilisation >100%.
 *
 * No mocks live in this file — the parent server page passes a pre-built
 * `CostControlReport` object; mock vs. real is signalled by `report.isMock`.
 */

import * as React from "react"
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  Info,
  PieChart,
  Target,
  TrendingDown,
  Wallet,
} from "lucide-react"

import { Card } from "@/components/ui/card"
import type {
  CostControlItem,
  CostControlReport,
  CostControlSection,
} from "@/lib/marker-ofek/projects/t13-cost-control-actions"
import { cn } from "@/lib/utils"

const ILS = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 0,
})

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function utilisationPct(budget: number, actual: number): number {
  if (budget <= 0) return 0
  return (actual / budget) * 100
}

type UtilState = "ok" | "warn" | "over"

function classifyUtil(pct: number): UtilState {
  if (pct > 100) return "over"
  if (pct >= 90) return "warn"
  return "ok"
}

// ---------------------------------------------------------------------------
// KPI tile
// ---------------------------------------------------------------------------

function KpiTile({
  icon,
  label,
  subLabel,
  value,
  tone,
}: {
  icon: React.ReactNode
  label: string
  subLabel: string
  value: string
  tone: "indigo" | "rose" | "emerald" | "violet" | "amber"
}) {
  const tones: Record<typeof tone, { bg: string; iconBg: string; text: string }> = {
    indigo: {
      bg: "border-indigo-200 bg-indigo-50/60",
      iconBg: "bg-indigo-600",
      text: "text-indigo-900",
    },
    rose: {
      bg: "border-rose-200 bg-rose-50/60",
      iconBg: "bg-rose-600",
      text: "text-rose-900",
    },
    emerald: {
      bg: "border-emerald-200 bg-emerald-50/60",
      iconBg: "bg-emerald-600",
      text: "text-emerald-900",
    },
    violet: {
      bg: "border-violet-200 bg-violet-50/60",
      iconBg: "bg-violet-600",
      text: "text-violet-900",
    },
    amber: {
      bg: "border-amber-200 bg-amber-50/60",
      iconBg: "bg-amber-600",
      text: "text-amber-900",
    },
  }
  const t = tones[tone]
  return (
    <Card className={cn("flex items-center gap-3 border p-4 shadow-sm", t.bg)}>
      <span
        className={cn(
          "flex size-10 shrink-0 items-center justify-center rounded-xl text-white",
          t.iconBg,
        )}
      >
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-[11px] font-semibold text-foreground/90">{label}</p>
        <p className={cn("font-mono text-[10px] uppercase opacity-80", t.text)}>
          {subLabel}
        </p>
        <p className={cn("mt-0.5 truncate font-mono text-xl font-bold tabular-nums", t.text)}>
          {value}
        </p>
      </div>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Inline Excel-style data bar for the utilisation %
// ---------------------------------------------------------------------------

function UtilizationCell({
  pct,
  bold = false,
}: {
  pct: number
  bold?: boolean
}) {
  const state = classifyUtil(pct)
  const clampedFill = Math.min(100, Math.max(0, pct))
  // For over-budget, draw a 100%-fill rose bar plus a small overflow chip.
  const fillColor =
    state === "over"
      ? "bg-rose-500"
      : state === "warn"
        ? "bg-amber-500"
        : "bg-emerald-500"
  const textColor =
    state === "over"
      ? "text-rose-700"
      : state === "warn"
        ? "text-amber-800"
        : "text-emerald-800"

  return (
    <div className="flex flex-col gap-1">
      <div className="relative h-2 w-full overflow-hidden rounded-full bg-slate-100">
        <div
          className={cn("h-full rounded-full transition-all", fillColor)}
          style={{ width: `${clampedFill}%` }}
        />
        {state === "over" ? (
          <div
            className="absolute inset-y-0 right-0 w-[6px] animate-pulse bg-rose-700"
            aria-hidden
          />
        ) : null}
      </div>
      <div className="flex items-center justify-between gap-1 font-mono text-[10px] tabular-nums">
        <span
          className={cn(
            "rounded px-1",
            bold ? "font-bold" : "font-medium",
            state === "warn" && "bg-amber-100",
            state === "over" && "bg-rose-100",
            textColor,
          )}
        >
          {pct.toFixed(1)}%
        </span>
        {state === "over" ? (
          <span className="inline-flex items-center gap-0.5 rounded bg-rose-600 px-1 py-0.5 text-[9px] font-bold text-white">
            <AlertTriangle className="size-2.5" aria-hidden />
            חריגה
          </span>
        ) : null}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Item row (leaf — BOQ line)
// ---------------------------------------------------------------------------

function ItemRow({ item }: { item: CostControlItem }) {
  const pct = utilisationPct(item.budget, item.actual)
  const variance = item.actual - item.budget
  const state = classifyUtil(pct)
  return (
    <tr
      className={cn(
        "border-t border-border/40 text-sm transition-colors",
        state === "over" && "bg-rose-50/70 hover:bg-rose-50",
        state === "warn" && "bg-amber-50/40 hover:bg-amber-50",
        state === "ok" && "hover:bg-muted/40",
      )}
    >
      <td className="py-2 ps-12 pe-3">
        <span className="font-mono text-[11px] text-muted-foreground">
          {item.itemNumber}
        </span>
      </td>
      <td className="py-2 pe-3">
        <span className="text-foreground/90">{item.description}</span>
        {item.uom ? (
          <span className="ms-2 font-mono text-[10px] uppercase text-muted-foreground">
            {item.uom}
          </span>
        ) : null}
      </td>
      <td className="py-2 pe-3 text-end font-mono tabular-nums text-foreground/80">
        {ILS.format(item.budget)}
      </td>
      <td
        className={cn(
          "py-2 pe-3 text-end font-mono tabular-nums",
          state === "over" ? "font-bold text-rose-700" : "text-foreground/90",
        )}
      >
        {ILS.format(item.actual)}
      </td>
      <td
        className={cn(
          "py-2 pe-3 text-end font-mono tabular-nums",
          variance > 0 ? "text-rose-700" : "text-emerald-700",
        )}
      >
        {variance > 0 ? "+" : ""}
        {ILS.format(variance)}
      </td>
      <td className="py-2 pe-3 min-w-[160px]">
        <UtilizationCell pct={pct} />
      </td>
    </tr>
  )
}

// ---------------------------------------------------------------------------
// Section row (collapsible parent — chapter)
// ---------------------------------------------------------------------------

function SectionRow({
  section,
  defaultOpen,
}: {
  section: CostControlSection
  defaultOpen: boolean
}) {
  const [open, setOpen] = React.useState(defaultOpen)
  const pct = utilisationPct(section.budget, section.actual)
  const variance = section.actual - section.budget
  const state = classifyUtil(pct)

  return (
    <>
      <tr
        className={cn(
          "border-t border-border/60 bg-slate-50/80 text-sm font-semibold",
          state === "over" && "bg-rose-100/70",
          state === "warn" && "bg-amber-100/60",
        )}
      >
        <td className="py-2 ps-3 pe-3">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="inline-flex items-center gap-1 rounded-md px-1 py-0.5 text-xs font-mono text-foreground transition-colors hover:bg-white/60"
            aria-expanded={open}
            aria-label={open ? "כווץ פרק" : "הרחב פרק"}
          >
            {open ? (
              <ChevronDown className="size-3.5" aria-hidden />
            ) : (
              <ChevronLeft className="size-3.5" aria-hidden />
            )}
            <span>{section.code}</span>
          </button>
        </td>
        <td className="py-2 pe-3 text-foreground">
          {section.name}
          <span className="ms-2 font-mono text-[10px] uppercase text-muted-foreground">
            {section.items.length} סעיפים
          </span>
        </td>
        <td className="py-2 pe-3 text-end font-mono tabular-nums text-foreground">
          {ILS.format(section.budget)}
        </td>
        <td
          className={cn(
            "py-2 pe-3 text-end font-mono tabular-nums",
            state === "over" ? "font-bold text-rose-700" : "text-foreground",
          )}
        >
          {ILS.format(section.actual)}
        </td>
        <td
          className={cn(
            "py-2 pe-3 text-end font-mono tabular-nums",
            variance > 0 ? "text-rose-700" : "text-emerald-700",
          )}
        >
          {variance > 0 ? "+" : ""}
          {ILS.format(variance)}
        </td>
        <td className="py-2 pe-3 min-w-[160px]">
          <UtilizationCell pct={pct} bold />
        </td>
      </tr>
      {open
        ? section.items.map((it) => <ItemRow key={it.id} item={it} />)
        : null}
    </>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function BudgetVsActualMatrix({
  report,
}: {
  report: CostControlReport
}) {
  const utilization = utilisationPct(report.totalBudget, report.totalActual)
  const remaining = report.totalBudget - report.totalActual
  const overBudget = utilization > 100
  const state = classifyUtil(utilization)

  // Open the first 2 sections by default for instant visual signal.
  const sortedSections = report.sections

  return (
    <section dir="rtl" className="flex flex-col gap-5">
      {/* Header / mock indicator */}
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[10px] font-mono uppercase tracking-[0.18em] text-muted-foreground">
            Sprint T13 · MedaTech §6 Cost Control · Budget vs Actual
          </p>
          <h2 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">
            רדאר חריגות תקציב — מטריצת WBS
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            פירוט פרק → סעיף עם תקציב, ביצוע כספי, פער, ו-% ניצול חי. שורות מודגשות
            באדום = חריגה מעל 100%, צהוב = התקרבות לתקרה (≥90%).
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {report.isMock ? (
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
              "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium",
              state === "over"
                ? "border-rose-300 bg-rose-50 text-rose-900"
                : state === "warn"
                  ? "border-amber-300 bg-amber-50 text-amber-900"
                  : "border-emerald-300 bg-emerald-50 text-emerald-900",
            )}
          >
            ניצול כולל: {utilization.toFixed(1)}%
          </span>
        </div>
      </header>

      {/* KPI strip */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiTile
          icon={<Wallet className="size-5" aria-hidden />}
          tone="indigo"
          label="תקציב הפרויקט"
          subLabel="Total Budget"
          value={ILS.format(report.totalBudget)}
        />
        <KpiTile
          icon={<TrendingDown className="size-5" aria-hidden />}
          tone={overBudget ? "rose" : "violet"}
          label="בוצע בפועל"
          subLabel="Actual Cost"
          value={ILS.format(report.totalActual)}
        />
        <KpiTile
          icon={<Target className="size-5" aria-hidden />}
          tone={remaining < 0 ? "rose" : "emerald"}
          label={remaining < 0 ? "סטייה (חריגה)" : "יתרת תקציב"}
          subLabel="Cost to Complete"
          value={ILS.format(Math.abs(remaining))}
        />
        <KpiTile
          icon={<PieChart className="size-5" aria-hidden />}
          tone={state === "over" ? "rose" : state === "warn" ? "amber" : "emerald"}
          label="סטטוס חריגה כולל"
          subLabel="Overall Utilisation"
          value={`${utilization.toFixed(1)}%`}
        />
      </div>

      {/* Tree table */}
      <Card className="border-border/70 p-0">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-muted/40 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                <th className="py-2 ps-3 pe-3 text-start whitespace-nowrap">קוד</th>
                <th className="py-2 pe-3 text-start whitespace-nowrap">שם סעיף</th>
                <th className="py-2 pe-3 text-end whitespace-nowrap">תקציב</th>
                <th className="py-2 pe-3 text-end whitespace-nowrap">בוצע</th>
                <th className="py-2 pe-3 text-end whitespace-nowrap">פער</th>
                <th className="py-2 pe-3 text-start whitespace-nowrap">% ניצול</th>
              </tr>
            </thead>
            <tbody>
              {sortedSections.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="py-10 text-center text-sm text-muted-foreground"
                  >
                    אין סעיפי תקציב להצגה.
                  </td>
                </tr>
              ) : (
                sortedSections.map((sec, idx) => (
                  <SectionRow
                    key={sec.code}
                    section={sec}
                    defaultOpen={idx < 2}
                  />
                ))
              )}

              {/* Grand totals row */}
              {sortedSections.length > 0 ? (
                <tr className="border-t-2 border-slate-300 bg-slate-100 text-sm font-bold">
                  <td className="py-2 ps-3 pe-3 font-mono">∑</td>
                  <td className="py-2 pe-3">סה״כ פרויקט</td>
                  <td className="py-2 pe-3 text-end font-mono tabular-nums">
                    {ILS.format(report.totalBudget)}
                  </td>
                  <td
                    className={cn(
                      "py-2 pe-3 text-end font-mono tabular-nums",
                      overBudget ? "text-rose-700" : "text-foreground",
                    )}
                  >
                    {ILS.format(report.totalActual)}
                  </td>
                  <td
                    className={cn(
                      "py-2 pe-3 text-end font-mono tabular-nums",
                      remaining < 0 ? "text-rose-700" : "text-emerald-700",
                    )}
                  >
                    {remaining < 0 ? "+" : ""}
                    {ILS.format(-remaining)}
                  </td>
                  <td className="py-2 pe-3 min-w-[160px]">
                    <UtilizationCell pct={utilization} bold />
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Card>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Project tabs strip — tiny in-page nav so the cost-control page exposes
// "Overview / Contracts / Cost Control" as the user requested. Additive: it
// does not replace any existing nav; just provides discoverability when the
// page is reached directly.
// ---------------------------------------------------------------------------

export function ProjectInternalTabs({
  projectId,
  active,
}: {
  projectId: string
  active: "overview" | "contracts" | "cost-control" | "variations"
}) {
  const tabs: Array<{ key: typeof active; label: string; href: string }> = [
    {
      key: "overview",
      label: "סקירה",
      href: `/marker-ofek/projects/${projectId}`,
    },
    {
      key: "contracts",
      label: "חוזים",
      href: `/marker-ofek/projects/${projectId}/contracts`,
    },
    {
      key: "cost-control",
      label: "בקרת תקציב",
      href: `/marker-ofek/projects/${projectId}/cost-control`,
    },
    {
      // T13 — חריגים (Variations) cockpit + AI booklet generator
      key: "variations",
      label: "חריגים",
      href: `/marker-ofek/projects/${projectId}/variations`,
    },
  ]
  return (
    <nav
      dir="rtl"
      aria-label="ניווט פנימי בפרויקט"
      className="inline-flex w-fit items-center gap-1 rounded-lg border border-border/60 bg-card p-1 text-xs shadow-sm"
    >
      {tabs.map((t) => (
        <a
          key={t.key}
          href={t.href}
          className={cn(
            "rounded-md px-3 py-1.5 font-medium transition-colors",
            t.key === active
              ? "bg-indigo-600 text-white shadow"
              : "text-foreground/70 hover:bg-muted hover:text-foreground",
          )}
        >
          {t.label}
        </a>
      ))}
    </nav>
  )
}
