"use client"

/**
 * PoThreeWayMatchTab — Phase 4.3
 *
 * טאב "התאמה 3-כיוונית" על מסך פרט ה-PO.
 * מציג ויזואליזציה של חשבוניות כנגד ה-PO, עם:
 *   - סיכום כולל (כרטיסיות KPI)
 *   - פירוט חשבוניות עם ציון variance לכל אחת
 *   - צבע-קוד לפי מצב ההתאמה (מושלם / סטייה / לא הותאם)
 */

import * as React from "react"
import { AlertTriangle, CheckCircle2, GitMerge, Loader2, Play, XCircle } from "lucide-react"
import { toast } from "sonner"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { masterDataFetch } from "@/lib/erp/master-data-browser"
import { cn } from "@/lib/utils"

// ── Types ──────────────────────────────────────────────────────────────────

type InvoiceMatchRow = {
  id: string
  invoiceNumber: string
  status: string
  invoiceDate: string | null
  totalAmount: number
  priceVarianceAmount: number
  totalInvoiceLines: number
  matchedLines: number
  perfectLines: number
  varianceLines: number
  unmatchedLines: number
  varianceImpactValue: number
  needsFirstMatch: boolean
}

// ── Formatters ─────────────────────────────────────────────────────────────

const ILS_FMT = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 0,
})

const DATE_FMT = new Intl.DateTimeFormat("he-IL", { dateStyle: "short" })

function formatMoney(n: number) {
  try { return ILS_FMT.format(n) } catch { return `${n.toLocaleString("he-IL")} ₪` }
}

function formatDate(d: string | null) {
  if (!d) return "—"
  try { return DATE_FMT.format(new Date(d)) } catch { return d }
}

// ── Match quality helpers ──────────────────────────────────────────────────

type MatchQuality = "perfect" | "variance" | "unmatched" | "partial" | "needs_match"

function getMatchQuality(row: InvoiceMatchRow): MatchQuality {
  if (row.needsFirstMatch) return "needs_match"
  if (row.totalInvoiceLines === 0) return "unmatched"
  if (row.unmatchedLines === row.totalInvoiceLines) return "unmatched"
  if (row.varianceLines > 0 || row.priceVarianceAmount !== 0) return "variance"
  if (row.matchedLines < row.totalInvoiceLines) return "partial"
  return "perfect"
}

function MatchQualityBadge({ quality }: { quality: MatchQuality }) {
  const config = {
    perfect: {
      label: "מושלם",
      icon: <CheckCircle2 className="size-3" />,
      cls: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
    },
    variance: {
      label: "סטייה",
      icon: <AlertTriangle className="size-3" />,
      cls: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
    },
    unmatched: {
      label: "לא הותאם",
      icon: <XCircle className="size-3" />,
      cls: "bg-rose-500/10 text-rose-700 dark:text-rose-400",
    },
    partial: {
      label: "חלקי",
      icon: <AlertTriangle className="size-3" />,
      cls: "bg-sky-500/10 text-sky-700 dark:text-sky-400",
    },
    needs_match: {
      label: "טרם הופעל",
      icon: <Play className="size-3" />,
      cls: "bg-slate-500/10 text-slate-700 dark:text-slate-300",
    },
  } as const

  const c = config[quality]
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium",
        c.cls,
      )}
    >
      {c.icon}
      {c.label}
    </span>
  )
}

// ── KPI card ───────────────────────────────────────────────────────────────

function MatchKpi({
  label,
  value,
  tone,
}: {
  label: string
  value: string | number
  tone?: "success" | "warning" | "danger" | "neutral"
}) {
  const toneClass = {
    success: "text-emerald-600 dark:text-emerald-400",
    warning: "text-amber-600 dark:text-amber-400",
    danger: "text-rose-600 dark:text-rose-400",
    neutral: "text-muted-foreground",
  }[tone ?? "neutral"]

  return (
    <Card className="flex-1 min-w-[120px]">
      <CardContent className="p-3">
        <p className="text-[10px] text-muted-foreground">{label}</p>
        <p className={cn("mt-1 text-xl font-bold tabular-nums", toneClass)}>{value}</p>
      </CardContent>
    </Card>
  )
}

// ── Invoice detail row ─────────────────────────────────────────────────────

function InvoiceMatchCard({
  row,
  onRunMatch,
  matchLoading,
}: {
  row: InvoiceMatchRow
  onRunMatch: (id: string) => void
  matchLoading: boolean
}) {
  const quality = getMatchQuality(row)
  const matchPct =
    row.totalInvoiceLines > 0
      ? Math.round((row.perfectLines / row.totalInvoiceLines) * 100)
      : 0

  return (
    <Card
      className={cn(
        "border",
        quality === "perfect" && "border-emerald-200 dark:border-emerald-900/40",
        quality === "variance" && "border-amber-200 dark:border-amber-900/40",
        quality === "unmatched" && "border-rose-200 dark:border-rose-900/40",
        quality === "needs_match" && "border-slate-200 dark:border-slate-800",
      )}
    >
      <CardHeader className="flex flex-row items-center justify-between p-3 pb-0">
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs font-semibold">{row.invoiceNumber}</span>
          <MatchQualityBadge quality={quality} />
        </div>
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <span>{formatDate(row.invoiceDate)}</span>
          <span className="font-semibold text-foreground">{formatMoney(row.totalAmount)}</span>
        </div>
      </CardHeader>

      <CardContent className="p-3 pt-2">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-[11px]">
          {/* Match progress bar */}
          {!row.needsFirstMatch && row.totalInvoiceLines > 0 ? (
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">שורות מותאמות:</span>
              <div className="h-2 w-24 overflow-hidden rounded-full bg-muted">
                <div
                  className={cn(
                    "h-full rounded-full transition-all",
                    matchPct === 100
                      ? "bg-emerald-500"
                      : matchPct > 50
                        ? "bg-amber-500"
                        : "bg-rose-500",
                  )}
                  style={{ width: `${matchPct}%` }}
                />
              </div>
              <span className="tabular-nums font-medium">
                {row.perfectLines}/{row.totalInvoiceLines} ({matchPct}%)
              </span>
            </div>
          ) : null}

          {/* Variance amount */}
          {row.priceVarianceAmount !== 0 ? (
            <div className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
              <AlertTriangle className="size-3" />
              <span>סטיית מחיר:</span>
              <span className="font-semibold tabular-nums">
                {formatMoney(Math.abs(row.priceVarianceAmount))}
              </span>
              <span className="text-muted-foreground">
                ({row.priceVarianceAmount > 0 ? "חיוב יתר" : "זיכוי"})
              </span>
            </div>
          ) : null}

          {/* Variance impact */}
          {row.varianceLines > 0 ? (
            <div className="flex items-center gap-1 text-amber-700 dark:text-amber-300">
              <span>{row.varianceLines} שורות עם סטייה</span>
              {row.varianceImpactValue > 0 ? (
                <span className="text-muted-foreground">
                  (השפעה: {formatMoney(row.varianceImpactValue)})
                </span>
              ) : null}
            </div>
          ) : null}

          {/* Run match button */}
          {row.needsFirstMatch ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={(e) => {
                e.stopPropagation()
                onRunMatch(row.id)
              }}
              disabled={matchLoading}
              className="h-6 gap-1 px-2 text-[10px]"
            >
              {matchLoading ? (
                <Loader2 className="size-3 animate-spin" aria-hidden />
              ) : (
                <Play className="size-3" aria-hidden />
              )}
              הפעל 3-Way Match
            </Button>
          ) : null}
        </div>
      </CardContent>
    </Card>
  )
}

// ── Main component ─────────────────────────────────────────────────────────

export function PoThreeWayMatchTab({ poId }: { poId: string }) {
  const [rows, setRows] = React.useState<InvoiceMatchRow[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [runningMatchId, setRunningMatchId] = React.useState<string | null>(null)

  const reload = React.useCallback(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    masterDataFetch<InvoiceMatchRow[]>(
      `/api/procurement/orders/${encodeURIComponent(poId)}/invoices`,
    )
      .then((data) => {
        if (cancelled) return
        setRows(data)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : "טעינת נתוני ההתאמה נכשלה")
      })
      .finally(() => {
        if (cancelled) return
        setLoading(false)
      })
    return () => { cancelled = true }
  }, [poId])

  React.useEffect(() => {
    const cleanup = reload()
    return cleanup
  }, [reload])

  const runMatch = React.useCallback(
    async (invoiceId: string) => {
      if (runningMatchId) return
      setRunningMatchId(invoiceId)
      try {
        const res = await fetch(
          `/api/procurement/orders/${encodeURIComponent(poId)}/invoices/${encodeURIComponent(invoiceId)}/match`,
          { method: "POST", credentials: "same-origin" },
        )
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: string }
          throw new Error(body.error ?? `שגיאת שרת ${res.status}`)
        }
        toast.success("3-Way Match הושלם בהצלחה")
        reload()
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "הרצת 3-Way Match נכשלה")
      } finally {
        setRunningMatchId(null)
      }
    },
    [poId, runningMatchId, reload],
  )

  // ── KPI aggregation ──────────────────────────────────────────────────

  const kpis = React.useMemo(() => {
    const total = rows.length
    let perfect = 0
    let withVariance = 0
    let unmatched = 0
    let totalVarianceAmount = 0

    for (const r of rows) {
      const q = getMatchQuality(r)
      if (q === "perfect") perfect++
      else if (q === "variance" || q === "partial") withVariance++
      else unmatched++
      totalVarianceAmount += Math.abs(r.priceVarianceAmount)
    }

    return { total, perfect, withVariance, unmatched, totalVarianceAmount }
  }, [rows])

  // ── Loading / error states ───────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        טוען נתוני התאמה 3-כיוונית…
      </div>
    )
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="size-4" />
        <AlertDescription className="flex items-center justify-between gap-3">
          <span>{error}</span>
          <Button type="button" variant="outline" size="sm" onClick={reload}>
            נסה שוב
          </Button>
        </AlertDescription>
      </Alert>
    )
  }

  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-16 text-center text-sm text-muted-foreground">
        <GitMerge className="size-10 opacity-20" />
        <p className="font-medium">אין חשבוניות מקושרות להזמנה זו</p>
        <p className="text-xs">לאחר קישור חשבוניות ספק תוצג כאן ויזואליזציה של ה-3-Way Match.</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {/* KPI strip */}
      <section className="flex flex-wrap gap-3" aria-label="סיכום התאמה">
        <MatchKpi label="סה״כ חשבוניות" value={kpis.total} />
        <MatchKpi
          label="התאמה מושלמת"
          value={kpis.perfect}
          tone={kpis.perfect === kpis.total ? "success" : "neutral"}
        />
        <MatchKpi
          label="עם סטיות"
          value={kpis.withVariance}
          tone={kpis.withVariance > 0 ? "warning" : "neutral"}
        />
        <MatchKpi
          label="לא הותאמו"
          value={kpis.unmatched}
          tone={kpis.unmatched > 0 ? "danger" : "neutral"}
        />
        {kpis.totalVarianceAmount > 0 ? (
          <MatchKpi
            label="סכום סטיות כולל"
            value={formatMoney(kpis.totalVarianceAmount)}
            tone="warning"
          />
        ) : null}
      </section>

      {/* Invoice cards */}
      <section className="flex flex-col gap-3" aria-label="פירוט חשבוניות">
        {rows.map((row) => (
          <InvoiceMatchCard
            key={row.id}
            row={row}
            onRunMatch={(id) => void runMatch(id)}
            matchLoading={runningMatchId === row.id}
          />
        ))}
      </section>
    </div>
  )
}
