"use client"

import * as React from "react"
import {
  AlertTriangle,
  Banknote,
  Gauge,
  LineChart,
  Loader2,
  ShieldCheck,
} from "lucide-react"
import { z } from "zod"

import {
  HOLDEN_SLATE_CARD_CLASS,
  HOLDEN_SLATE_CARD_TINT,
  HOLDEN_SLATE_CHIP_BASE,
  HOLDEN_SLATE_CHIP_TONES,
  formatIls1Decimal,
  formatSignedPercent1Decimal,
} from "@/lib/theme/holden-slate"
import {
  HIGH_VARIANCE_THRESHOLD,
  calculatePriceVariance,
} from "@/lib/erp/pricing-logic"
import { apiGet, apiPost } from "@/lib/utils/api-client"
import { cn } from "@/lib/utils"

/** Zod envelopes for each datasource the sidebar reads. */
const historicalStatsSchema = z.object({
  avgPrice: z.coerce.number(),
  minPrice: z.coerce.number(),
  maxPrice: z.coerce.number(),
  lastPaidPrice: z.coerce.number(),
  sampleCount: z.coerce.number(),
})

const vendorMessageSchema = z
  .object({
    totalContracts: z.coerce.number().optional().default(0),
    avgCreditScore: z.coerce.number().optional().default(0),
    onTimeDeliveryPct: z.coerce.number().optional().default(0),
    paymentTerms: z.string().nullable().optional(),
  })
  .passthrough()

const projectProfitabilitySchema = z
  .object({
    budgetVsActual: z
      .array(
        z.object({
          budgetSubChapter: z.string().nullable().optional(),
          subChapter: z.string().nullable().optional(),
          category: z.string().nullable().optional(),
          resourceId: z.string().nullable().optional(),
          resource: z.string().nullable().optional(),
          budget: z.coerce.number().optional().default(0),
          actual: z.coerce.number().optional().default(0),
        })
      )
      .optional()
      .default([]),
  })
  .passthrough()

type HistoricalStats = z.infer<typeof historicalStatsSchema>
type VendorMessage = z.infer<typeof vendorMessageSchema>

export type PoCreationSidebarProps = {
  /** Active supplier (for Vendor Health lookup). */
  supplierId?: string | null
  /** Active item (for Historical Price Variance). */
  itemId?: string | null
  /** Active project (for Budget Remaining). */
  projectId?: string | null
  /** Budget sub-chapter + resource for category-specific remaining budget. */
  budgetSubChapter?: string | null
  resourceId?: string | null
  /** Currently-entered unit price; enables live variance chip. */
  enteredUnitPrice?: number
}

function Tile({
  title,
  icon,
  loading,
  children,
  tone = "default",
}: {
  title: string
  icon: React.ReactNode
  loading?: boolean
  children: React.ReactNode
  tone?: "default" | "tint"
}) {
  return (
    <section
      className={cn(
        tone === "tint" ? HOLDEN_SLATE_CARD_TINT : HOLDEN_SLATE_CARD_CLASS,
        "p-3"
      )}
      dir="rtl"
    >
      <header className="mb-2 flex items-center justify-between">
        <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-foreground">
          <span className="text-muted-foreground">{icon}</span>
          {title}
        </p>
        {loading ? <Loader2 className="size-3.5 animate-spin text-muted-foreground" /> : null}
      </header>
      {children}
    </section>
  )
}

function useVendorHealth(supplierId: string | null | undefined) {
  const [data, setData] = React.useState<VendorMessage | null>(null)
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!supplierId) {
      setData(null)
      setLoading(false)
      setError(null)
      return
    }
    const controller = new AbortController()
    setData(null)
    setLoading(true)
    setError(null)

    void (async () => {
      try {
        const payload = await apiGet<VendorMessage>(
          `/api/erp/procurement/suppliers/${supplierId}/entry-message`,
          { schema: vendorMessageSchema, signal: controller.signal }
        )
        if (controller.signal.aborted) return
        setData(payload ?? null)
      } catch (err) {
        if (controller.signal.aborted) return
        if (err instanceof Error && err.name === "AbortError") return
        setError(err instanceof Error ? err.message : "Vendor lookup failed")
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    })()

    return () => controller.abort()
  }, [supplierId])

  return { data, loading, error }
}

function useHistoricalStats(itemId: string | null | undefined) {
  const [data, setData] = React.useState<HistoricalStats | null>(null)
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!itemId) {
      setData(null)
      setLoading(false)
      setError(null)
      return
    }
    const controller = new AbortController()
    setData(null)
    setLoading(true)
    setError(null)

    void (async () => {
      try {
        const payload = await apiPost<HistoricalStats>(
          "/api/erp/pricing/historical-stats",
          { itemId },
          { schema: historicalStatsSchema, signal: controller.signal }
        )
        if (controller.signal.aborted) return
        setData(payload)
      } catch (err) {
        if (controller.signal.aborted) return
        if (err instanceof Error && err.name === "AbortError") return
        setError(err instanceof Error ? err.message : "Historical stats failed")
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    })()

    return () => controller.abort()
  }, [itemId])

  return { data, loading, error }
}

function useBudgetRemaining(input: {
  projectId: string | null | undefined
  budgetSubChapter: string | null | undefined
  resourceId: string | null | undefined
}) {
  const { projectId, budgetSubChapter, resourceId } = input
  const [data, setData] = React.useState<{
    budget: number
    actual: number
    remaining: number
  } | null>(null)
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!projectId) {
      setData(null)
      setLoading(false)
      setError(null)
      return
    }
    const controller = new AbortController()
    setData(null)
    setLoading(true)
    setError(null)

    void (async () => {
      try {
        const payload = await apiGet<z.infer<typeof projectProfitabilitySchema>>(
          `/api/erp/projects/${projectId}/profitability`,
          { schema: projectProfitabilitySchema, signal: controller.signal }
        )
        if (controller.signal.aborted) return

        const rows = payload.budgetVsActual ?? []
        const matching = rows.filter((row) => {
          const rowSub = row.budgetSubChapter ?? row.subChapter ?? ""
          const rowRes = row.resourceId ?? row.resource ?? ""
          const subOk = !budgetSubChapter || rowSub === budgetSubChapter
          const resOk = !resourceId || rowRes === resourceId
          return subOk && resOk
        })
        const source = matching.length > 0 ? matching : rows
        const budget = source.reduce((sum, row) => sum + Number(row.budget ?? 0), 0)
        const actual = source.reduce((sum, row) => sum + Number(row.actual ?? 0), 0)
        setData({ budget, actual, remaining: budget - actual })
      } catch (err) {
        if (controller.signal.aborted) return
        if (err instanceof Error && err.name === "AbortError") return
        setError(err instanceof Error ? err.message : "Budget lookup failed")
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    })()

    return () => controller.abort()
  }, [projectId, budgetSubChapter, resourceId])

  return { data, loading, error }
}

export function PoCreationSidebar({
  supplierId,
  itemId,
  projectId,
  budgetSubChapter,
  resourceId,
  enteredUnitPrice,
}: PoCreationSidebarProps) {
  const vendor = useVendorHealth(supplierId ?? null)
  const history = useHistoricalStats(itemId ?? null)
  const budget = useBudgetRemaining({
    projectId: projectId ?? null,
    budgetSubChapter: budgetSubChapter ?? null,
    resourceId: resourceId ?? null,
  })

  const variance = React.useMemo(() => {
    if (!history.data || !enteredUnitPrice || history.data.avgPrice <= 0) return null
    return calculatePriceVariance({
      enteredPrice: enteredUnitPrice,
      baseline: history.data.avgPrice,
    })
  }, [history.data, enteredUnitPrice])

  const creditScore = Number(vendor.data?.avgCreditScore ?? 0)
  const onTimePct = Number(vendor.data?.onTimeDeliveryPct ?? 0)
  const vendorTone: keyof typeof HOLDEN_SLATE_CHIP_TONES =
    creditScore >= 80 || onTimePct >= 90
      ? "success"
      : creditScore >= 60 || onTimePct >= 70
      ? "warning"
      : creditScore > 0 || onTimePct > 0
      ? "danger"
      : "neutral"

  const budgetRatio =
    budget.data && budget.data.budget > 0
      ? Math.max(0, Math.min(1, budget.data.remaining / budget.data.budget))
      : 0

  return (
    <div className="space-y-3">
      <Tile
        title="Vendor Health"
        icon={<ShieldCheck className="size-3.5" />}
        loading={vendor.loading}
        tone="tint"
      >
        {!supplierId ? (
          <p className="rounded-xl border border-dashed border-border bg-card/60 px-2 py-2 text-[11px] text-muted-foreground">
            בחרו ספק להצגת בריאות התקשרות.
          </p>
        ) : vendor.error ? (
          <p className="flex items-start gap-1 rounded-xl border border-rose-200 bg-rose-50 px-2 py-1.5 text-[11px] text-rose-800">
            <AlertTriangle className="mt-0.5 size-3" /> {vendor.error}
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-xl border border-border bg-card p-2">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Credit Score
              </p>
              <p className="font-mono font-semibold text-foreground">
                {creditScore > 0 ? creditScore.toFixed(1) : "—"}
              </p>
            </div>
            <div className="rounded-xl border border-border bg-card p-2">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                On-Time Delivery
              </p>
              <p className="font-mono font-semibold text-foreground">
                {onTimePct > 0 ? `${onTimePct.toFixed(1)}%` : "—"}
              </p>
            </div>
            <div className="col-span-2 flex items-center justify-between rounded-xl border border-border bg-card p-2 text-[11px]">
              <span className="text-muted-foreground">Payment Terms</span>
              <span className="font-mono text-foreground">
                {vendor.data?.paymentTerms ?? "—"}
              </span>
            </div>
            <div className="col-span-2">
              <span
                className={cn(
                  HOLDEN_SLATE_CHIP_BASE,
                  HOLDEN_SLATE_CHIP_TONES[vendorTone]
                )}
              >
                {vendorTone === "success"
                  ? "Healthy"
                  : vendorTone === "warning"
                  ? "Watch"
                  : vendorTone === "danger"
                  ? "At-Risk"
                  : "No Data"}
              </span>
            </div>
          </div>
        )}
      </Tile>

      <Tile
        title="Budget Remaining"
        icon={<Banknote className="size-3.5" />}
        loading={budget.loading}
      >
        {!projectId ? (
          <p className="rounded-xl border border-dashed border-border bg-card/60 px-2 py-2 text-[11px] text-muted-foreground">
            בחרו פרויקט להצגת יתרה תקציבית.
          </p>
        ) : budget.error ? (
          <p className="flex items-start gap-1 rounded-xl border border-rose-200 bg-rose-50 px-2 py-1.5 text-[11px] text-rose-800">
            <AlertTriangle className="mt-0.5 size-3" /> {budget.error}
          </p>
        ) : budget.data ? (
          <div className="space-y-2 text-xs">
            <p className="font-mono text-sm font-semibold text-foreground">
              {formatIls1Decimal(budget.data.remaining)}
            </p>
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div
                className={cn(
                  "h-full rounded-full transition-all",
                  budgetRatio >= 0.25
                    ? "bg-emerald-500"
                    : budgetRatio >= 0.1
                    ? "bg-amber-500"
                    : "bg-rose-500"
                )}
                style={{ width: `${Math.round(budgetRatio * 100)}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-[11px] text-muted-foreground">
              <span>
                Budget:{" "}
                <span className="font-mono text-foreground">
                  {formatIls1Decimal(budget.data.budget)}
                </span>
              </span>
              <span>
                Committed:{" "}
                <span className="font-mono text-foreground">
                  {formatIls1Decimal(budget.data.actual)}
                </span>
              </span>
            </div>
            {budgetSubChapter || resourceId ? (
              <p className="text-[10px] text-muted-foreground">
                Scope:{" "}
                <span className="font-mono text-foreground">
                  {budgetSubChapter ?? "—"} / {resourceId ?? "—"}
                </span>
              </p>
            ) : null}
          </div>
        ) : (
          <p className="text-[11px] text-muted-foreground">אין נתוני תקציב.</p>
        )}
      </Tile>

      <Tile
        title="Historical Price Variance"
        icon={<LineChart className="size-3.5" />}
        loading={history.loading}
      >
        {!itemId ? (
          <p className="rounded-xl border border-dashed border-border bg-card/60 px-2 py-2 text-[11px] text-muted-foreground">
            בחרו פריט להצגת היסטוריית מחירים.
          </p>
        ) : history.error ? (
          <p className="flex items-start gap-1 rounded-xl border border-rose-200 bg-rose-50 px-2 py-1.5 text-[11px] text-rose-800">
            <AlertTriangle className="mt-0.5 size-3" /> {history.error}
          </p>
        ) : history.data ? (
          <div className="space-y-2">
            <div className="grid grid-cols-3 gap-2 text-[11px]">
              <div className="rounded-xl border border-border bg-card p-2">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Avg
                </p>
                <p className="font-mono font-semibold text-foreground">
                  {formatIls1Decimal(history.data.avgPrice)}
                </p>
              </div>
              <div className="rounded-xl border border-border bg-card p-2">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Last
                </p>
                <p className="font-mono font-semibold text-foreground">
                  {formatIls1Decimal(history.data.lastPaidPrice)}
                </p>
              </div>
              <div className="rounded-xl border border-border bg-card p-2">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Samples
                </p>
                <p className="font-mono font-semibold text-foreground">
                  {history.data.sampleCount.toFixed(0)}
                </p>
              </div>
            </div>
            {variance ? (
              <div
                className={cn(
                  "rounded-xl border p-2 text-[11px]",
                  variance.isHighVariance
                    ? variance.variance > 0
                      ? "border-rose-200 bg-rose-50 text-rose-900"
                      : "border-amber-200 bg-amber-50 text-amber-900"
                    : "border-emerald-200 bg-emerald-50 text-emerald-900"
                )}
              >
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1 text-[10px] uppercase tracking-wider">
                    <Gauge className="size-3" />
                    Entered vs Avg
                  </span>
                  <span className="font-mono font-semibold">
                    {formatSignedPercent1Decimal(variance.variance * 100)}
                  </span>
                </div>
                <p className="mt-1 font-mono">
                  Δ {formatIls1Decimal(variance.delta)}
                </p>
                {variance.isHighVariance ? (
                  <p className="mt-1 text-[10px]">
                    חריגה מעל {Math.round(HIGH_VARIANCE_THRESHOLD * 100)}% מדורשת אישור מנהל.
                  </p>
                ) : null}
              </div>
            ) : (
              <p className="rounded-xl border border-dashed border-border bg-card/60 px-2 py-1.5 text-[11px] text-muted-foreground">
                הזינו מחיר יחידה להשוואה מול הממוצע ההיסטורי.
              </p>
            )}
          </div>
        ) : (
          <p className="text-[11px] text-muted-foreground">אין נתונים היסטוריים.</p>
        )}
      </Tile>
    </div>
  )
}
