"use client"

/**
 * Supplier Master/Detail → Tab: ביצועים (Performance)
 *
 * Phase 7.3 — Vendor Intelligence UI
 *
 * Displays vendor scorecard metrics fetched from:
 *   GET /api/master-data/suppliers/[id]/score
 *
 * Sections:
 *   1. Header — Qualification Status badge + last-calculated timestamp
 *   2. KPI Gauges — On-time delivery / Quality / Price Variance (3 cards)
 *   3. Lead Time — average lead time indicator
 *   4. Negotiation Advisor — derived signal based on price variance trend
 *   5. Refresh trigger button
 *
 * Color coding for KPI percentages:
 *   ≥ 85%   → green  (excellent)
 *   70–84%  → amber  (acceptable)
 *   < 70%   → red    (needs attention)
 *
 * For price variance:
 *   > +5%   → red    (overcharged)
 *   -5%..+5% → green (fair)
 *   < -5%   → blue   (below market / discount)
 */

import * as React from "react"
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  BarChart2,
  CheckCircle2,
  Clock,
  Minus,
  RefreshCw,
  ShieldCheck,
  ShieldX,
  Star,
  TrendingDown,
  TrendingUp,
} from "lucide-react"

import {
  MasterDetailTabEmpty,
  MasterDetailTabError,
  MasterDetailTabLoading,
} from "@/components/infrastructure/master-detail/master-detail-shell"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { masterDataFetch } from "@/lib/erp/master-data-browser"
import type { SupplierScoreResponse } from "@/app/api/master-data/suppliers/[id]/score/route"
import type { SupplierScore } from "@/lib/procurement/vendor-scoring"
import { getNegotiationSignal } from "@/lib/procurement/vendor-scoring"

// ─────────────────────────────────────────────────────────────────────────────
// Qualification status display config
// ─────────────────────────────────────────────────────────────────────────────

const QUAL_STATUS_CONFIG: Record<
  string,
  { label: string; variant: "default" | "secondary" | "destructive" | "outline"; icon: React.ElementType }
> = {
  APPROVED: {
    label: "מאושר",
    variant: "default",
    icon: ShieldCheck,
  },
  PREFERRED: {
    label: "מועדף",
    variant: "default",
    icon: Star,
  },
  PROBATION: {
    label: "פרובציה",
    variant: "secondary",
    icon: AlertTriangle,
  },
  BLOCKED: {
    label: "חסום",
    variant: "destructive",
    icon: ShieldX,
  },
}

// ─────────────────────────────────────────────────────────────────────────────
// KPI gauge helpers
// ─────────────────────────────────────────────────────────────────────────────

function getKpiColor(pct: number | null): string {
  if (pct === null) return "bg-slate-200 dark:bg-slate-700"
  if (pct >= 85) return "bg-emerald-500"
  if (pct >= 70) return "bg-amber-500"
  return "bg-rose-500"
}

function getKpiTextColor(pct: number | null): string {
  if (pct === null) return "text-slate-400"
  if (pct >= 85) return "text-emerald-600 dark:text-emerald-400"
  if (pct >= 70) return "text-amber-600 dark:text-amber-400"
  return "text-rose-600 dark:text-rose-400"
}

function getKpiBadge(pct: number | null): string {
  if (pct === null) return "אין נתונים"
  if (pct >= 85) return "מצוין"
  if (pct >= 70) return "סביר"
  return "דרוש שיפור"
}

// ─────────────────────────────────────────────────────────────────────────────
// Price variance helpers
// ─────────────────────────────────────────────────────────────────────────────

function getPriceVarianceColor(pct: number | null): string {
  if (pct === null) return "text-slate-400"
  if (pct > 5) return "text-rose-600 dark:text-rose-400"
  if (pct < -5) return "text-blue-600 dark:text-blue-400"
  return "text-emerald-600 dark:text-emerald-400"
}

function formatPriceVariance(pct: number | null): string {
  if (pct === null) return "—"
  const sign = pct > 0 ? "+" : ""
  return `${sign}${pct.toFixed(2)}%`
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

function KpiGaugeCard({
  title,
  value,
  icon: Icon,
  description,
}: {
  title: string
  value: number | null
  icon: React.ElementType
  description?: string
}) {
  const displayPct = value !== null ? Math.min(100, Math.max(0, value)) : 0
  const color = getKpiColor(value)
  const textColor = getKpiTextColor(value)

  return (
    <Card className="flex-1 min-w-0">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
          <Icon className="h-4 w-4" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-end justify-between">
          <span className={`text-3xl font-bold tabular-nums ${textColor}`}>
            {value !== null ? `${value.toFixed(1)}%` : "—"}
          </span>
          <span className="text-xs text-muted-foreground pb-1">
            {getKpiBadge(value)}
          </span>
        </div>
        <Progress
          value={displayPct}
          className={`h-2 [&>div]:${color}`}
        />
        {description && (
          <p className="text-xs text-muted-foreground leading-relaxed">{description}</p>
        )}
      </CardContent>
    </Card>
  )
}

function NegotiationAdvisorCard({ score }: { score: SupplierScore }) {
  const signal = getNegotiationSignal(score.priceVariancePct)

  const configs = {
    OVERPRICED: {
      icon: TrendingUp,
      title: "הספק גובה מעל הסכמי ההזמנה",
      detail: `חריגה ממוצעת של ${formatPriceVariance(score.priceVariancePct)} מעל מחיר ההזמנה. מומלץ לנהל משא ומתן על מחירים.`,
      bgClass: "bg-rose-50 border-rose-200 dark:bg-rose-950/30 dark:border-rose-800",
      iconClass: "text-rose-600 dark:text-rose-400",
    },
    BELOW_MARKET: {
      icon: TrendingDown,
      title: "הספק גובה מתחת למחיר ההזמנה",
      detail: `חיסכון ממוצע של ${formatPriceVariance(score.priceVariancePct)} מתחת למחיר ההזמנה. ספק זה מציע ערך טוב.`,
      bgClass: "bg-blue-50 border-blue-200 dark:bg-blue-950/30 dark:border-blue-800",
      iconClass: "text-blue-600 dark:text-blue-400",
    },
    FAIRLY_PRICED: {
      icon: CheckCircle2,
      title: "מחיר תואם הסכמי ההזמנה",
      detail: `חריגה ממוצעת של ${formatPriceVariance(score.priceVariancePct)} — בתוך טווח הסטייה המקובל (±5%).`,
      bgClass: "bg-emerald-50 border-emerald-200 dark:bg-emerald-950/30 dark:border-emerald-800",
      iconClass: "text-emerald-600 dark:text-emerald-400",
    },
    INSUFFICIENT_DATA: {
      icon: Minus,
      title: "אין נתונים מספיקים לניתוח מחיר",
      detail: "נדרשות לפחות 3 קבלות סחורה תואמות לחישוב חריגת מחיר.",
      bgClass: "bg-slate-50 border-slate-200 dark:bg-slate-900 dark:border-slate-700",
      iconClass: "text-slate-400",
    },
  } as const

  const cfg = configs[signal]
  const CfgIcon = cfg.icon

  return (
    <Card className={`border ${cfg.bgClass}`}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <BarChart2 className="h-4 w-4 text-muted-foreground" />
          יועץ משא ומתן
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-start gap-3">
          <CfgIcon className={`h-5 w-5 mt-0.5 shrink-0 ${cfg.iconClass}`} />
          <div>
            <p className="text-sm font-medium">{cfg.title}</p>
            <p className="text-xs text-muted-foreground mt-1">{cfg.detail}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Qualification status badge
// ─────────────────────────────────────────────────────────────────────────────

function QualificationBadge({ status }: { status: string }) {
  const cfg = QUAL_STATUS_CONFIG[status] ?? QUAL_STATUS_CONFIG.APPROVED
  const Icon = cfg.icon
  return (
    <Badge variant={cfg.variant} className="flex items-center gap-1 text-xs">
      <Icon className="h-3 w-3" />
      {cfg.label}
    </Badge>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────

interface SupplierPerformanceTabProps {
  supplierId: string | null
  /** Qualification status read from the parent supplier detail (to avoid
   *  an extra fetch; falls back to a score endpoint attribute). */
  qualificationStatus?: string | null
}

export function SupplierPerformanceTab({
  supplierId,
  qualificationStatus,
}: SupplierPerformanceTabProps) {
  const [score, setScore] = React.useState<SupplierScore | null>(null)
  const [qualStatus, setQualStatus] = React.useState<string>(qualificationStatus ?? "APPROVED")
  const [error, setError] = React.useState<string | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [refreshing, setRefreshing] = React.useState(false)

  const fetchScore = React.useCallback(
    async (forceRefresh = false) => {
      if (!supplierId) return
      if (forceRefresh) setRefreshing(true)
      else setLoading(true)
      setError(null)

      const url = `/api/master-data/suppliers/${supplierId}/score${forceRefresh ? "?refresh=true" : ""}`
      try {
        const res = await masterDataFetch<SupplierScoreResponse>(url)
        setScore(res.data)
        // If qualification status wasn't passed as prop, we can infer it via
        // the supplier details. It's not in the score response itself, so
        // we keep whatever was passed, or the default.
      } catch (err) {
        setError(err instanceof Error ? err.message : "שגיאה בטעינת ביצועי הספק")
      } finally {
        setLoading(false)
        setRefreshing(false)
      }
    },
    [supplierId],
  )

  React.useEffect(() => {
    if (qualificationStatus) setQualStatus(qualificationStatus)
  }, [qualificationStatus])

  React.useEffect(() => {
    fetchScore()
  }, [fetchScore])

  if (!supplierId) {
    return <MasterDetailTabEmpty>בחר ספק מהרשימה לצפייה בביצועים</MasterDetailTabEmpty>
  }

  if (loading) return <MasterDetailTabLoading />
  if (error) return <MasterDetailTabError>{error}</MasterDetailTabError>

  // ── Insufficient data state ───────────────────────────────────────────────
  if (!score || score.totalGrsEvaluated === 0) {
    return (
      <div className="p-6 space-y-4" dir="rtl">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <BarChart2 className="h-5 w-5 text-muted-foreground" />
            <h2 className="font-semibold text-base">ביצועי ספק</h2>
            <QualificationBadge status={qualStatus} />
          </div>
          <Button
            variant="outline"
            size="sm"
            disabled={refreshing}
            onClick={() => fetchScore(true)}
            className="flex items-center gap-2"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
            חשב מחדש
          </Button>
        </div>
        <MasterDetailTabEmpty>אין נתוני קבלת סחורה זמינים לחישוב ביצועים</MasterDetailTabEmpty>
      </div>
    )
  }

  const lastCalcDate = new Date(score.lastCalculatedAt).toLocaleString("he-IL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })

  return (
    <div className="p-4 md:p-6 space-y-5" dir="rtl">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <BarChart2 className="h-5 w-5 text-muted-foreground" />
          <h2 className="font-semibold text-base">ביצועי ספק</h2>
          <QualificationBadge status={qualStatus} />
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground">
            חושב: {lastCalcDate} · מבוסס על {score.totalGrsEvaluated} קבלות ({score.scorePeriodMonths} חודשים)
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={refreshing}
            onClick={() => fetchScore(true)}
            className="flex items-center gap-2"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
            {refreshing ? "מחשב..." : "חשב מחדש"}
          </Button>
        </div>
      </div>

      {/* ── KPI Gauges ──────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row gap-4">
        <KpiGaugeCard
          title="אספקה בזמן"
          value={score.onTimeDeliveryPct}
          icon={Clock}
          description={
            score.totalLinesWithDate > 0
              ? `מבוסס על ${score.totalLinesWithDate} שורות עם תאריך אספקה מתוכנן`
              : undefined
          }
        />
        <KpiGaugeCard
          title="ציון איכות"
          value={score.qualityScore}
          icon={CheckCircle2}
          description="% מכמות שהתקבלה ואושרה (לא נדחתה)"
        />
        {/* Price variance — shown as a special card, not as a gauge pct */}
        <Card className="flex-1 min-w-0">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              חריגת מחיר
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-end justify-between">
              <span
                className={`text-3xl font-bold tabular-nums ${getPriceVarianceColor(score.priceVariancePct)}`}
              >
                {formatPriceVariance(score.priceVariancePct)}
              </span>
              {score.priceVariancePct !== null && (
                <span className="text-xs text-muted-foreground pb-1 flex items-center gap-1">
                  {score.priceVariancePct > 5 ? (
                    <ArrowUp className="h-3 w-3 text-rose-500" />
                  ) : score.priceVariancePct < -5 ? (
                    <ArrowDown className="h-3 w-3 text-blue-500" />
                  ) : (
                    <Minus className="h-3 w-3 text-emerald-500" />
                  )}
                  {score.priceVariancePct > 5
                    ? "חריגה גבוהה"
                    : score.priceVariancePct < -5
                      ? "מתחת לשוק"
                      : "תקין"}
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              % סטייה ממוצע ממחיר ההזמנה המקורי. חיובי = חריגה מעל; שלילי = זול מהסכם.
            </p>
          </CardContent>
        </Card>
      </div>

      {/* ── Lead Time ─────────────────────────────────────────────────────── */}
      {score.avgLeadTimeDays !== null && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Clock className="h-4 w-4" />
              זמן אספקה ממוצע
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4">
              <span className="text-2xl font-bold tabular-nums">
                {score.avgLeadTimeDays.toFixed(1)}
              </span>
              <span className="text-sm text-muted-foreground">ימים מיצירת ההזמנה לקבלת הסחורה</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Negotiation Advisor ─────────────────────────────────────────── */}
      <NegotiationAdvisorCard score={score} />

      {/* ── Data coverage note ─────────────────────────────────────────── */}
      <p className="text-xs text-muted-foreground text-left">
        * ציונים ריקים (—) מצביעים על נתונים לא מספיקים — נדרשות לפחות 3 קבלות סחורה בחלון הזמן של {score.scorePeriodMonths} חודשים.
      </p>
    </div>
  )
}
