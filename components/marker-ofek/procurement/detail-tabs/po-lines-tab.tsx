"use client"

/**
 * POs Master/Detail → Detail tab: שורות ההזמנה.
 *
 * פותח את `/api/procurement/orders/[id]` (ה-DTO העשיר עם lines[]).
 * ה-API הוא "PO מלא" — כאן אנחנו רק מציגים את lines. ה-overhead קטן
 * (שורות PO בודדים) וזה חוסך endpoint נפרד.
 *
 * ערך עסקי: במסך ה-POs, במקום לפתוח כרטיס מלא כדי לראות מה בפנים,
 * המשתמש בוחר הזמנה ורואה מיד את שורות הפריטים + סטייה + מחיר.
 */

import * as React from "react"
import { useRouter } from "next/navigation"
import { AlertTriangle } from "lucide-react"

import {
  BentoSmartList,
  type BentoSmartListColumn,
} from "@/components/ui/bento-smart-list"
import {
  MasterDetailTabEmpty,
  MasterDetailTabError,
  MasterDetailTabLoading,
} from "@/components/infrastructure/master-detail/master-detail-shell"
import { masterDataFetch } from "@/lib/erp/master-data-browser"

type LineRow = {
  id: string
  itemId: string | null
  itemNumber: string | null
  itemSku: string | null
  description: string
  quantity: number
  unitPrice: number
  totalPrice: number
  discountPct: number
  lineCurrency: string | null
  priceDeviationPct: number | null
  requiresEscalation: boolean
  manufacturerName: string | null
  supplyDate: string | null
}

type DetailResponse = {
  id: string
  currency: string
  lines: LineRow[]
}

const numberFormatter = new Intl.NumberFormat("he-IL", {
  maximumFractionDigits: 2,
})
const dateFormatter = new Intl.DateTimeFormat("he-IL", { dateStyle: "short" })

function formatPrice(value: number, currency: string | null): string {
  const cur = currency ?? "ILS"
  try {
    return new Intl.NumberFormat("he-IL", {
      style: "currency",
      currency: cur,
      maximumFractionDigits: 2,
    }).format(value)
  } catch {
    return `${value.toLocaleString("he-IL")} ${cur}`
  }
}

export function PoLinesTab({ poId }: { poId: string | null }) {
  const router = useRouter()
  const [rows, setRows] = React.useState<LineRow[]>([])
  const [currency, setCurrency] = React.useState<string>("ILS")
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!poId) return
    let cancelled = false
    setLoading(true)
    setError(null)
    masterDataFetch<DetailResponse>(
      `/api/procurement/orders/${encodeURIComponent(poId)}`,
    )
      .then((data) => {
        if (cancelled) return
        setRows(data.lines ?? [])
        setCurrency(data.currency ?? "ILS")
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : "טעינת שורות ההזמנה נכשלה")
        setRows([])
      })
      .finally(() => {
        if (cancelled) return
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [poId])

  const columns = React.useMemo<BentoSmartListColumn<LineRow>[]>(
    () => [
      {
        key: "sku",
        title: "מק״ט",
        className: "w-[8rem] font-mono text-[11px]",
        render: (r) => r.itemNumber ?? r.itemSku ?? "—",
      },
      {
        key: "description",
        title: "תיאור",
        className: "min-w-[14rem]",
        render: (r) => (
          <div className="flex min-w-0 items-center gap-1.5">
            <span className="block truncate font-medium text-foreground">
              {r.description}
            </span>
            {r.requiresEscalation ? (
              <span title="שורה זו חורגת מהמחיר המאושר">
                <AlertTriangle
                  className="size-3 shrink-0 text-amber-600"
                  aria-label="דורש אישור חריג"
                />
              </span>
            ) : null}
          </div>
        ),
      },
      {
        key: "manufacturer",
        title: "יצרן",
        className: "min-w-[8rem] text-xs text-muted-foreground",
        render: (r) => r.manufacturerName ?? "—",
      },
      {
        key: "qty",
        title: "כמות",
        className: "w-[5rem] text-xs tabular-nums",
        render: (r) => numberFormatter.format(r.quantity),
      },
      {
        key: "unitPrice",
        title: "מחיר יחידה",
        className: "w-[8rem] text-xs",
        render: (r) => (
          <span className="font-currency-mono font-semibold tabular-nums">
            {formatPrice(r.unitPrice, r.lineCurrency ?? currency)}
          </span>
        ),
      },
      {
        key: "deviation",
        title: "סטייה",
        className: "w-[5rem] text-xs tabular-nums",
        render: (r) => {
          if (r.priceDeviationPct == null) return "—"
          const pct = r.priceDeviationPct
          const tone =
            Math.abs(pct) < 0.5
              ? "text-muted-foreground"
              : pct > 0
                ? "text-rose-700 dark:text-rose-400"
                : "text-emerald-700 dark:text-emerald-400"
          return (
            <span className={tone}>
              {pct > 0 ? "+" : ""}
              {pct.toFixed(1)}%
            </span>
          )
        },
      },
      {
        key: "total",
        title: "סה״כ",
        className: "w-[9rem] text-xs",
        render: (r) => (
          <span className="font-currency-mono tabular-nums">
            {formatPrice(r.totalPrice, r.lineCurrency ?? currency)}
          </span>
        ),
      },
      {
        key: "supplyDate",
        title: "תאריך אספקה",
        className: "w-[7rem] text-[11px]",
        render: (r) =>
          r.supplyDate ? dateFormatter.format(new Date(r.supplyDate)) : "—",
      },
    ],
    [currency],
  )

  if (!poId) {
    return (
      <MasterDetailTabEmpty>
        בחר הזמנה במסך האב כדי לראות את שורות הפריטים שלה.
      </MasterDetailTabEmpty>
    )
  }
  if (loading) return <MasterDetailTabLoading>טוען שורות…</MasterDetailTabLoading>
  if (error) return <MasterDetailTabError>{error}</MasterDetailTabError>

  return (
    <BentoSmartList<LineRow>
      items={rows}
      columns={columns}
      rowKey={(r) => r.id}
      onRowDoubleClick={(r) =>
        r.itemId
          ? router.push(`/marker-ofek/items/${encodeURIComponent(r.itemId)}`)
          : undefined
      }
      emptyState="אין שורות פריטים בהזמנה זו."
    />
  )
}
