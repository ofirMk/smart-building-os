"use client"

/**
 * /marker-ofek/procurement/goods-receipt — לוח מחוונים קבלת סחורה.
 *
 * • KPI strip: סה"כ תעודות / טיוטות / הושלמו / הושלמו היום.
 * • חיפוש חופשי לפי מספר תעודה, PO, או ספק.
 * • פילטור לפי סטטוס (All / DRAFT / COMPLETED).
 * • לחיצה על שורה → כרטיס GR ב-/receipt/[id].
 */

import * as React from "react"
import { useRouter } from "next/navigation"
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  Loader2,
  Package,
  Plus,
  RefreshCw,
  Search,
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

// ─── Types ────────────────────────────────────────────────────────────────────

type GrRow = {
  id: string
  gr_number: string
  status: string
  receipt_date: string | null
  vendor_delivery_note: string | null
  notes: string | null
  created_at: string
  purchase_order: {
    id: string
    po_number: string
    supplier: { id: string; name: string } | null
  } | null
}

// ─── Status config ────────────────────────────────────────────────────────────

const STATUS_LABEL: Record<string, string> = {
  DRAFT: "טיוטה",
  COMPLETED: "הושלם",
  FINAL: "סופי",
  CANCELLED: "בוטל",
}

const STATUS_CLASS: Record<string, string> = {
  DRAFT: "bg-amber-500/10 text-amber-800 border-amber-500/30",
  COMPLETED: "bg-emerald-500/10 text-emerald-800 border-emerald-500/30",
  FINAL: "bg-violet-500/10 text-violet-800 border-violet-500/30",
  CANCELLED: "bg-rose-500/10 text-rose-700 border-rose-500/30",
}

const FILTER_OPTIONS = [
  { value: "", label: "כל הסטטוסים" },
  { value: "DRAFT", label: "טיוטה — ממתין" },
  { value: "COMPLETED", label: "הושלם" },
  { value: "FINAL", label: "סופי" },
  { value: "CANCELLED", label: "בוטל" },
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

const dateFormatter = new Intl.DateTimeFormat("he-IL", { dateStyle: "medium" })
const todayIso = new Date().toISOString().slice(0, 10)

function formatDate(value: string | null): string {
  if (!value) return "—"
  try {
    return dateFormatter.format(new Date(value))
  } catch {
    return value
  }
}

function isToday(dateStr: string | null): boolean {
  if (!dateStr) return false
  return dateStr.slice(0, 10) === todayIso
}

// ─── KPI card ─────────────────────────────────────────────────────────────────

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
  tone?: "neutral" | "success" | "warning" | "info"
  icon: React.ElementType
}) {
  const toneClass = {
    neutral: "text-muted-foreground",
    success: "text-emerald-700",
    warning: "text-amber-700",
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

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function GoodsReceiptDashboardPage() {
  const router = useRouter()
  const [rows, setRows] = React.useState<GrRow[]>([])
  const [loading, setLoading] = React.useState(true)
  const [loadError, setLoadError] = React.useState<string | null>(null)
  const [searchTerm, setSearchTerm] = React.useState("")
  const [statusFilter, setStatusFilter] = React.useState("")

  const load = React.useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const h = new Headers()
      if (typeof document !== "undefined") {
        const m = document.cookie.match(/active_company_id=([^;]+)/)
        if (m) {
          h.set("x-company-id", m[1])
          h.set("x-active-company-id", m[1])
        }
      }
      const res = await fetch("/api/procurement/goods-receipt", {
        credentials: "same-origin",
        cache: "no-store",
        headers: h,
      })
      const payload = await res.json().catch(() => null)
      if (!res.ok) {
        throw new Error(
          (payload as { error?: string } | null)?.error ??
            `שגיאת שרת ${res.status}`,
        )
      }
      setRows(Array.isArray(payload) ? payload : [])
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "טעינת תעודות הקבלה נכשלה"
      toast.error(message)
      setLoadError(message)
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    void load()
  }, [load])

  const filtered = React.useMemo(() => {
    let result = rows
    if (statusFilter) result = result.filter((r) => r.status === statusFilter)
    const q = searchTerm.trim().toLowerCase()
    if (q) {
      result = result.filter(
        (r) =>
          r.gr_number.toLowerCase().includes(q) ||
          (r.purchase_order?.po_number ?? "").toLowerCase().includes(q) ||
          (r.purchase_order?.supplier?.name ?? "").toLowerCase().includes(q) ||
          (r.vendor_delivery_note ?? "").toLowerCase().includes(q),
      )
    }
    return result
  }, [rows, searchTerm, statusFilter])

  const kpis = React.useMemo(() => {
    const total = rows.length
    const drafts = rows.filter((r) => r.status === "DRAFT").length
    const completed = rows.filter((r) =>
      ["COMPLETED", "FINAL"].includes(r.status),
    ).length
    const today = rows.filter((r) =>
      isToday(r.receipt_date ?? r.created_at),
    ).length
    return { total, drafts, completed, today }
  }, [rows])

  return (
    <div dir="rtl" className="flex h-full flex-col gap-4 overflow-y-auto p-4 pb-8">
      {/* Header */}
      <header className="flex flex-wrap items-end justify-between gap-3 border-b pb-3">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <ClipboardCheck className="size-5" aria-hidden />
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight">
              לוח מחוונים — קבלת סחורה
            </h1>
            <p className="mt-1 text-xs text-muted-foreground">
              {loading
                ? "טוען תעודות קבלה…"
                : `${filtered.length.toLocaleString("he-IL")} מתוך ${rows.length.toLocaleString("he-IL")} תעודות`}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search
              className="pointer-events-none absolute end-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              type="search"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="חיפוש לפי GR# / PO# / ספק…"
              className="h-9 w-64 pe-8 text-xs"
              aria-label="חיפוש תעודות קבלה"
            />
          </div>
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v ?? "ALL")}>
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
            onClick={() => void load()}
            disabled={loading}
            className="gap-1.5"
          >
            <RefreshCw className={cn("size-3.5", loading && "animate-spin")} aria-hidden />
            רענן
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={() => router.push("/marker-ofek/procurement/goods-receipt/new")}
            className="gap-1.5"
          >
            <Plus className="size-3.5" aria-hidden />
            קליטת סחורה חדשה
          </Button>
        </div>
      </header>

      {/* Error banner */}
      {loadError ? (
        <Alert variant="destructive">
          <AlertTriangle className="size-4" aria-hidden />
          <AlertDescription className="flex items-center justify-between gap-3">
            <span>{loadError}</span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void load()}
              className="shrink-0 gap-1.5"
            >
              <RefreshCw className="size-3.5" aria-hidden />
              נסה שוב
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}

      {/* KPI strip */}
      {!loading && rows.length > 0 ? (
        <section
          aria-label="סיכום קבלת סחורה"
          className="grid grid-cols-2 gap-3 sm:grid-cols-4"
        >
          <KpiCard
            title="סה״כ תעודות"
            value={kpis.total.toLocaleString("he-IL")}
            hint="כל הרשומות"
            icon={Package}
            tone="neutral"
          />
          <KpiCard
            title="ממתינות (DRAFT)"
            value={kpis.drafts.toLocaleString("he-IL")}
            hint={kpis.drafts > 0 ? "דורש השלמה" : "אין ממתינות"}
            icon={Clock}
            tone={kpis.drafts > 0 ? "warning" : "success"}
          />
          <KpiCard
            title="הושלמו"
            value={kpis.completed.toLocaleString("he-IL")}
            hint="COMPLETED + FINAL"
            icon={CheckCircle2}
            tone="success"
          />
          <KpiCard
            title="קבלות היום"
            value={kpis.today.toLocaleString("he-IL")}
            hint={todayIso}
            icon={ClipboardCheck}
            tone={kpis.today > 0 ? "info" : "neutral"}
          />
        </section>
      ) : null}

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-5 animate-spin" aria-hidden />
            טוען תעודות קבלה…
          </div>
        </div>
      ) : filtered.length === 0 && !loadError ? (
        <EmptyState
          hasFilter={!!searchTerm || !!statusFilter}
          onNew={() => router.push("/marker-ofek/procurement/goods-receipt/new")}
          onClearFilter={() => { setSearchTerm(""); setStatusFilter("") }}
        />
      ) : (
        <div className="overflow-hidden rounded-lg border border-border">
          <div className="max-w-full overflow-x-auto">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-muted/40">
                <TableRow>
                  <TableHead className="w-[10rem] text-start">מספר תעודה</TableHead>
                  <TableHead className="w-[9rem] text-start">מספר PO</TableHead>
                  <TableHead className="min-w-[12rem] text-start">ספק</TableHead>
                  <TableHead className="w-[7.5rem] text-start">תאריך קבלה</TableHead>
                  <TableHead className="w-[11rem] text-start">תעודת משלוח ספק</TableHead>
                  <TableHead className="w-[7rem] text-start">סטטוס</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((row) => (
                  <TableRow
                    key={row.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => router.push(`/marker-ofek/procurement/receipt/${row.id}`)}
                  >
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-xs font-semibold">{row.gr_number}</span>
                        {isToday(row.receipt_date ?? row.created_at) ? (
                          <Badge variant="outline" className="border-sky-400/30 bg-sky-500/10 px-1 py-0 text-[9px] text-sky-700">
                            היום
                          </Badge>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {row.purchase_order?.po_number ?? <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="max-w-[12rem] truncate text-sm">
                      {row.purchase_order?.supplier?.name ?? <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {formatDate(row.receipt_date ?? row.created_at)}
                    </TableCell>
                    <TableCell className="max-w-[11rem] truncate text-xs text-muted-foreground">
                      {row.vendor_delivery_note ?? "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={cn("text-[10px]", STATUS_CLASS[row.status] ?? "")}>
                        {STATUS_LABEL[row.status] ?? row.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </div>
  )
}

function EmptyState({
  hasFilter,
  onNew,
  onClearFilter,
}: {
  hasFilter: boolean
  onNew: () => void
  onClearFilter: () => void
}) {
  if (hasFilter) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-lg border-2 border-dashed border-border bg-muted/20 p-10 text-center">
        <Search className="size-8 text-muted-foreground" aria-hidden />
        <p className="text-sm font-medium">לא נמצאו תוצאות לסינון הנוכחי</p>
        <Button type="button" variant="outline" size="sm" onClick={onClearFilter} className="gap-1.5">
          נקה פילטר
        </Button>
      </div>
    )
  }
  return (
    <div className="flex flex-col items-center gap-4 rounded-lg border-2 border-dashed border-border bg-muted/20 p-12 text-center">
      <div className="flex size-14 items-center justify-center rounded-full bg-primary/10 text-primary">
        <ClipboardCheck className="size-7" aria-hidden />
      </div>
      <div className="space-y-1">
        <p className="text-sm font-semibold">אין תעודות קבלת סחורה</p>
        <p className="text-xs text-muted-foreground">לחץ &quot;קליטת סחורה חדשה&quot; כדי לתעד את הקבלה הראשונה.</p>
      </div>
      <Button type="button" size="sm" onClick={onNew} className="gap-1.5">
        <Plus className="size-3.5" aria-hidden />
        קליטת סחורה חדשה
      </Button>
    </div>
  )
}
