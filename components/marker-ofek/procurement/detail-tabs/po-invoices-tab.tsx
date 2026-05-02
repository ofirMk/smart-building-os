"use client"

/**
 * POs Master/Detail → Detail tab: חשבוניות ספק (AP).
 *
 * פותח את `/api/procurement/orders/[id]/invoices` (נוצר בזאת) — מחזיר
 * חשבוניות של PO + aggregations של 3-Way Match מ-`erp_invoice_po_line_matches`.
 *
 * ערך עסקי: בחירת PO → רואים מיד איזה חשבוניות הגיעו כנגדה, מה הסטטוס
 * שלהן, ואיפה יש variances. זה קושר את זרימת הרכש ל-AP: אנשי הרכש
 * שואלים "כבר שילמנו?" — פה יש תשובה בקליק.
 */

import * as React from "react"
import { AlertTriangle, CheckCircle2, Clock } from "lucide-react"

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

type InvoiceRow = {
  id: string
  invoiceNumber: string
  status: string
  invoiceDate: string | null
  totalAmount: number
  priceVarianceAmount: number
  totalInvoiceLines: number
  matchedLines: number
  perfectLines: number
  varianceLines: number
  unmatchedLines: number
  varianceImpactValue: number
  needsFirstMatch: boolean
}

const INVOICE_STATUS_LABEL: Record<string, string> = {
  DRAFT: "טיוטה",
  NEW: "חדשה",
  MATCHED: "הותאמה",
  HAS_VARIANCES: "סטיות",
  FINAL: "סופית",
  APPROVED: "מאושרת",
  READY_FOR_PAYMENT: "לתשלום",
  CANCELLED: "בוטלה",
}

const INVOICE_STATUS_TONE: Record<string, string> = {
  DRAFT: "bg-slate-500/10 text-slate-700 dark:text-slate-300",
  NEW: "bg-sky-500/10 text-sky-700 dark:text-sky-400",
  MATCHED: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  HAS_VARIANCES: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
  FINAL: "bg-violet-500/10 text-violet-700 dark:text-violet-400",
  APPROVED: "bg-emerald-500/15 text-emerald-800 dark:text-emerald-300",
  READY_FOR_PAYMENT: "bg-indigo-500/10 text-indigo-700 dark:text-indigo-400",
  CANCELLED: "bg-rose-500/10 text-rose-700 dark:text-rose-400",
}

const dateFormatter = new Intl.DateTimeFormat("he-IL", { dateStyle: "short" })

function formatMoney(value: number): string {
  try {
    return new Intl.NumberFormat("he-IL", {
      style: "currency",
      currency: "ILS",
      maximumFractionDigits: 2,
    }).format(value)
  } catch {
    return `${value.toLocaleString("he-IL")} ILS`
  }
}

export function PoInvoicesTab({ poId }: { poId: string | null }) {
  const [rows, setRows] = React.useState<InvoiceRow[]>([])
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!poId) return
    let cancelled = false
    setLoading(true)
    setError(null)
    masterDataFetch<InvoiceRow[]>(
      `/api/procurement/orders/${encodeURIComponent(poId)}/invoices`,
    )
      .then((data) => {
        if (cancelled) return
        setRows(data)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : "טעינת חשבוניות נכשלה")
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

  const columns = React.useMemo<BentoSmartListColumn<InvoiceRow>[]>(
    () => [
      {
        key: "invoiceNumber",
        title: "מספר חשבונית",
        className: "w-[10rem] font-mono text-[11px] font-semibold",
        render: (r) => r.invoiceNumber,
      },
      {
        key: "date",
        title: "תאריך",
        className: "w-[7rem] text-[11px]",
        render: (r) =>
          r.invoiceDate ? dateFormatter.format(new Date(r.invoiceDate)) : "—",
      },
      {
        key: "total",
        title: "סכום",
        className: "w-[9rem] text-xs",
        render: (r) => (
          <span className="font-currency-mono font-semibold tabular-nums">
            {formatMoney(r.totalAmount)}
          </span>
        ),
      },
      {
        key: "status",
        title: "סטטוס",
        className: "w-[7rem]",
        render: (r) => (
          <span
            className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] ${
              INVOICE_STATUS_TONE[r.status] ??
              "bg-slate-500/10 text-slate-700"
            }`}
          >
            {INVOICE_STATUS_LABEL[r.status] ?? r.status}
          </span>
        ),
      },
      {
        key: "match",
        title: "התאמה",
        className: "min-w-[12rem]",
        render: (r) => {
          if (r.needsFirstMatch) {
            return (
              <span className="inline-flex items-center gap-1 rounded bg-slate-500/10 px-1.5 py-0.5 text-[10px] text-slate-600 dark:text-slate-300">
                <Clock className="size-2.5" aria-hidden />
                טרם רצה התאמה
              </span>
            )
          }
          const chips: React.ReactNode[] = []
          if (r.perfectLines > 0) {
            chips.push(
              <span
                key="perfect"
                className="inline-flex items-center gap-0.5 rounded bg-emerald-500/10 px-1.5 py-0.5 text-[10px] text-emerald-700 dark:text-emerald-400"
                title="שורות ב-PERFECT match"
              >
                <CheckCircle2 className="size-2.5" aria-hidden />
                {r.perfectLines}
              </span>,
            )
          }
          if (r.varianceLines > 0) {
            chips.push(
              <span
                key="variance"
                className="inline-flex items-center gap-0.5 rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] text-amber-700 dark:text-amber-400"
                title="שורות עם variance"
              >
                <AlertTriangle className="size-2.5" aria-hidden />
                {r.varianceLines}
              </span>,
            )
          }
          if (r.unmatchedLines > 0) {
            chips.push(
              <span
                key="unmatched"
                className="inline-flex items-center gap-0.5 rounded bg-rose-500/10 px-1.5 py-0.5 text-[10px] text-rose-700 dark:text-rose-400"
                title="שורות ללא match"
              >
                {r.unmatchedLines}
              </span>,
            )
          }
          return <div className="flex items-center gap-1">{chips}</div>
        },
      },
      {
        key: "impact",
        title: "השפעת סטייה",
        className: "w-[9rem] text-xs",
        render: (r) => {
          if (r.varianceImpactValue === 0) {
            return <span className="text-muted-foreground">—</span>
          }
          const tone =
            r.varianceImpactValue > 0
              ? "text-rose-700 dark:text-rose-400"
              : "text-emerald-700 dark:text-emerald-400"
          return (
            <span className={`font-currency-mono tabular-nums ${tone}`}>
              {r.varianceImpactValue > 0 ? "+" : ""}
              {formatMoney(r.varianceImpactValue)}
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
        בחר הזמנה במסך האב כדי לראות אילו חשבוניות ספק הגיעו כנגדה וסטטוס
        ה-3-Way Match שלהן.
      </MasterDetailTabEmpty>
    )
  }
  if (loading) return <MasterDetailTabLoading>טוען חשבוניות…</MasterDetailTabLoading>
  if (error) return <MasterDetailTabError>{error}</MasterDetailTabError>

  return (
    <BentoSmartList<InvoiceRow>
      items={rows}
      columns={columns}
      rowKey={(r) => r.id}
      emptyState="טרם התקבלה חשבונית ספק כנגד הזמנה זו."
    />
  )
}
