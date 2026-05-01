"use client"

/**
 * PoSmartPricingTab — Phase 7.13.1.B
 *
 * טאב "מחירים חכמים" במסך פרט PO. חושף בפני המשתמש את כל התמונה שה-
 * RPC `erp_compute_price_suggestions` יודע לייצר — דבר שעד היום הסתיר
 * ה-UI: מקור מחיר הנוכחי, חלופות מספקים אחרים, ויכולת להבין את סיבת
 * ה-escalation.
 *
 * תצוגה:
 *   • כל שורה → card ניתן להרחבה.
 *   • בעת פתיחה לראשונה, נשלח fetch ל-`/api/procurement/pricing/suggestions`
 *     עם itemId + supplierId + quantity של השורה. תוצאה נשמרת ב-cache לוקלי
 *     כל עוד ה-tab טעון (אין polling).
 *   • תצוגה של 3 מקורות: PRICELIST (מחירון), LAST_PURCHASE (רכישה אחרונה),
 *     BEST_OFFER_CROSS (חלופות). כל שורה עם delta% מול המחיר הנוכחי.
 *
 * פעולה "Accept alternative" (החלפת הספק בשורה) נדחתה ל-Phase עתידי:
 *   דורשת PUT endpoint על `erp_purchase_order_lines`, שאין כרגע.
 */

import * as React from "react"
import {
  AlertTriangle,
  BadgeCheck,
  ChevronDown,
  ChevronUp,
  Loader2,
  Sparkles,
  TrendingDown,
  TrendingUp,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { masterDataFetch } from "@/lib/erp/master-data-browser"
import type {
  PriceSuggestion,
  PriceSuggestionsResult,
  PriceSuggestionSource,
} from "@/lib/procurement/pricing"
import { cn } from "@/lib/utils"

// ============================================================================
// Types
// ============================================================================

export type SmartPricingLineInput = {
  lineId: string
  itemId: string | null
  itemNumber: string | null
  description: string
  quantity: number
  unitPrice: number
  priceDeviationPct: number | null
  requiresEscalation: boolean
  priceSource: string | null
}

const SOURCE_LABEL: Record<PriceSuggestionSource, string> = {
  SUPPLIER_PRICELIST: "מחירון ספק",
  LAST_PURCHASE: "רכישה אחרונה",
  BEST_OFFER_CROSS: "הצעה מספק אחר",
}

const SOURCE_BADGE_CLASS: Record<PriceSuggestionSource, string> = {
  SUPPLIER_PRICELIST: "border-sky-400/40 bg-sky-500/10 text-sky-800",
  LAST_PURCHASE: "border-slate-400/40 bg-slate-400/10 text-slate-800",
  BEST_OFFER_CROSS: "border-fuchsia-400/40 bg-fuchsia-500/10 text-fuchsia-800",
}

const numberFormatter = new Intl.NumberFormat("he-IL", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const percentFormatter = new Intl.NumberFormat("he-IL", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 2,
})

// ============================================================================
// Main
// ============================================================================

export function PoSmartPricingTab({
  poSupplierId,
  poSupplierName,
  currency,
  poTotalDeviationPct,
  requiresPoEscalation,
  lines,
}: {
  poSupplierId: string | null
  poSupplierName: string | null
  currency: string
  poTotalDeviationPct: number | null
  requiresPoEscalation: boolean
  lines: SmartPricingLineInput[]
}) {
  if (!poSupplierId) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-lg border-2 border-dashed border-border bg-muted/20 p-10 text-center">
        <AlertTriangle className="size-6 text-amber-600" aria-hidden />
        <p className="text-sm text-muted-foreground">
          לא ניתן לבצע השוואת מחירים — להזמנה אין ספק משויך.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <PoDeviationSummary
        supplierName={poSupplierName}
        poTotalDeviationPct={poTotalDeviationPct}
        requiresPoEscalation={requiresPoEscalation}
      />

      {lines.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          אין שורות בהזמנה.
        </p>
      ) : (
        <ul className="space-y-2">
          {lines.map((line, index) => (
            <LineSmartPricingCard
              key={line.lineId}
              line={line}
              index={index}
              supplierId={poSupplierId}
              currency={currency}
            />
          ))}
        </ul>
      )}
    </div>
  )
}

// ============================================================================
// PoDeviationSummary — top-level bar showing weighted PO deviation
// ============================================================================

function PoDeviationSummary({
  supplierName,
  poTotalDeviationPct,
  requiresPoEscalation,
}: {
  supplierName: string | null
  poTotalDeviationPct: number | null
  requiresPoEscalation: boolean
}) {
  const hasDeviation =
    poTotalDeviationPct != null && Number.isFinite(poTotalDeviationPct)
  return (
    <section
      className={cn(
        "flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4",
        requiresPoEscalation
          ? "border-amber-500/40 bg-amber-500/5"
          : "border-border bg-card"
      )}
    >
      <div className="flex items-center gap-3">
        <span
          className={cn(
            "flex size-9 flex-none items-center justify-center rounded-lg",
            requiresPoEscalation
              ? "bg-amber-500/20 text-amber-700"
              : "bg-primary/10 text-primary"
          )}
          aria-hidden
        >
          {requiresPoEscalation ? (
            <AlertTriangle className="size-4" />
          ) : (
            <Sparkles className="size-4" />
          )}
        </span>
        <div className="space-y-0.5">
          <p className="text-sm font-semibold">
            {requiresPoEscalation
              ? "ההזמנה חורגת מסף ה-PO המותר"
              : "ההזמנה תואמת את תקרת המחירים"}
          </p>
          <p className="text-xs text-muted-foreground">
            השוואה מול ספקים חלופיים ב-{supplierName ?? "הספק הנוכחי"} • חישוב
            משוקלל על כל השורות.
          </p>
        </div>
      </div>
      {hasDeviation ? (
        <div className="text-end">
          <p className="text-xs text-muted-foreground">חריגת PO משוקללת</p>
          <p
            className={cn(
              "font-mono text-xl font-bold tabular-nums",
              requiresPoEscalation ? "text-amber-700" : "text-muted-foreground"
            )}
          >
            {poTotalDeviationPct!.toFixed(2)}%
          </p>
        </div>
      ) : null}
    </section>
  )
}

// ============================================================================
// LineSmartPricingCard
// ============================================================================

function LineSmartPricingCard({
  line,
  index,
  supplierId,
  currency,
}: {
  line: SmartPricingLineInput
  index: number
  supplierId: string
  currency: string
}) {
  const [expanded, setExpanded] = React.useState(false)
  const [loading, setLoading] = React.useState(false)
  const [data, setData] = React.useState<PriceSuggestionsResult | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  const canFetch = Boolean(line.itemId)

  const handleExpand = React.useCallback(async () => {
    const nextExpanded = !expanded
    setExpanded(nextExpanded)
    if (!nextExpanded || data || !canFetch || !line.itemId) return
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({
        itemId: line.itemId,
        supplierId,
        quantity: String(line.quantity),
      })
      const result = await masterDataFetch<PriceSuggestionsResult>(
        `/api/procurement/pricing/suggestions?${params.toString()}`
      )
      setData(result)
    } catch (e: unknown) {
      const message =
        e instanceof Error ? e.message : "טעינת הצעות מחיר נכשלה"
      setError(message)
    } finally {
      setLoading(false)
    }
  }, [canFetch, data, expanded, line.itemId, line.quantity, supplierId])

  const bestAlternativeDelta = React.useMemo<{
    absPerUnit: number
    pctPerUnit: number
    totalSavings: number
  } | null>(() => {
    const best = data?.bestAlternative
    if (!best || !Number.isFinite(best.unitPrice)) return null
    const diff = line.unitPrice - best.unitPrice
    if (diff <= 0) return null
    return {
      absPerUnit: diff,
      pctPerUnit: (diff / line.unitPrice) * 100,
      totalSavings: diff * line.quantity,
    }
  }, [data?.bestAlternative, line.quantity, line.unitPrice])

  return (
    <li
      className={cn(
        "overflow-hidden rounded-lg border bg-card",
        line.requiresEscalation
          ? "border-amber-500/40"
          : "border-border"
      )}
    >
      <button
        type="button"
        onClick={() => void handleExpand()}
        className="flex w-full items-center gap-3 px-4 py-3 text-start hover:bg-muted/30"
      >
        <span className="inline-flex size-7 flex-none items-center justify-center rounded-md bg-muted text-xs font-medium tabular-nums text-muted-foreground">
          {index + 1}
        </span>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 text-sm font-medium">
            <span className="truncate">{line.description}</span>
            {line.itemNumber ? (
              <span className="flex-none font-mono text-xs text-muted-foreground">
                · {line.itemNumber}
              </span>
            ) : null}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            כמות: {numberFormatter.format(line.quantity)} · מחיר יחידה:{" "}
            <span className="font-mono tabular-nums">
              {numberFormatter.format(line.unitPrice)} {currency}
            </span>
            {line.priceSource ? (
              <>
                {" "}
                · מקור:{" "}
                <span className="font-mono uppercase text-muted-foreground/80">
                  {line.priceSource}
                </span>
              </>
            ) : null}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {line.requiresEscalation ? (
            <Badge
              variant="outline"
              className="border-amber-500/40 bg-amber-500/10 font-medium text-amber-800"
            >
              <AlertTriangle className="me-1 size-3" aria-hidden />
              חורג{" "}
              {line.priceDeviationPct != null
                ? `${percentFormatter.format(line.priceDeviationPct)}%`
                : ""}
            </Badge>
          ) : line.priceDeviationPct != null && line.priceDeviationPct > 0 ? (
            <Badge
              variant="outline"
              className="border-slate-300/50 bg-slate-100/40 font-mono text-xs text-muted-foreground"
            >
              +{percentFormatter.format(line.priceDeviationPct)}%
            </Badge>
          ) : (
            <BadgeCheck className="size-4 text-emerald-600" aria-hidden />
          )}
          {expanded ? (
            <ChevronUp className="size-4 text-muted-foreground" aria-hidden />
          ) : (
            <ChevronDown className="size-4 text-muted-foreground" aria-hidden />
          )}
        </div>
      </button>

      {expanded ? (
        <div className="border-t border-border bg-muted/10 px-4 py-3">
          {!canFetch ? (
            <p className="text-xs text-muted-foreground">
              לא ניתן להציע מחירים לשורה — השורה לא קשורה ל-Master SKU.
            </p>
          ) : loading ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" aria-hidden />
              מחשב הצעות מחיר…
            </div>
          ) : error ? (
            <div className="flex items-center gap-2 text-xs text-destructive">
              <AlertTriangle className="size-3.5" aria-hidden />
              {error}
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => {
                  setData(null)
                  void handleExpand()
                }}
                className="h-6 px-2 text-xs"
              >
                נסה שוב
              </Button>
            </div>
          ) : data ? (
            <SmartPricingDetails
              line={line}
              currency={currency}
              data={data}
              bestAlternativeDelta={bestAlternativeDelta}
            />
          ) : null}
        </div>
      ) : null}
    </li>
  )
}

// ============================================================================
// SmartPricingDetails — the table shown when a line is expanded
// ============================================================================

function SmartPricingDetails({
  line,
  currency,
  data,
  bestAlternativeDelta,
}: {
  line: SmartPricingLineInput
  currency: string
  data: PriceSuggestionsResult
  bestAlternativeDelta: {
    absPerUnit: number
    pctPerUnit: number
    totalSavings: number
  } | null
}) {
  if (data.suggestions.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        אין הצעות מחיר לפריט זה בחלון {data.windowDays} ימים האחרונים.
      </p>
    )
  }

  return (
    <div className="space-y-3">
      {bestAlternativeDelta ? (
        <div className="rounded-md border border-fuchsia-400/40 bg-fuchsia-500/5 p-3">
          <p className="flex items-center gap-1.5 text-sm font-medium text-fuchsia-800">
            <Sparkles className="size-3.5" aria-hidden />
            פוטנציאל חיסכון בשורה זו
          </p>
          <p className="mt-1 text-xs text-fuchsia-900/80">
            בחירת הספק הזול ביותר תחסוך{" "}
            <strong className="font-mono tabular-nums">
              {numberFormatter.format(bestAlternativeDelta.totalSavings)} {currency}
            </strong>{" "}
            בסה&quot;כ ({percentFormatter.format(bestAlternativeDelta.pctPerUnit)}%
            ליחידה).
          </p>
        </div>
      ) : null}

      <div className="overflow-hidden rounded-md border border-border">
        <table className="w-full text-xs">
          <thead className="bg-muted/40 text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-start font-medium">מקור</th>
              <th className="px-3 py-2 text-start font-medium">ספק</th>
              <th className="px-3 py-2 text-end font-medium">מחיר יחידה</th>
              <th className="px-3 py-2 text-end font-medium">Δ לעומת נוכחי</th>
              <th className="px-3 py-2 text-start font-medium">זמן אספקה</th>
              <th className="px-3 py-2 text-start font-medium">הקשר</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {data.suggestions.map((s, i) => (
              <SuggestionRow
                key={`${s.source}-${s.supplierId}-${i}`}
                suggestion={s}
                currentUnitPrice={line.unitPrice}
                currency={currency}
              />
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-muted-foreground">
        חישוב מבוסס על חלון {data.windowDays} ימים ב-`erp_compute_price_suggestions`.
      </p>
    </div>
  )
}

function SuggestionRow({
  suggestion,
  currentUnitPrice,
  currency,
}: {
  suggestion: PriceSuggestion
  currentUnitPrice: number
  currency: string
}) {
  const delta = suggestion.unitPrice - currentUnitPrice
  const deltaPct = currentUnitPrice > 0 ? (delta / currentUnitPrice) * 100 : 0
  const isBetter = delta < -0.001
  const isWorse = delta > 0.001

  return (
    <tr>
      <td className="px-3 py-2">
        <Badge
          variant="outline"
          className={cn("font-normal", SOURCE_BADGE_CLASS[suggestion.source])}
        >
          {SOURCE_LABEL[suggestion.source]}
        </Badge>
      </td>
      <td className="px-3 py-2">
        <span className="truncate">{suggestion.supplierName}</span>
      </td>
      <td className="px-3 py-2 text-end font-mono tabular-nums">
        {numberFormatter.format(suggestion.unitPrice)}{" "}
        <span className="text-muted-foreground">{currency}</span>
      </td>
      <td
        className={cn(
          "px-3 py-2 text-end font-mono tabular-nums",
          isBetter && "text-emerald-700",
          isWorse && "text-rose-700",
          !isBetter && !isWorse && "text-muted-foreground"
        )}
      >
        {isBetter ? (
          <span className="inline-flex items-center gap-1">
            <TrendingDown className="size-3" aria-hidden />
            {percentFormatter.format(deltaPct)}%
          </span>
        ) : isWorse ? (
          <span className="inline-flex items-center gap-1">
            <TrendingUp className="size-3" aria-hidden />+
            {percentFormatter.format(deltaPct)}%
          </span>
        ) : (
          "0%"
        )}
      </td>
      <td className="px-3 py-2 text-muted-foreground">
        {suggestion.leadTimeDays != null
          ? `${suggestion.leadTimeDays} ימים`
          : "—"}
      </td>
      <td className="px-3 py-2 text-xs text-muted-foreground">
        {suggestion.poNumber ? (
          <span className="font-mono">PO {suggestion.poNumber}</span>
        ) : suggestion.effectiveFrom ? (
          new Date(suggestion.effectiveFrom).toLocaleDateString("he-IL")
        ) : (
          "—"
        )}
      </td>
    </tr>
  )
}
