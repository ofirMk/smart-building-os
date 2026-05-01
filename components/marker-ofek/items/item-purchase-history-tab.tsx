"use client"

/**
 * ItemPurchaseHistoryTab — Phase 7.13.3.C
 *
 * חושף את היסטוריית הרכישות של ה-master SKU על בסיס שורות
 * `erp_purchase_order_lines`. זה הכלי המעשי ביותר לקונה: רואה מבט-על של
 * "כמה שילמנו על הפריט הזה בעבר", על איזה ספקים, ובאיזו דחיפות מחיר.
 *
 * תצוגה:
 *   • Stats bar עליון: כמות PO, סה"כ רכש (ב-ILS משוקלל לפי line_currency=ILS),
 *     מחיר ממוצע, וטווח (min/max).
 *   • Timeline + Table — כל שורה עם קישור ל-PO detail.
 *   • Visual hint לסטיות מחיר: deviation% מודגשת באדום אם > 0.
 */

import * as React from "react"
import Link from "next/link"
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  ExternalLink,
  Loader2,
  PackageOpen,
  Receipt,
  TrendingDown,
  TrendingUp,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { masterDataFetch } from "@/lib/erp/master-data-browser"
import { cn } from "@/lib/utils"

// ============================================================================
// Types
// ============================================================================

type PurchaseEntry = {
  lineId: string
  poId: string
  poNumber: string | null
  poStatus: string | null
  poCreatedAt: string | null
  poIssuedAt: string | null
  supplierId: string | null
  supplierName: string | null
  quantity: number
  unitPrice: number
  totalPrice: number
  currency: string | null
  discountPct: number | null
  priceSource: string | null
  priceDeviationPct: number | null
  manufacturerName: string | null
  supplyDate: string | null
}

const STATUS_TONE: Record<string, string> = {
  DRAFT: "border-slate-300/50 bg-slate-100/40 text-slate-700",
  PENDING_APPROVAL: "border-amber-500/40 bg-amber-500/10 text-amber-800",
  APPROVED: "border-emerald-500/40 bg-emerald-500/10 text-emerald-800",
  ISSUED: "border-sky-500/40 bg-sky-500/10 text-sky-800",
  CANCELLED: "border-rose-500/40 bg-rose-500/10 text-rose-800",
}

const STATUS_LABEL: Record<string, string> = {
  DRAFT: "טיוטה",
  PENDING_APPROVAL: "ממתין",
  APPROVED: "מאושר",
  ISSUED: "הוצא",
  CANCELLED: "מבוטל",
}

const numberFormatter = new Intl.NumberFormat("he-IL", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const compactCurrency = new Intl.NumberFormat("he-IL", {
  notation: "compact",
  maximumFractionDigits: 1,
})

const dateFormatter = new Intl.DateTimeFormat("he-IL", {
  dateStyle: "short",
})

function formatDate(value: string | null): string {
  if (!value) return "—"
  try {
    return dateFormatter.format(new Date(value))
  } catch {
    return value
  }
}

// ============================================================================
// Main
// ============================================================================

export function ItemPurchaseHistoryTab({ itemId }: { itemId: string }) {
  const [entries, setEntries] = React.useState<PurchaseEntry[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    let cancelled = false
    void (async () => {
      setLoading(true)
      setError(null)
      try {
        const result = await masterDataFetch<PurchaseEntry[]>(
          `/api/master-data/items/${encodeURIComponent(itemId)}/purchase-history`
        )
        if (!cancelled) setEntries(result)
      } catch (e: unknown) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "טעינת היסטוריה נכשלה")
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [itemId])

  const stats = React.useMemo(() => {
    if (entries.length === 0) return null
    const totalQty = entries.reduce((sum, e) => sum + e.quantity, 0)
    const totalValueIls = entries
      .filter((e) => (e.currency ?? "ILS") === "ILS")
      .reduce((sum, e) => sum + e.totalPrice, 0)
    const ilsEntries = entries.filter((e) => (e.currency ?? "ILS") === "ILS")
    const avgUnitIls =
      ilsEntries.length > 0
        ? ilsEntries.reduce((s, e) => s + e.unitPrice, 0) / ilsEntries.length
        : 0
    const minUnitIls =
      ilsEntries.length > 0
        ? Math.min(...ilsEntries.map((e) => e.unitPrice))
        : null
    const maxUnitIls =
      ilsEntries.length > 0
        ? Math.max(...ilsEntries.map((e) => e.unitPrice))
        : null
    const distinctSuppliers = new Set(
      entries.map((e) => e.supplierId).filter(Boolean)
    ).size
    return {
      totalEntries: entries.length,
      totalQty,
      totalValueIls,
      avgUnitIls,
      minUnitIls,
      maxUnitIls,
      distinctSuppliers,
    }
  }, [entries])

  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-dashed border-border bg-muted/10 p-6 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" aria-hidden />
        טוען היסטוריה…
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
        <AlertTriangle className="size-4" aria-hidden />
        {error}
      </div>
    )
  }

  if (entries.length === 0 || !stats) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-lg border-2 border-dashed border-border bg-muted/10 p-10 text-center">
        <PackageOpen className="size-6 text-muted-foreground" aria-hidden />
        <p className="text-sm font-medium">אין רכישות עבור פריט זה</p>
        <p className="max-w-md text-xs text-muted-foreground">
          ברגע שהפריט יופיע ב-PO, הרכישה תוצג כאן עם תאריכים, ספקים, ומחירים.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Stats bar */}
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label='סה"כ הזמנות'
          value={stats.totalEntries.toString()}
          hint={`${stats.distinctSuppliers} ספקים שונים`}
        />
        <StatCard
          label='כמות מצטברת'
          value={numberFormatter.format(stats.totalQty)}
        />
        <StatCard
          label='מחיר ממוצע (ILS)'
          value={
            stats.avgUnitIls > 0
              ? `${numberFormatter.format(stats.avgUnitIls)} ₪`
              : "—"
          }
          hint={
            stats.minUnitIls != null && stats.maxUnitIls != null
              ? `${numberFormatter.format(stats.minUnitIls)}–${numberFormatter.format(stats.maxUnitIls)} ₪`
              : undefined
          }
        />
        <StatCard
          label='סה"כ רכש (ILS)'
          value={
            stats.totalValueIls > 0
              ? `${compactCurrency.format(stats.totalValueIls)} ₪`
              : "—"
          }
        />
      </section>

      {/* Table */}
      <div className="overflow-hidden rounded-lg border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-start">PO</TableHead>
              <TableHead className="text-start">סטטוס</TableHead>
              <TableHead className="text-start">תאריך</TableHead>
              <TableHead className="text-start">ספק</TableHead>
              <TableHead className="text-end">כמות</TableHead>
              <TableHead className="text-end">מחיר יחידה</TableHead>
              <TableHead className="text-end">סה&quot;כ</TableHead>
              <TableHead className="text-end">חריגה</TableHead>
              <TableHead className="text-start">מקור</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {entries.map((entry, idx) => (
              <PurchaseRow
                key={entry.lineId}
                entry={entry}
                prevPrice={
                  idx < entries.length - 1
                    ? entries[idx + 1].unitPrice
                    : null
                }
              />
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}

// ============================================================================
// Sub-components
// ============================================================================

function StatCard({
  label,
  value,
  hint,
}: {
  label: string
  value: string
  hint?: string
}) {
  return (
    <article className="rounded-lg border border-border bg-card p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 font-mono text-lg font-bold tabular-nums">{value}</p>
      {hint ? (
        <p className="text-[10px] text-muted-foreground">{hint}</p>
      ) : null}
    </article>
  )
}

function PurchaseRow({
  entry,
  prevPrice,
}: {
  entry: PurchaseEntry
  prevPrice: number | null
}) {
  const trend = prevPrice != null && entry.unitPrice !== prevPrice
  const isUp = trend && entry.unitPrice > prevPrice!
  const isDown = trend && entry.unitPrice < prevPrice!

  const dateRaw = entry.poIssuedAt ?? entry.poCreatedAt
  const status = entry.poStatus ?? ""
  const statusTone = STATUS_TONE[status] ?? STATUS_TONE.DRAFT
  const statusLabel = STATUS_LABEL[status] ?? status

  const deviationPct = entry.priceDeviationPct ?? 0
  const deviationVisible = Math.abs(deviationPct) >= 0.5

  return (
    <TableRow>
      <TableCell>
        <Link
          href={`/marker-ofek/procurement/orders/${encodeURIComponent(entry.poId)}`}
          className="inline-flex items-center gap-1 font-mono text-xs text-primary hover:underline"
        >
          {entry.poNumber ?? `#${entry.poId.slice(0, 8)}`}
          <ExternalLink className="size-3" aria-hidden />
        </Link>
      </TableCell>
      <TableCell>
        <Badge
          variant="outline"
          className={cn("font-medium text-xs", statusTone)}
        >
          {statusLabel}
        </Badge>
      </TableCell>
      <TableCell className="text-xs text-muted-foreground">
        {formatDate(dateRaw)}
      </TableCell>
      <TableCell className="text-sm">
        {entry.supplierName ?? (
          <span className="text-muted-foreground">—</span>
        )}
      </TableCell>
      <TableCell className="text-end font-mono tabular-nums">
        {numberFormatter.format(entry.quantity)}
      </TableCell>
      <TableCell className="text-end font-mono tabular-nums">
        <span
          className={cn(
            "inline-flex items-center gap-1",
            isUp && "text-rose-700",
            isDown && "text-emerald-700"
          )}
        >
          {isUp ? (
            <ArrowUpRight className="size-3" aria-hidden />
          ) : isDown ? (
            <ArrowDownRight className="size-3" aria-hidden />
          ) : null}
          {numberFormatter.format(entry.unitPrice)}
          <span className="text-[10px] text-muted-foreground">
            {entry.currency ?? "ILS"}
          </span>
        </span>
      </TableCell>
      <TableCell className="text-end font-mono tabular-nums">
        {numberFormatter.format(entry.totalPrice)}
      </TableCell>
      <TableCell className="text-end">
        {deviationVisible ? (
          <span
            className={cn(
              "inline-flex items-center gap-1 font-mono text-xs tabular-nums",
              deviationPct > 0 ? "text-rose-700" : "text-emerald-700"
            )}
          >
            {deviationPct > 0 ? (
              <TrendingUp className="size-3" aria-hidden />
            ) : (
              <TrendingDown className="size-3" aria-hidden />
            )}
            {deviationPct > 0 ? "+" : ""}
            {deviationPct.toFixed(1)}%
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">
            <Receipt className="inline size-3" aria-hidden />
          </span>
        )}
      </TableCell>
      <TableCell>
        {entry.priceSource ? (
          <span className="font-mono text-[10px] uppercase text-muted-foreground">
            {entry.priceSource}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
      </TableCell>
    </TableRow>
  )
}
