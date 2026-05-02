"use client"

/**
 * Items Catalog → Detail tab: היסטוריית רכש של פריט.
 *
 * פותח את `/api/master-data/items/[id]/purchase-history` שמחזיר את כל
 * שורות ה-PO ההיסטוריות עם הפריט הזה (מיון מהאחרון לישן).
 *
 * ערך עסקי: המשתמש רואה מגמת מחיר, ספקים היסטוריים, וכמויות קודמות
 * — מידע שאיש רכש צריך לפני שהוא מחליט ממי להזמין עכשיו.
 */

import * as React from "react"
import { useRouter } from "next/navigation"

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

type HistoryRow = {
  lineId: string
  poId: string
  poNumber: string | null
  poStatus: string | null
  poCreatedAt: string | null
  supplierId: string | null
  supplierName: string | null
  quantity: number
  unitPrice: number
  totalPrice: number
  currency: string | null
  priceDeviationPct: number | null
}

const dateFormatter = new Intl.DateTimeFormat("he-IL", { dateStyle: "short" })
const numberFormatter = new Intl.NumberFormat("he-IL", {
  maximumFractionDigits: 2,
})

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

const PO_STATUS_LABEL: Record<string, string> = {
  DRAFT: "טיוטה",
  PENDING_APPROVAL: "ממתין",
  APPROVED: "מאושר",
  SENT_TO_SUPPLIER: "נשלח",
  PARTIALLY_RECEIVED: "קליטה חלקית",
  FULLY_RECEIVED: "נקלט",
  CLOSED: "סגור",
  CANCELLED: "בוטל",
}

export function PurchaseHistoryTab({ itemId }: { itemId: string | null }) {
  const router = useRouter()
  const [rows, setRows] = React.useState<HistoryRow[]>([])
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!itemId) return
    let cancelled = false
    setLoading(true)
    setError(null)
    masterDataFetch<HistoryRow[]>(
      `/api/master-data/items/${encodeURIComponent(itemId)}/purchase-history`,
    )
      .then((data) => {
        if (cancelled) return
        setRows(data)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setError(
          err instanceof Error ? err.message : "טעינת היסטוריית רכש נכשלה",
        )
        setRows([])
      })
      .finally(() => {
        if (cancelled) return
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [itemId])

  const columns = React.useMemo<BentoSmartListColumn<HistoryRow>[]>(
    () => [
      {
        key: "date",
        title: "תאריך",
        className: "w-[7rem] text-[11px]",
        render: (r) =>
          r.poCreatedAt
            ? dateFormatter.format(new Date(r.poCreatedAt))
            : "—",
      },
      {
        key: "po",
        title: "הזמנה",
        className: "w-[8rem] font-mono text-[11px]",
        render: (r) => r.poNumber ?? "—",
      },
      {
        key: "supplier",
        title: "ספק",
        className: "min-w-[11rem]",
        render: (r) => (
          <span className="font-medium text-foreground">
            {r.supplierName ?? "—"}
          </span>
        ),
      },
      {
        key: "qty",
        title: "כמות",
        className: "w-[5.5rem] text-xs tabular-nums",
        render: (r) => numberFormatter.format(r.quantity),
      },
      {
        key: "unitPrice",
        title: "מחיר יחידה",
        className: "w-[8rem] text-xs",
        render: (r) => (
          <span className="font-currency-mono font-semibold tabular-nums">
            {formatPrice(r.unitPrice, r.currency)}
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
            {formatPrice(r.totalPrice, r.currency)}
          </span>
        ),
      },
      {
        key: "status",
        title: "סטטוס",
        className: "w-[6rem] text-[10px] uppercase tracking-wide",
        render: (r) =>
          r.poStatus ? (
            <span className="rounded bg-muted px-1.5 py-0.5 text-[10px]">
              {PO_STATUS_LABEL[r.poStatus] ?? r.poStatus}
            </span>
          ) : (
            "—"
          ),
      },
    ],
    [],
  )

  if (!itemId) {
    return (
      <MasterDetailTabEmpty>
        בחר פריט במסך האב כדי לראות את היסטוריית הרכש שלו.
      </MasterDetailTabEmpty>
    )
  }
  if (loading)
    return <MasterDetailTabLoading>טוען היסטוריית רכש…</MasterDetailTabLoading>
  if (error) return <MasterDetailTabError>{error}</MasterDetailTabError>

  return (
    <BentoSmartList<HistoryRow>
      items={rows}
      columns={columns}
      rowKey={(r) => r.lineId}
      onRowDoubleClick={(r) =>
        router.push(
          `/marker-ofek/procurement/orders/${encodeURIComponent(r.poId)}`,
        )
      }
      emptyState="אין היסטוריית רכש לפריט זה — הוא עוד לא הוזמן."
    />
  )
}
