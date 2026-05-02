"use client"

/**
 * Suppliers Master/Detail → Detail tab: הזמנות פתוחות.
 *
 * מיפוי ישיר לתמונה #25 ב-Priority (`docs/priority-suppliers-reference.md`,
 * Batch #5): רשימת ההזמנות הפתוחות של הספק עם מספר, תאריך, סכום
 * ומטבע. Double-click → drill-in לכרטיס ה-PO המלא
 * (`/marker-ofek/procurement/orders/[id]`).
 *
 * Toggle: "הצג רק פתוחות / הצג גם סגורות" — פותר את הצורך הנוסף
 * שראינו ב-Priority sidebar (`קבלת סהוא'ה מספק`) להציג גם POs
 * שכבר נסגרו.
 */

import * as React from "react"
import { useRouter } from "next/navigation"

import {
  BentoSmartList,
  type BentoSmartListColumn,
  SmartListStatusPill,
} from "@/components/ui/bento-smart-list"
import { Button } from "@/components/ui/button"
import {
  MasterDetailTabEmpty,
  MasterDetailTabError,
  MasterDetailTabLoading,
} from "@/components/infrastructure/master-detail/master-detail-shell"
import { masterDataFetch } from "@/lib/erp/master-data-browser"

type PoRow = {
  id: string
  poNumber: string
  title: string
  status: string
  totalAmount: number
  currency: string
  issuedAt: string | null
  createdAt: string
}

const STATUS_LABEL: Record<string, string> = {
  DRAFT: "טיוטה",
  PENDING: "ממתין",
  PENDING_APPROVAL: "ממתין לאישור",
  PENDING_PRICE_APPROVAL: "אישור מחיר",
  PENDING_CEO_APPROVAL: "ממתין למנכ״ל",
  APPROVED: "מאושר",
  ISSUED: "הונפק",
  SENT_TO_SUPPLIER: "נשלח",
  PARTIALLY_RECEIVED: "קליטה חלקית",
  FULLY_RECEIVED: "נקלט",
  RECEIVED: "התקבל",
  CLOSED: "סגור",
  CANCELED: "מבוטל",
  CANCELLED: "מבוטל",
}

function statusTone(
  status: string,
): "neutral" | "success" | "warning" | "info" | "danger" {
  if (status === "DRAFT") return "neutral"
  if (status.startsWith("PENDING")) return "warning"
  if (status === "APPROVED") return "success"
  if (
    status === "ISSUED" ||
    status === "SENT_TO_SUPPLIER" ||
    status === "PARTIALLY_RECEIVED"
  )
    return "info"
  if (status === "FULLY_RECEIVED" || status === "RECEIVED" || status === "CLOSED")
    return "success"
  if (status === "CANCELED" || status === "CANCELLED") return "danger"
  return "neutral"
}

const dateFormatter = new Intl.DateTimeFormat("he-IL", { dateStyle: "short" })

function formatMoney(value: number, currency: string): string {
  try {
    return new Intl.NumberFormat("he-IL", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(value)
  } catch {
    return `${value.toLocaleString("he-IL")} ${currency}`
  }
}

export function SupplierOpenPosTab({
  supplierId,
}: {
  supplierId: string | null
}) {
  const router = useRouter()
  const [rows, setRows] = React.useState<PoRow[]>([])
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [filter, setFilter] = React.useState<"open" | "all">("open")

  React.useEffect(() => {
    if (!supplierId) return
    let cancelled = false
    setLoading(true)
    setError(null)
    const qs = filter === "open" ? "?status=open" : ""
    masterDataFetch<PoRow[]>(
      `/api/master-data/suppliers/${encodeURIComponent(supplierId)}/purchase-orders${qs}`,
    )
      .then((data) => {
        if (cancelled) return
        setRows(data)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : "טעינת הזמנות נכשלה")
        setRows([])
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [supplierId, filter])

  const columns = React.useMemo<BentoSmartListColumn<PoRow>[]>(
    () => [
      {
        key: "poNumber",
        title: "מספר",
        className: "w-[8rem] font-mono text-[11px] font-semibold",
        render: (r) => r.poNumber,
      },
      {
        key: "title",
        title: "כותרת",
        className: "min-w-[14rem]",
        render: (r) => (
          <span className="block truncate font-medium text-foreground">
            {r.title}
          </span>
        ),
      },
      {
        key: "date",
        title: "תאריך",
        className: "w-[7rem] text-[11px] text-muted-foreground",
        render: (r) => {
          const raw = r.issuedAt ?? r.createdAt
          return raw ? dateFormatter.format(new Date(raw)) : "—"
        },
      },
      {
        key: "amount",
        title: "סכום",
        className: "w-[9rem] text-xs",
        render: (r) => (
          <span className="font-currency-mono font-semibold tabular-nums">
            {formatMoney(r.totalAmount, r.currency)}
          </span>
        ),
      },
      {
        key: "status",
        title: "סטטוס",
        className: "w-[7rem]",
        render: (r) => (
          <SmartListStatusPill tone={statusTone(r.status)}>
            {STATUS_LABEL[r.status] ?? r.status}
          </SmartListStatusPill>
        ),
      },
    ],
    [],
  )

  if (!supplierId) {
    return (
      <MasterDetailTabEmpty>
        בחר ספק במסך האב כדי לראות את הזמנות הרכש שלו.
      </MasterDetailTabEmpty>
    )
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-2 pb-2">
        <div className="flex gap-1.5 rounded-lg border border-border bg-muted/40 p-0.5">
          <FilterChip
            active={filter === "open"}
            onClick={() => setFilter("open")}
          >
            פתוחות
          </FilterChip>
          <FilterChip
            active={filter === "all"}
            onClick={() => setFilter("all")}
          >
            הכול
          </FilterChip>
        </div>
        {!loading && rows.length > 0 ? (
          <span className="text-[11px] text-muted-foreground">
            {rows.length.toLocaleString("he-IL")} הזמנות
          </span>
        ) : null}
      </div>

      <div className="flex min-h-0 flex-1 flex-col">
        {loading ? (
          <MasterDetailTabLoading>טוען הזמנות…</MasterDetailTabLoading>
        ) : error ? (
          <MasterDetailTabError>{error}</MasterDetailTabError>
        ) : (
          <BentoSmartList<PoRow>
            items={rows}
            columns={columns}
            rowKey={(r) => r.id}
            onRowDoubleClick={(r) =>
              router.push(
                `/marker-ofek/procurement/orders/${encodeURIComponent(r.id)}`,
              )
            }
            emptyState={
              filter === "open"
                ? "אין הזמנות פתוחות לספק זה."
                : "לא נמצאו הזמנות לספק זה."
            }
          />
        )}
      </div>
    </div>
  )
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <Button
      type="button"
      size="sm"
      variant="ghost"
      onClick={onClick}
      className={`h-7 px-2 text-[11px] ${
        active
          ? "bg-background text-foreground shadow-sm"
          : "text-muted-foreground hover:text-foreground"
      }`}
    >
      {children}
    </Button>
  )
}
