"use client"

/**
 * Items Catalog → Detail tab: ספקים של פריט.
 *
 * פותח את ה-API הקיים `/api/master-data/items/[id]/suppliers` שמאחד
 * pricing (erp_md_supplier_items) + semantic mapping (erp_md_supplier_item_mapping).
 *
 * למה זה חשוב למשתמש הרכש: כשהוא עומד על פריט ורואה כמה ספקים מציעים
 * אותו ובאיזה מחיר — אין צורך לנווט לכרטיס פריט ולבדוק ידנית. זה הערך
 * העסקי הליבה של ה-Master/Detail pattern.
 */

import * as React from "react"
import { useRouter } from "next/navigation"
import { CheckCircle2, Sparkles, Star } from "lucide-react"

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

// נשמור את ה-DTO פשוט — נקבל רק את השדות שנציג בטבלה.
type SupplierRow = {
  rowKey: string
  supplierId: string
  supplierName: string | null
  supplierSku: string
  unitPrice: number | null
  currency: string | null
  isPreferred: boolean | null
  confidence: number | null
  matchedByAi: boolean
  verifiedByUser: boolean
  validFrom: string | null
  validTo: string | null
  sources: Array<"pricing" | "mapping">
}

function formatPrice(value: number | null, currency: string | null): string {
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

const dateFormatter = new Intl.DateTimeFormat("he-IL", { dateStyle: "short" })

export function SuppliersTab({ itemId }: { itemId: string | null }) {
  const router = useRouter()
  const [rows, setRows] = React.useState<SupplierRow[]>([])
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!itemId) return
    let cancelled = false
    setLoading(true)
    setError(null)
    masterDataFetch<SupplierRow[]>(
      `/api/master-data/items/${encodeURIComponent(itemId)}/suppliers`,
    )
      .then((data) => {
        if (cancelled) return
        // ה-API שולח DTO עשיר; אנחנו רק מצמצמים לשדות שמוצגים.
        setRows(
          (data as unknown as Array<Record<string, unknown>>).map((r) => ({
            rowKey: String(r.rowKey ?? r.supplierId ?? Math.random()),
            supplierId: String(r.supplierId ?? ""),
            supplierName:
              (r.supplierName as string | null | undefined) ?? null,
            supplierSku: String(r.supplierSku ?? ""),
            unitPrice:
              typeof r.unitPrice === "number"
                ? r.unitPrice
                : r.unitPrice == null
                  ? null
                  : Number(r.unitPrice),
            currency: (r.currency as string | null | undefined) ?? null,
            isPreferred:
              typeof r.isPreferred === "boolean"
                ? r.isPreferred
                : r.isPreferred == null
                  ? null
                  : Boolean(r.isPreferred),
            confidence:
              typeof r.confidence === "number"
                ? r.confidence
                : r.confidence == null
                  ? null
                  : Number(r.confidence),
            matchedByAi: Boolean(r.matchedByAi),
            verifiedByUser: Boolean(r.verifiedByUser),
            validFrom: (r.validFrom as string | null | undefined) ?? null,
            validTo: (r.validTo as string | null | undefined) ?? null,
            sources: Array.isArray(r.sources)
              ? (r.sources as Array<"pricing" | "mapping">)
              : [],
          })),
        )
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : "טעינת ספקים נכשלה")
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

  const columns = React.useMemo<BentoSmartListColumn<SupplierRow>[]>(
    () => [
      {
        key: "supplier",
        title: "ספק",
        className: "min-w-[12rem]",
        render: (row) => (
          <div className="flex items-center gap-1.5">
            <span className="font-medium text-foreground">
              {row.supplierName ?? "ספק ללא שם"}
            </span>
            {row.isPreferred ? (
              <span title="ספק מועדף">
                <Star
                  className="size-3 fill-amber-400 text-amber-500"
                  aria-label="מועדף"
                />
              </span>
            ) : null}
          </div>
        ),
      },
      {
        key: "supplierSku",
        title: "מק״ט ספק",
        className: "w-[8rem] font-mono text-[11px]",
        render: (row) => row.supplierSku || "—",
      },
      {
        key: "price",
        title: "מחיר יחידה",
        className: "w-[9rem] text-xs",
        render: (row) => (
          <span className="font-currency-mono font-semibold tabular-nums">
            {formatPrice(row.unitPrice, row.currency)}
          </span>
        ),
      },
      {
        key: "validity",
        title: "תוקף",
        className: "w-[10rem] text-[11px]",
        render: (row) => {
          if (!row.validFrom && !row.validTo) {
            return <span className="text-muted-foreground">ללא הגבלה</span>
          }
          const from = row.validFrom
            ? dateFormatter.format(new Date(row.validFrom))
            : "—"
          const to = row.validTo
            ? dateFormatter.format(new Date(row.validTo))
            : "—"
          return (
            <span className="text-muted-foreground">
              {from} ← {to}
            </span>
          )
        },
      },
      {
        key: "source",
        title: "מקור",
        className: "w-[8.5rem]",
        render: (row) => {
          const hasPricing = row.sources.includes("pricing")
          const hasMapping = row.sources.includes("mapping")
          return (
            <div className="flex items-center gap-1">
              {hasPricing ? (
                <span
                  className="inline-flex items-center gap-0.5 rounded bg-emerald-500/10 px-1.5 py-0.5 text-[10px] text-emerald-700 dark:text-emerald-400"
                  title="מחירון פעיל"
                >
                  מחירון
                </span>
              ) : null}
              {hasMapping ? (
                <span
                  className="inline-flex items-center gap-0.5 rounded bg-sky-500/10 px-1.5 py-0.5 text-[10px] text-sky-700 dark:text-sky-400"
                  title="זיהוי סמנטי"
                >
                  <Sparkles className="size-2.5" aria-hidden />
                  AI
                </span>
              ) : null}
              {row.verifiedByUser ? (
                <span
                  className="inline-flex items-center gap-0.5 rounded bg-indigo-500/10 px-1.5 py-0.5 text-[10px] text-indigo-700 dark:text-indigo-400"
                  title="אומת ידנית"
                >
                  <CheckCircle2 className="size-2.5" aria-hidden />
                  מאומת
                </span>
              ) : null}
            </div>
          )
        },
      },
      {
        key: "confidence",
        title: "ביטחון",
        className: "w-[5rem] text-xs tabular-nums",
        render: (row) =>
          row.confidence != null ? `${Math.round(row.confidence * 100)}%` : "—",
      },
    ],
    [],
  )

  if (!itemId) {
    return (
      <MasterDetailTabEmpty>
        בחר פריט במסך האב כדי לראות אילו ספקים מספקים אותו ובאיזה מחיר.
      </MasterDetailTabEmpty>
    )
  }
  if (loading) return <MasterDetailTabLoading>טוען ספקים…</MasterDetailTabLoading>
  if (error) return <MasterDetailTabError>{error}</MasterDetailTabError>

  return (
    <BentoSmartList<SupplierRow>
      items={rows}
      columns={columns}
      rowKey={(row) => row.rowKey}
      onRowDoubleClick={(row) =>
        row.supplierId
          ? router.push(
              `/marker-ofek/procurement/suppliers/${encodeURIComponent(row.supplierId)}`,
            )
          : undefined
      }
      emptyState="אין ספקים מוגדרים לפריט זה. הוסף מחירון או הרץ זיהוי סמנטי."
    />
  )
}
