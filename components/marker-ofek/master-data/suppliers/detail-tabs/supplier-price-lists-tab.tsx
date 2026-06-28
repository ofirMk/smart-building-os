"use client"

/**
 * Suppliers Master/Detail → Detail tab: מחירוני ספק (Priority parity).
 *
 * Header-based model: shows price list headers. Expanding a row reveals
 * the product price lines (מחירי מוצרים) within that price list.
 *
 * Priority: "מחירוני ספק" subform (screenshot batch).
 */

import * as React from "react"
import { ChevronDown, ChevronRight, Tag } from "lucide-react"

import {
  MasterDetailTabEmpty,
  MasterDetailTabError,
  MasterDetailTabLoading,
} from "@/components/infrastructure/master-detail/master-detail-shell"
import { Badge } from "@/components/ui/badge"
import { masterDataFetch } from "@/lib/erp/master-data-browser"
import type { ErpSupplierPriceList, ErpSupplierPriceListItem } from "@/types/erp"

const dateFormatter = new Intl.DateTimeFormat("he-IL", { dateStyle: "short" })

function formatPrice(value: number, currency: string | null): string {
  const cur = currency ?? "ILS"
  try {
    return new Intl.NumberFormat("he-IL", {
      style: "currency",
      currency: cur,
      maximumFractionDigits: 4,
    }).format(value)
  } catch {
    return `${value.toLocaleString("he-IL")} ${cur}`
  }
}

export function SupplierPriceListsTab({
  supplierId,
}: {
  supplierId: string | null
}) {
  const [lists, setLists] = React.useState<ErpSupplierPriceList[]>([])
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [expanded, setExpanded] = React.useState<Set<string>>(new Set())

  React.useEffect(() => {
    if (!supplierId) return
    let cancelled = false
    setLoading(true)
    setError(null)
    masterDataFetch<ErpSupplierPriceList[]>(
      `/api/master-data/suppliers/${encodeURIComponent(supplierId)}/supplier-price-lists?include=items`,
    )
      .then((data) => {
        if (cancelled) return
        setLists(data)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : "טעינת מחירוני ספק נכשלה")
        setLists([])
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [supplierId])

  if (!supplierId) {
    return <MasterDetailTabEmpty>בחר ספק כדי לראות מחירוניו.</MasterDetailTabEmpty>
  }
  if (loading) return <MasterDetailTabLoading>טוען מחירוני ספק…</MasterDetailTabLoading>
  if (error) return <MasterDetailTabError>{error}</MasterDetailTabError>
  if (lists.length === 0) {
    return <MasterDetailTabEmpty>לספק זה אין מחירוני ספק.</MasterDetailTabEmpty>
  }

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div className="divide-y divide-border text-xs" dir="rtl">
      {/* Header row */}
      <div className="grid grid-cols-[1.5rem_8rem_1fr_8rem_6rem_6rem_5rem] gap-x-3 bg-muted/50 px-3 py-1.5 font-semibold text-muted-foreground">
        <span />
        <span>קוד מחירון</span>
        <span>תאור</span>
        <span>ת. כניסה</span>
        <span>מטבע</span>
        <span>פריטים</span>
        <span>סטטוס</span>
      </div>
      {lists.map((pl) => (
        <PriceListRow
          key={pl.id}
          priceList={pl}
          isExpanded={expanded.has(pl.id)}
          onToggle={() => toggleExpand(pl.id)}
        />
      ))}
    </div>
  )
}

function PriceListRow({
  priceList: pl,
  isExpanded,
  onToggle,
}: {
  priceList: ErpSupplierPriceList
  isExpanded: boolean
  onToggle: () => void
}) {
  const itemCount = pl.items?.length ?? 0

  return (
    <>
      <div
        className="grid cursor-pointer grid-cols-[1.5rem_8rem_1fr_8rem_6rem_6rem_5rem] items-center gap-x-3 px-3 py-2 text-xs hover:bg-muted/30"
        onClick={onToggle}
        role="button"
        aria-expanded={isExpanded}
      >
        <span className="text-muted-foreground">
          {isExpanded ? (
            <ChevronDown className="size-3.5" aria-hidden />
          ) : (
            <ChevronRight className="size-3.5" aria-hidden />
          )}
        </span>
        <span className="font-mono font-semibold">{pl.priceListCode}</span>
        <span className="truncate text-muted-foreground">{pl.description ?? "—"}</span>
        <span className="tabular-nums">
          {pl.validFrom ? new Date(pl.validFrom).toLocaleDateString("he-IL") : "—"}
        </span>
        <span className="text-muted-foreground">{pl.currencyCode ?? "—"}</span>
        <span className="text-muted-foreground">{itemCount > 0 ? itemCount : "—"}</span>
        <span>
          {pl.isCancelled ? (
            <Badge variant="outline" className="border-rose-300 text-rose-600 text-[10px]">בוטל</Badge>
          ) : (
            <Badge variant="outline" className="border-emerald-300 text-emerald-700 text-[10px]">פעיל</Badge>
          )}
        </span>
      </div>

      {isExpanded && (
        <div className="border-t border-dashed border-border bg-muted/20 pb-2">
          {/* Meta row */}
          {(pl.manufacturerName || pl.priceMultiplier != null) && (
            <div className="flex flex-wrap gap-4 px-8 py-1.5 text-[11px] text-muted-foreground">
              {pl.manufacturerName && (
                <span>צרן: <span className="text-foreground">{pl.manufacturerName}</span></span>
              )}
              {pl.priceMultiplier != null && pl.priceMultiplier !== 1 && (
                <span>מספיל מחיר: <span className="font-mono text-foreground">{pl.priceMultiplier}</span></span>
              )}
              {pl.quoteValidUntil && (
                <span>הצעת מחיר עד: <span className="text-foreground">{new Date(pl.quoteValidUntil).toLocaleDateString("he-IL")}</span></span>
              )}
            </div>
          )}

          {/* Items grid */}
          {itemCount === 0 ? (
            <p className="px-8 py-2 text-[11px] text-muted-foreground">אין פריטים במחירון זה.</p>
          ) : (
            <div className="px-4 pt-1">
              <div className="grid grid-cols-[8rem_1fr_5rem_5rem_7rem_5rem_7rem] gap-x-3 border-b border-border pb-1 text-[10px] font-semibold text-muted-foreground">
                <span>פק"ס ספק/צרן</span>
                <span>תאור</span>
                <span>כמות</span>
                <span>יח'</span>
                <span>מחיר ליח'</span>
                <span>הנחה %</span>
                <span>אחרי הנחה</span>
              </div>
              {(pl.items ?? []).map((item) => (
                <PriceItemRow key={item.id} item={item} currency={pl.currencyCode} />
              ))}
            </div>
          )}
        </div>
      )}
    </>
  )
}

function PriceItemRow({
  item,
  currency,
}: {
  item: ErpSupplierPriceListItem
  currency: string | null
}) {
  return (
    <div className="grid grid-cols-[8rem_1fr_5rem_5rem_7rem_5rem_7rem] items-center gap-x-3 border-b border-border/50 py-1.5 text-[11px]">
      <span className="font-mono tabular-nums">{item.supplierPartCode}</span>
      <span className="truncate text-muted-foreground">{item.description ?? "—"}</span>
      <span className="tabular-nums">{item.quantity}</span>
      <span className="text-muted-foreground">{item.unitOfMeasure ?? "—"}</span>
      <span className="tabular-nums">{formatPrice(item.unitPrice, currency)}</span>
      <span className={item.discountPct > 0 ? "tabular-nums text-amber-700 dark:text-amber-400" : "text-muted-foreground"}>
        {item.discountPct > 0 ? `${item.discountPct}%` : "—"}
      </span>
      <span className="font-semibold tabular-nums">{formatPrice(item.priceAfterDiscount, currency)}</span>
    </div>
  )
}
