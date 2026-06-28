"use client"

/**
 * /marker-ofek/procurement/invoices — היסטוריית חשבוניות ספק.
 *
 * • רשימה מלאה של כל חשבוניות הספק (כל הסטטוסים) עם סטטוס 3-Way Match.
 * • KPI strip: סה"כ / ממתינות / עם סטיות / מאושרות.
 * • פילטור לפי סטטוס + חיפוש חופשי.
 * • כפתור "חשבונית חדשה" → /invoices/new (AI OCR + fallback ידני באותו עמוד).
 */

import * as React from "react"
import { useRouter } from "next/navigation"
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleX,
  Clock,
  FilePlus,
  Loader2,
  Receipt,
  RefreshCw,
  Search,
  XCircle,
} from "lucide-react"
import { toast } from "sonner"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { cn } from "@/lib/utils"

// ── Types (mirrors GET /api/finance/invoices) ────────────────────────────────

type InvoiceStatus =
  | "DRAFT"
  | "NEW"
  | "MATCHED"
  | "HAS_VARIANCES"
  | "APPROVED"
  | "READY_FOR_PAYMENT"
  | "FINAL"
  | "CANCELLED"

type InvoiceRow = {
  id: string
  invoiceNumber: string
  status: InvoiceStatus
  invoiceDate: string | null
  totalAmount: number
  priceVarianceAmount: number
  supplierName: string | null
  purchaseOrderId: string | null
  poNumber: string | null
  totalInvoiceLines: number
  matchedLines: number
  perfectLines: number
  varianceLines: number
  unmatchedLines: number
  varianceImpactValue: number
  needsFirstMatch: boolean
}

// ── Constants ────────────────────────────────────────────────────────────────

const STATUS_LABEL: Record<InvoiceStatus, string> = {
  DRAFT: "טיוטה",
  NEW: "חדשה",
  MATCHED: "הותאמה",
  HAS_VARIANCES: "סטיות",
  FINAL: "סופית",
  APPROVED: "מאושרת",
  READY_FOR_PAYMENT: "לתשלום",
  CANCELLED: "בוטלה",
}

const STATUS_CLASS: Record<InvoiceStatus, string> = {
  DRAFT: "bg-slate-500/10 text-slate-700 border-slate-400/30",
  NEW: "bg-sky-500/10 text-sky-700 border-sky-400/30",
  MATCHED: "bg-emerald-500/10 text-emerald-700 border-emerald-400/30",
  HAS_VARIANCES: "bg-amber-500/10 text-amber-700 border-amber-400/30",
  FINAL: "bg-violet-500/10 text-violet-700 border-violet-400/30",
  APPROVED: "bg-emerald-500/15 text-emerald-800 border-emerald-500/30",
  READY_FOR_PAYMENT: "bg-indigo-500/10 text-indigo-700 border-indigo-400/30",
  CANCELLED: "bg-rose-500/10 text-rose-600 border-rose-400/30",
}

const FILTER_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "כל הסטטוסים" },
  { value: "DRAFT", label: "טיוטה" },
  { value: "NEW", label: "חדשה" },
  { value: "MATCHED", label: "הותאמה" },
  { value: "HAS_VARIANCES", label: "סטיות" },
  { value: "FINAL", label: "סופית" },
  { value: "APPROVED", label: "מאושרת" },
  { value: "READY_FOR_PAYMENT", label: "לתשלום" },
  { value: "CANCELLED", label: "בוטלה" },
]

const PAGE_SIZE = 50

const dateFormatter = new Intl.DateTimeFormat("he-IL", { dateStyle: "medium" })
const moneyFormatter = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 2,
})

function formatDate(v: string | null): string {
  if (!v) return "—"
  try {
    return dateFormatter.format(new Date(v))
  } catch {
    return v
  }
}

function formatMoney(v: number): string {
  try {
    return moneyFormatter.format(v)
  } catch {
    return v.toLocaleString("he-IL")
  }
}

// ── Match-status badge ────────────────────────────────────────────────────────

type MatchIcon = "clean" | "variance" | "unmatched" | "pending"

function resolveMatchIcon(row: InvoiceRow): MatchIcon {
  if (row.status === "CANCELLED") return "unmatched"
  if (row.needsFirstMatch) return "pending"
  if (row.unmatchedLines > 0 || row.varianceLines > 0) return "variance"
  return "clean"
}

function MatchStatusBadge({ row }: { row: InvoiceRow }) {
  const icon = resolveMatchIcon(row)

  if (icon === "clean") {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700">
        <CheckCircle2 className="size-3.5" aria-hidden />
        התאמה מלאה
      </span>
    )
  }
  if (icon === "variance") {
    const parts: string[] = []
    if (row.varianceLines > 0) parts.push(`${row.varianceLines} סטיות`)
    if (row.unmatchedLines > 0) parts.push(`${row.unmatchedLines} ללא match`)
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700">
        <AlertTriangle className="size-3.5" aria-hidden />
        {parts.join(" · ")}
      </span>
    )
  }
  if (icon === "pending") {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
        <Clock className="size-3.5" aria-hidden />
        טרם הורצה התאמה
      </span>
    )
  }
  // unmatched / cancelled
  return (
    <span className="inline-flex items-center gap-1 text-xs text-rose-600">
      <CircleX className="size-3.5" aria-hidden />
      בוטלה
    </span>
  )
}

// ── KPI card ─────────────────────────────────────────────────────────────────

function KpiCard({
  title,
  value,
  hint,
  tone = "neutral",
  icon: Icon,
}: {
  title: string
  value: string
  hint?: string
  tone?: "neutral" | "success" | "warning" | "danger" | "info"
  icon: React.ElementType
}) {
  const toneClass = {
    neutral: "text-muted-foreground",
    success: "text-emerald-700",
    warning: "text-amber-700",
    danger: "text-rose-700",
    info: "text-sky-700",
  }[tone]

  return (
    <Card className="rounded-xl border border-border bg-card">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 pt-3">
        <CardTitle className="text-xs font-medium text-muted-foreground">
          {title}
        </CardTitle>
        <Icon className={cn("size-4", toneClass)} aria-hidden />
      </CardHeader>
      <CardContent className="pb-3">
        <div className={cn("text-2xl font-bold tabular-nums", toneClass)}>
          {value}
        </div>
        {hint ? (
          <p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p>
        ) : null}
      </CardContent>
    </Card>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function InvoiceHistoryPage() {
  const router = useRouter()
  const [rows, setRows] = React.useState<InvoiceRow[]>([])
  const [loading, setLoading] = React.useState(true)
  const [loadError, setLoadError] = React.useState<string | null>(null)
  const [searchTerm, setSearchTerm] = React.useState("")
  const [statusFilter, setStatusFilter] = React.useState("")
  const [page, setPage] = React.useState(1)
  const [totalRows, setTotalRows] = React.useState(0)

  // ── Fetch ────────────────────────────────────────────────────────────────
  const load = React.useCallback(
    async (targetPage = 1, targetStatus = statusFilter) => {
      setLoading(true)
      setLoadError(null)
      try {
        const url = new URL("/api/finance/invoices", window.location.origin)
        url.searchParams.set("page", String(targetPage))
        url.searchParams.set("limit", String(PAGE_SIZE))
        if (targetStatus) url.searchParams.set("status", targetStatus)
        if (searchTerm.trim()) url.searchParams.set("q", searchTerm.trim())

        const h = new Headers()
        if (typeof document !== "undefined") {
          const m = document.cookie.match(/active_company_id=([^;]+)/)
          if (m) {
            h.set("x-company-id", m[1])
            h.set("x-active-company-id", m[1])
          }
        }

        const res = await fetch(url.toString(), {
          credentials: "same-origin",
          cache: "no-store",
          headers: h,
        })
        const payload = (await res.json()) as {
          data?: InvoiceRow[]
          error?: string
          total?: number
        }
        if (!res.ok) throw new Error(payload.error ?? `שגיאת שרת ${res.status}`)
        setRows(payload.data ?? [])
        setTotalRows(payload.total ?? 0)
        setPage(targetPage)
      } catch (err) {
        const message = err instanceof Error ? err.message : "טעינת החשבוניות נכשלה"
        toast.error(message)
        setLoadError(message)
        setRows([])
      } finally {
        setLoading(false)
      }
    },
    [statusFilter, searchTerm],
  )

  React.useEffect(() => {
    void load(1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Client-side text filter (on current page) ────────────────────────────
  const filtered = React.useMemo(() => {
    const q = searchTerm.trim().toLowerCase()
    if (!q) return rows
    return rows.filter(
      (r) =>
        r.invoiceNumber.toLowerCase().includes(q) ||
        (r.supplierName ?? "").toLowerCase().includes(q) ||
        (r.poNumber ?? "").toLowerCase().includes(q),
    )
  }, [rows, searchTerm])

  // ── KPI computation (from current page — approximate for large datasets) ─
  const kpis = React.useMemo(() => {
    const pending = rows.filter((r) =>
      ["DRAFT", "NEW"].includes(r.status),
    ).length
    const hasVariances = rows.filter((r) => r.status === "HAS_VARIANCES").length
    const approved = rows.filter((r) =>
      ["APPROVED", "READY_FOR_PAYMENT", "MATCHED"].includes(r.status),
    ).length
    const totalVarianceValue = rows.reduce(
      (s, r) => s + r.varianceImpactValue,
      0,
    )
    return { pending, hasVariances, approved, totalVarianceValue }
  }, [rows])

  const totalPages = Math.ceil(totalRows / PAGE_SIZE)

  return (
    <div dir="rtl" className="flex h-full flex-col gap-4 overflow-y-auto p-4 pb-8">
      {/* ── Header ────────────────────────────────────────────────────────── */}
      <header className="flex flex-wrap items-end justify-between gap-3 border-b pb-3">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Receipt className="size-5" aria-hidden />
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight">
              היסטוריית חשבוניות ספק
            </h1>
            <p className="mt-1 text-xs text-muted-foreground">
              {loading
                ? "טוען חשבוניות…"
                : totalRows > PAGE_SIZE
                  ? `עמוד ${page} — ${rows.length.toLocaleString("he-IL")} מתוך ${totalRows.toLocaleString("he-IL")} חשבוניות`
                  : `${rows.length.toLocaleString("he-IL")} חשבוניות`}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* Search */}
          <div className="relative">
            <Search
              className="pointer-events-none absolute end-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              type="search"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void load(1)
              }}
              placeholder="חיפוש לפי מספר / ספק / PO…"
              className="h-9 w-64 pe-8 text-xs"
              aria-label="חיפוש חשבוניות"
            />
          </div>
          {/* Status filter */}
          <Select
            value={statusFilter}
            onValueChange={(val) => {
              setStatusFilter(val ?? "ALL")
              void load(1, val ?? undefined)
            }}
          >
            <SelectTrigger className="h-9 w-40 text-xs" aria-label="סנן לפי סטטוס">
              <SelectValue placeholder="כל הסטטוסים" />
            </SelectTrigger>
            <SelectContent>
              {FILTER_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value} className="text-xs">
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void load(1)}
            disabled={loading}
            className="gap-1.5"
          >
            <RefreshCw
              className={cn("size-3.5", loading && "animate-spin")}
              aria-hidden
            />
            רענן
          </Button>
          {/* New invoice — AI OCR + manual fallback in the same page */}
          <Button
            type="button"
            size="sm"
            onClick={() => router.push("/marker-ofek/procurement/invoices/new")}
            className="gap-1.5"
          >
            <FilePlus className="size-3.5" aria-hidden />
            חשבונית חדשה
          </Button>
        </div>
      </header>

      {/* ── Error banner ──────────────────────────────────────────────────── */}
      {loadError ? (
        <Alert variant="destructive">
          <AlertTriangle className="size-4" aria-hidden />
          <AlertDescription className="flex items-center justify-between gap-3">
            <span>{loadError}</span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void load(1)}
              className="shrink-0 gap-1.5"
            >
              <RefreshCw className="size-3.5" aria-hidden />
              נסה שוב
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}

      {/* ── KPI strip ─────────────────────────────────────────────────────── */}
      {!loading && rows.length > 0 ? (
        <section
          aria-label="סיכום חשבוניות ספק"
          className="grid grid-cols-2 gap-3 sm:grid-cols-4"
        >
          <KpiCard
            title="סה״כ בעמוד"
            value={rows.length.toLocaleString("he-IL")}
            hint={totalRows > rows.length ? `מתוך ${totalRows.toLocaleString("he-IL")} סה"כ` : undefined}
            icon={Receipt}
            tone="neutral"
          />
          <KpiCard
            title="ממתינות לעיבוד"
            value={kpis.pending.toLocaleString("he-IL")}
            hint={kpis.pending > 0 ? "DRAFT / NEW" : "אין ממתינות"}
            icon={Clock}
            tone={kpis.pending > 0 ? "warning" : "success"}
          />
          <KpiCard
            title="עם סטיות"
            value={kpis.hasVariances.toLocaleString("he-IL")}
            hint={kpis.hasVariances > 0 ? "דורש בדיקה" : "ללא סטיות"}
            icon={AlertTriangle}
            tone={kpis.hasVariances > 0 ? "danger" : "success"}
          />
          <KpiCard
            title="אושרו / הותאמו"
            value={kpis.approved.toLocaleString("he-IL")}
            hint="MATCHED / APPROVED / לתשלום"
            icon={CheckCircle2}
            tone="success"
          />
        </section>
      ) : null}

      {/* ── Content ───────────────────────────────────────────────────────── */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-5 animate-spin" aria-hidden />
            טוען חשבוניות…
          </div>
        </div>
      ) : filtered.length === 0 && !loadError ? (
        <EmptyState onNew={() => router.push("/marker-ofek/procurement/invoices/new")} />
      ) : (
        <>
          <div className="overflow-hidden rounded-lg border border-border">
            <div className="max-w-full overflow-x-auto">
              <Table>
                <TableHeader className="sticky top-0 z-10 bg-muted/40">
                  <TableRow>
                    <TableHead className="w-[10rem] text-start">מספר חשבונית</TableHead>
                    <TableHead className="min-w-[11rem] text-start">ספק</TableHead>
                    <TableHead className="w-[9rem] text-start">מספר PO</TableHead>
                    <TableHead className="w-[7.5rem] text-start">תאריך</TableHead>
                    <TableHead className="w-[9rem] text-end">סכום</TableHead>
                    <TableHead className="w-[8rem] text-start">סטטוס</TableHead>
                    <TableHead className="min-w-[13rem] text-start">3-Way Match</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((row) => (
                    <InvoiceTableRow key={row.id} row={row} />
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>

          {/* Pagination */}
          {totalPages > 1 ? (
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>
                עמוד {page} מתוך {totalPages}
              </span>
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => void load(page - 1)}
                  disabled={page <= 1 || loading}
                  className="h-7 w-7 p-0"
                  aria-label="עמוד קודם"
                >
                  <ChevronRight className="size-3.5" aria-hidden />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => void load(page + 1)}
                  disabled={page >= totalPages || loading}
                  className="h-7 w-7 p-0"
                  aria-label="עמוד הבא"
                >
                  <ChevronLeft className="size-3.5" aria-hidden />
                </Button>
              </div>
            </div>
          ) : null}
        </>
      )}
    </div>
  )
}

// ── Invoice table row ─────────────────────────────────────────────────────────

function InvoiceTableRow({ row }: { row: InvoiceRow }) {
  const matchIcon = resolveMatchIcon(row)

  return (
    <TableRow
      className={cn(
        "transition-colors",
        row.status === "CANCELLED" && "opacity-60",
        row.status === "HAS_VARIANCES" && "bg-amber-50/30 dark:bg-amber-900/10",
      )}
    >
      <TableCell className="font-mono text-xs font-semibold">
        {row.invoiceNumber}
      </TableCell>
      <TableCell className="max-w-[11rem] truncate text-sm">
        {row.supplierName ?? (
          <span className="text-muted-foreground">—</span>
        )}
      </TableCell>
      <TableCell className="font-mono text-xs">
        {row.poNumber ?? <span className="text-muted-foreground">—</span>}
      </TableCell>
      <TableCell className="text-xs text-muted-foreground">
        {formatDate(row.invoiceDate)}
      </TableCell>
      <TableCell className="text-end">
        <span className="font-currency-mono text-xs font-semibold tabular-nums">
          {formatMoney(row.totalAmount)}
        </span>
        {row.varianceImpactValue !== 0 ? (
          <div
            className={cn(
              "text-[10px] tabular-nums",
              row.varianceImpactValue > 0
                ? "text-rose-600"
                : "text-emerald-600",
            )}
          >
            {row.varianceImpactValue > 0 ? "+" : ""}
            {formatMoney(row.varianceImpactValue)} Δ
          </div>
        ) : null}
      </TableCell>
      <TableCell>
        <Badge
          variant="outline"
          className={cn(
            "text-[10px]",
            STATUS_CLASS[row.status] ?? "bg-slate-100",
          )}
        >
          {STATUS_LABEL[row.status] ?? row.status}
        </Badge>
      </TableCell>
      <TableCell>
        <div className="flex flex-col gap-0.5">
          <MatchStatusBadge row={row} />
          {/* Variance impact hint */}
          {matchIcon === "variance" && row.varianceImpactValue !== 0 ? (
            <span className="text-[10px] text-amber-600">
              השפעה: {formatMoney(Math.abs(row.varianceImpactValue))}
            </span>
          ) : null}
          {/* Line counts when available */}
          {!row.needsFirstMatch && row.status !== "CANCELLED" ? (
            <span className="text-[10px] text-muted-foreground">
              {row.perfectLines}/{row.totalInvoiceLines} שורות תקינות
            </span>
          ) : null}
        </div>
      </TableCell>
    </TableRow>
  )
}

// ── Empty state ───────────────────────────────────────────────────────────────

function EmptyState({ onNew }: { onNew: () => void }) {
  return (
    <div className="flex flex-col items-center gap-4 rounded-lg border-2 border-dashed border-border bg-muted/20 p-12 text-center">
      <div className="flex size-14 items-center justify-center rounded-full bg-primary/10 text-primary">
        <Receipt className="size-7" aria-hidden />
      </div>
      <div className="space-y-1">
        <p className="text-sm font-semibold">אין חשבוניות ספק</p>
        <p className="text-xs text-muted-foreground">
          הוסף חשבונית חדשה דרך AI OCR או הזנה ידנית.
        </p>
      </div>
      <div className="flex items-center gap-2">
        <Button type="button" size="sm" onClick={onNew} className="gap-1.5">
          <FilePlus className="size-3.5" aria-hidden />
          חשבונית חדשה (AI / ידני)
        </Button>
      </div>
      <p className="max-w-xs text-[11px] text-muted-foreground">
        אם ה-AI OCR נכשל, ניתן לעבור להזנה ידנית מאותו עמוד.
      </p>
    </div>
  )
}
