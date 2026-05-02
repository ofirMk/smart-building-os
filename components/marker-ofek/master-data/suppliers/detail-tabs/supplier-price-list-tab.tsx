"use client"

/**
 * Suppliers Master/Detail → Detail tab: מחירונים.
 *
 * רשימת הפריטים שהספק תמחר אצלנו (`erp_md_supplier_items`). זה
 * מודל **flat** — שורה לפריט במחיר אחד. בעתיד נאמץ מודל header-based
 * (Priority style — Batch #6 תמונה #27) כש-`erp_supplier_price_lists`
 * תיווצר.
 *
 * עמודות מתואמות לתמונה #27 ב-Priority: מק"ט, תאור, מחיר בסיס, הנחה,
 * מחיר אחרי הנחה, מטבע, יח'.
 *
 * Double-click → drill-in לכרטיס הפריט (`/marker-ofek/catalog/items?...`).
 */

import * as React from "react"
import { useRouter } from "next/navigation"
import { Star } from "lucide-react"

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

type PriceLineRow = {
  id: string
  itemId: string | null
  supplierSku: string | null
  itemSku: string | null
  itemDescription: string | null
  basePrice: number | null
  netUnitPrice: number | null
  discountPct: number | null
  currency: string | null
  uom: string | null
  isPreferred: boolean
  validFrom: string | null
  validTo: string | null
}

const dateFormatter = new Intl.DateTimeFormat("he-IL", { dateStyle: "short" })

function formatMoney(value: number | null, currency: string | null): string {
  if (value == null) return "—"
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

function isActive(validFrom: string | null, validTo: string | null): boolean {
  const today = new Date().toISOString().slice(0, 10)
  if (validFrom && validFrom > today) return false
  if (validTo && validTo < today) return false
  return true
}

export function SupplierPriceListTab({
  supplierId,
}: {
  supplierId: string | null
}) {
  const router = useRouter()
  const [rows, setRows] = React.useState<PriceLineRow[]>([])
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!supplierId) return
    let cancelled = false
    setLoading(true)
    setError(null)
    masterDataFetch<PriceLineRow[]>(
      `/api/master-data/suppliers/${encodeURIComponent(supplierId)}/price-list`,
    )
      .then((data) => {
        if (cancelled) return
        setRows(data)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : "טעינת מחירון נכשלה")
        setRows([])
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [supplierId])

  const columns = React.useMemo<BentoSmartListColumn<PriceLineRow>[]>(
    () => [
      {
        key: "preferred",
        title: "",
        className: "w-[1.5rem]",
        render: (r) =>
          r.isPreferred ? (
            <Star
              className="size-3 fill-amber-500 text-amber-500"
              aria-label="ספק מועדף לפריט"
            />
          ) : null,
      },
      {
        key: "itemSku",
        title: "מק״ט",
        className: "w-[8rem] font-mono text-[11px] font-semibold",
        render: (r) =>
          r.itemSku ?? (
            <span className="text-muted-foreground">—</span>
          ),
      },
      {
        key: "supplierSku",
        title: "מק״ט ספק",
        className: "w-[8rem] font-mono text-[10px] text-muted-foreground",
        render: (r) => r.supplierSku ?? "—",
      },
      {
        key: "description",
        title: "תאור",
        className: "min-w-[14rem]",
        render: (r) => (
          <span className="block truncate text-foreground">
            {r.itemDescription ?? "—"}
          </span>
        ),
      },
      {
        key: "basePrice",
        title: "מחיר בסיס",
        className: "w-[8rem] text-xs",
        render: (r) => (
          <span className="font-currency-mono tabular-nums">
            {formatMoney(r.basePrice, r.currency)}
          </span>
        ),
      },
      {
        key: "discount",
        title: "הנחה %",
        className: "w-[5rem] text-xs",
        render: (r) =>
          r.discountPct != null && r.discountPct > 0 ? (
            <span className="tabular-nums text-amber-700 dark:text-amber-400">
              {r.discountPct.toFixed(2)}%
            </span>
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
      },
      {
        key: "netPrice",
        title: "אחרי הנחה",
        className: "w-[9rem] text-xs",
        render: (r) => (
          <span className="font-currency-mono font-semibold tabular-nums">
            {formatMoney(r.netUnitPrice, r.currency)}
          </span>
        ),
      },
      {
        key: "uom",
        title: "יח'",
        className: "w-[4rem] text-[11px] text-muted-foreground",
        render: (r) => r.uom ?? "—",
      },
      {
        key: "validity",
        title: "תוקף",
        className: "w-[10rem] text-[10px] text-muted-foreground",
        render: (r) => {
          const active = isActive(r.validFrom, r.validTo)
          if (!r.validFrom && !r.validTo) {
            return active ? (
              <span className="text-emerald-700 dark:text-emerald-400">
                ללא הגבלה
              </span>
            ) : null
          }
          const from = r.validFrom
            ? dateFormatter.format(new Date(r.validFrom))
            : "—"
          const to = r.validTo
            ? dateFormatter.format(new Date(r.validTo))
            : "פתוח"
          return (
            <span
              className={
                active
                  ? "text-foreground"
                  : "text-rose-700 line-through dark:text-rose-400"
              }
            >
              {from} → {to}
            </span>
          )
        },
      },
    ],
    [],
  )

  if (!supplierId) {
    return (
      <MasterDetailTabEmpty>
        בחר ספק במסך האב כדי לראות את המחירון שלו.
      </MasterDetailTabEmpty>
    )
  }
  if (loading) return <MasterDetailTabLoading>טוען מחירון…</MasterDetailTabLoading>
  if (error) return <MasterDetailTabError>{error}</MasterDetailTabError>

  return (
    <BentoSmartList<PriceLineRow>
      items={rows}
      columns={columns}
      rowKey={(r) => r.id}
      onRowDoubleClick={(r) => {
        if (!r.itemId) return
        router.push(
          `/marker-ofek/catalog/items?focus=${encodeURIComponent(r.itemId)}`,
        )
      }}
      emptyState="לא הוגדר מחירון לספק זה."
    />
  )
}
