"use client"

/**
 * POs Master/Detail → Detail tab: סטטוס קליטה (GR).
 *
 * פותח את `/api/procurement/orders/[id]/receipt-context` (Phase 8.2) —
 * לכל שורה: הוזמן / נקלט / נותר לקבלה. זו בדיוק הטבלה שהמחסנאי רואה
 * בעמדת הקליטה, ועכשיו גם ה-procurement user רואה אותה בלי לעזוב
 * את הרשימה.
 *
 * ערך עסקי: בחירת PO → מיד רואים איזה שורות נקלטו במלואן, איזה עדיין
 * פתוחות, ואיזה נקלטו חלקית. ההחלטה "לסגור / להמתין / להתריע לספק"
 * מתקבלת מכאן בלי ניווט.
 */

import * as React from "react"
import { CheckCircle2, Clock, Loader2 } from "lucide-react"

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

type ReceiptLineRow = {
  id: string
  itemId: string | null
  itemNumber: string | null
  itemSku: string | null
  description: string
  orderedQty: number
  receivedQty: number
  remainingQty: number
}

type ReceiptContextResp = {
  id: string
  status: string
  lines: ReceiptLineRow[]
}

const numberFormatter = new Intl.NumberFormat("he-IL", {
  maximumFractionDigits: 2,
})

type ReceiptStatus = "pending" | "partial" | "complete"

function classify(line: ReceiptLineRow): ReceiptStatus {
  if (line.receivedQty <= 0) return "pending"
  if (line.remainingQty > 0) return "partial"
  return "complete"
}

export function ReceiptTab({ poId }: { poId: string | null }) {
  const [rows, setRows] = React.useState<ReceiptLineRow[]>([])
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!poId) return
    let cancelled = false
    setLoading(true)
    setError(null)
    masterDataFetch<ReceiptContextResp>(
      `/api/procurement/orders/${encodeURIComponent(poId)}/receipt-context`,
    )
      .then((data) => {
        if (cancelled) return
        setRows(data.lines ?? [])
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : "טעינת סטטוס קליטה נכשלה")
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

  const columns = React.useMemo<BentoSmartListColumn<ReceiptLineRow>[]>(
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
        className: "min-w-[16rem]",
        render: (r) => (
          <span className="block truncate font-medium text-foreground">
            {r.description}
          </span>
        ),
      },
      {
        key: "ordered",
        title: "הוזמן",
        className: "w-[5rem] text-xs tabular-nums text-muted-foreground",
        render: (r) => numberFormatter.format(r.orderedQty),
      },
      {
        key: "received",
        title: "נקלט",
        className: "w-[5rem] text-xs tabular-nums",
        render: (r) => (
          <span className="font-medium text-foreground">
            {numberFormatter.format(r.receivedQty)}
          </span>
        ),
      },
      {
        key: "remaining",
        title: "נותר",
        className: "w-[5rem] text-xs tabular-nums",
        render: (r) => {
          const tone =
            r.remainingQty <= 0
              ? "text-emerald-700 dark:text-emerald-400"
              : "text-amber-700 dark:text-amber-400"
          return <span className={tone}>{numberFormatter.format(r.remainingQty)}</span>
        },
      },
      {
        key: "progress",
        title: "התקדמות",
        className: "w-[10rem]",
        render: (r) => {
          const pct =
            r.orderedQty > 0
              ? Math.min(100, Math.round((r.receivedQty / r.orderedQty) * 100))
              : 0
          return (
            <div className="flex items-center gap-1.5">
              <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
                <div
                  className={
                    pct === 100
                      ? "h-full bg-emerald-500"
                      : pct > 0
                        ? "h-full bg-amber-500"
                        : "h-full bg-slate-300"
                  }
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span className="text-[10px] tabular-nums text-muted-foreground">
                {pct}%
              </span>
            </div>
          )
        },
      },
      {
        key: "status",
        title: "מצב",
        className: "w-[7rem]",
        render: (r) => {
          const status = classify(r)
          if (status === "complete") {
            return (
              <span
                className="inline-flex items-center gap-1 rounded bg-emerald-500/10 px-1.5 py-0.5 text-[10px] text-emerald-700 dark:text-emerald-400"
                title="נקלט במלואו"
              >
                <CheckCircle2 className="size-2.5" aria-hidden />
                הושלם
              </span>
            )
          }
          if (status === "partial") {
            return (
              <span
                className="inline-flex items-center gap-1 rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] text-amber-700 dark:text-amber-400"
                title="נקלט חלקית"
              >
                <Loader2 className="size-2.5" aria-hidden />
                חלקי
              </span>
            )
          }
          return (
            <span
              className="inline-flex items-center gap-1 rounded bg-slate-500/10 px-1.5 py-0.5 text-[10px] text-slate-700 dark:text-slate-300"
              title="ממתין לקליטה"
            >
              <Clock className="size-2.5" aria-hidden />
              ממתין
            </span>
          )
        },
      },
    ],
    [],
  )

  if (!poId) {
    return (
      <MasterDetailTabEmpty>
        בחר הזמנה במסך האב כדי לראות מה כבר נקלט ומה עדיין פתוח.
      </MasterDetailTabEmpty>
    )
  }
  if (loading) return <MasterDetailTabLoading>טוען סטטוס קליטה…</MasterDetailTabLoading>
  if (error) return <MasterDetailTabError>{error}</MasterDetailTabError>

  return (
    <BentoSmartList<ReceiptLineRow>
      items={rows}
      columns={columns}
      rowKey={(r) => r.id}
      emptyState="אין שורות בהזמנה זו."
    />
  )
}
