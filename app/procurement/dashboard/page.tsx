"use client"

/**
 * /procurement/dashboard — PO Dashboard
 *
 * Lists all Purchase Orders for the active company and allows DRAFT orders
 * to be submitted for approval via the state-machine transition API.
 *
 * Auth:   Handled entirely by /api/erp/procurement/purchase-orders (RLS +
 *         company membership check via requireProcurementApiContext).
 * Toasts: Provided by <Toaster /> mounted in app/layout.tsx (root level).
 */

import * as React from "react"
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ClipboardList,
  Loader2,
  Package,
  RefreshCw,
} from "lucide-react"
import { toast } from "sonner"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { cn, formatError } from "@/lib/utils"
import type { ErpPurchaseOrder, ErpPurchaseOrderStatus } from "@/types/erp"
import type { POTransitionResponse } from "@/app/api/procurement/po-transition/route"

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

const ILS = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
})

const DATE_FMT = new Intl.DateTimeFormat("he-IL", { dateStyle: "short" })

function fmtDate(iso: string | null): string {
  if (!iso) return "—"
  try {
    return DATE_FMT.format(new Date(iso))
  } catch {
    return iso
  }
}

// ─────────────────────────────────────────────
// Status badge
// ─────────────────────────────────────────────

type StatusConfig = { label: string; className: string }

const STATUS_CONFIG: Partial<Record<ErpPurchaseOrderStatus, StatusConfig>> = {
  DRAFT: {
    label: "טיוטה",
    className: "border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-300",
  },
  PENDING_APPROVAL: {
    label: "ממתין לאישור",
    className: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  },
  APPROVED: {
    label: "מאושר",
    className: "border-indigo-200 bg-indigo-50 text-indigo-700 dark:border-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300",
  },
  SENT: {
    label: "נשלח לספק",
    className: "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-700 dark:bg-sky-900/30 dark:text-sky-300",
  },
  CLOSED: {
    label: "סגור",
    className: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
  },
  CANCELLED: {
    label: "מבוטל",
    className: "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-700 dark:bg-rose-900/30 dark:text-rose-300",
  },
}

function StatusBadge({ status }: { status: ErpPurchaseOrderStatus }) {
  const cfg = STATUS_CONFIG[status]
  return (
    <Badge
      variant="outline"
      className={cn("font-medium", cfg?.className)}
    >
      {cfg?.label ?? status}
    </Badge>
  )
}

// ─────────────────────────────────────────────
// Mobile card
// ─────────────────────────────────────────────

function PoCard({
  po,
  transitioning,
  onSubmit,
}: {
  po: ErpPurchaseOrder
  transitioning: boolean
  onSubmit: (id: string) => void
}) {
  return (
    <li className="rounded-xl border border-border/70 bg-card p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-mono text-sm font-semibold text-indigo-700 dark:text-indigo-400">
            {po.poNumber}
          </p>
          <p className="mt-0.5 truncate text-sm font-medium text-foreground">
            {po.title}
          </p>
        </div>
        <StatusBadge status={po.status} />
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>{ILS.format(po.totalAmount)}</span>
        <span>נוצר {fmtDate(po.issuedAt)}</span>
      </div>
      {po.status === "DRAFT" && (
        <div className="mt-3 border-t border-border/50 pt-3">
          <Button
            size="sm"
            variant="outline"
            className="w-full gap-2 border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 dark:border-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300"
            disabled={transitioning}
            onClick={() => onSubmit(po.id)}
          >
            {transitioning ? (
              <Loader2 className="size-3.5 animate-spin" aria-hidden />
            ) : (
              <ArrowRight className="size-3.5 rotate-180" aria-hidden />
            )}
            שלח לאישור
          </Button>
        </div>
      )}
    </li>
  )
}

// ─────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────

export default function ProcurementDashboardPage() {
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [rows, setRows] = React.useState<ErpPurchaseOrder[]>([])
  // Track which PO ID is currently mid-transition (prevents double-submit)
  const [transitioningId, setTransitioningId] = React.useState<string | null>(null)

  // ── Fetch ───────────────────────────────────────────────────────────────

  const load = React.useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/erp/procurement/purchase-orders", {
        cache: "no-store",
      })
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null
        throw new Error(body?.error ?? `שגיאה ${res.status}`)
      }
      const json = (await res.json()) as { data: ErpPurchaseOrder[] }
      setRows(json.data ?? [])
    } catch (e) {
      setError(formatError(e))
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    void load()
  }, [load])

  // ── Submit DRAFT → APPROVED transition ─────────────────────────────────

  async function handleSubmit(poId: string) {
    if (transitioningId) return // guard concurrent clicks
    setTransitioningId(poId)
    try {
      const res = await fetch("/api/procurement/po-transition", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ poId, transition: "SUBMIT" }),
      })

      const json = (await res.json().catch(() => null)) as
        | POTransitionResponse
        | { ok: false; error?: string; code?: string }
        | null

      if (!res.ok || !json?.ok) {
        const msg =
          (json as { error?: string } | null)?.error ??
          `שגיאה ${res.status}`
        toast.error("המעבר נכשל", { description: msg })
        return
      }

      // Optimistic local update — avoids a full re-fetch round-trip
      const { previousStatus, newStatus } = (json as POTransitionResponse).data
      setRows((prev) =>
        prev.map((po) =>
          po.id === poId ? { ...po, status: newStatus as ErpPurchaseOrder["status"] } : po,
        ) as ErpPurchaseOrder[],
      )
      toast.success("ההזמנה נשלחה לאישור", {
        description: `${previousStatus} → ${newStatus}`,
      })
    } catch (e) {
      toast.error("שגיאה בלתי צפויה", { description: formatError(e) })
    } finally {
      setTransitioningId(null)
    }
  }

  // ── Derived stats ───────────────────────────────────────────────────────

  const draftCount = rows.filter((r) => r.status === "DRAFT").length
  const approvedCount = rows.filter((r) => r.status === "APPROVED").length
  const totalAmount = rows.reduce((s, r) => s + r.totalAmount, 0)

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <div
      className="flex min-h-screen flex-col gap-6 bg-background p-4 pb-16 sm:p-6 sm:pb-20"
      dir="rtl"
    >
      {/* ── Hero header ─────────────────────────────────────────────────── */}
      <header className="pharmacy-hero-card relative overflow-hidden p-5 sm:p-8">
        <div
          className="pointer-events-none absolute -start-20 -top-20 size-64 rounded-full bg-indigo-500/10 blur-3xl"
          aria-hidden
        />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-start gap-3 sm:gap-4">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-indigo-200 bg-indigo-50 text-indigo-700 dark:border-indigo-700 dark:bg-indigo-900/40">
              <ClipboardList className="size-5 sm:size-6" aria-hidden />
            </div>
            <div className="min-w-0 space-y-1">
              <p className="text-xs font-medium uppercase tracking-wider text-indigo-700/90 dark:text-indigo-400">
                רכש · הזמנות
              </p>
              <h1 className="text-pretty text-xl font-bold tracking-tight text-foreground sm:text-3xl">
                לוח בקרה — הזמנות רכש
              </h1>
              <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
                מעקב אחר כל הזמנות הרכש של החברה. הזמנות בסטטוס טיוטה ניתנות
                לשליחה לאישור ישירות מהטבלה.
              </p>
            </div>
          </div>

          {/* KPI tiles */}
          <div className="grid grid-cols-3 gap-2 sm:gap-3">
            <KpiTile
              icon={<ClipboardList className="size-4" aria-hidden />}
              label="סה״כ הזמנות"
              value={String(rows.length)}
              tone="indigo"
            />
            <KpiTile
              icon={<Package className="size-4" aria-hidden />}
              label="טיוטות"
              value={String(draftCount)}
              tone="slate"
            />
            <KpiTile
              icon={<CheckCircle2 className="size-4" aria-hidden />}
              label="מאושרות"
              value={String(approvedCount)}
              tone="emerald"
            />
          </div>
        </div>

        {/* Total amount footer */}
        {!loading && rows.length > 0 && (
          <div className="relative mt-4 border-t border-border/50 pt-4 text-sm text-muted-foreground">
            סה״כ סכום הזמנות:{" "}
            <span className="font-semibold tabular-nums text-foreground">
              {ILS.format(totalAmount)}
            </span>
          </div>
        )}
      </header>

      {/* ── Refresh button ───────────────────────────────────────────────── */}
      <div className="flex items-center justify-end">
        <Button
          variant="outline"
          size="sm"
          className="gap-2"
          disabled={loading}
          onClick={() => void load()}
        >
          <RefreshCw
            className={cn("size-3.5", loading && "animate-spin")}
            aria-hidden
          />
          רענן
        </Button>
      </div>

      {/* ── Loading ──────────────────────────────────────────────────────── */}
      {loading && (
        <div className="flex items-center justify-center gap-2 py-20 text-muted-foreground">
          <Loader2 className="size-6 animate-spin" aria-hidden />
          <span>טוען הזמנות רכש…</span>
        </div>
      )}

      {/* ── Error ────────────────────────────────────────────────────────── */}
      {!loading && error && (
        <Alert variant="destructive">
          <AlertTriangle className="size-4" aria-hidden />
          <AlertTitle>שגיאה בטעינת ההזמנות</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* ── Empty state ──────────────────────────────────────────────────── */}
      {!loading && !error && rows.length === 0 && (
        <section className="rounded-2xl border border-dashed border-border/60 bg-card/70 px-6 py-16 text-center">
          <Package
            className="mx-auto mb-3 size-10 text-indigo-400"
            aria-hidden
          />
          <h2 className="text-lg font-semibold">אין הזמנות רכש</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            לא נמצאו הזמנות רכש לחברה הפעילה.
          </p>
        </section>
      )}

      {/* ── Table / Cards ────────────────────────────────────────────────── */}
      {!loading && !error && rows.length > 0 && (
        <section className="rounded-2xl border border-border/60 bg-card/90 shadow-sm">
          <div className="flex flex-wrap items-center gap-2 border-b border-border/60 px-3 py-3 sm:px-6 sm:py-4">
            <ClipboardList className="size-5 shrink-0 text-indigo-600" aria-hidden />
            <h2 className="text-base font-semibold sm:text-lg">
              כל הזמנות הרכש
            </h2>
            <span className="ml-auto text-xs text-muted-foreground">
              {rows.length} פריטים
            </span>
          </div>

          {/* Mobile cards */}
          <ul className="flex flex-col gap-3 p-3 sm:p-4 md:hidden">
            {rows.map((po) => (
              <PoCard
                key={po.id}
                po={po}
                transitioning={transitioningId === po.id}
                onSubmit={handleSubmit}
              />
            ))}
          </ul>

          {/* Desktop table */}
          <div className="hidden overflow-x-auto md:block">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead className="min-w-[8rem]">מס׳ הזמנה</TableHead>
                  <TableHead className="min-w-[16rem]">כותרת</TableHead>
                  <TableHead className="min-w-[8rem]">סטטוס</TableHead>
                  <TableHead className="min-w-[8rem] text-end">סכום</TableHead>
                  <TableHead className="min-w-[7rem]">תאריך הנפקה</TableHead>
                  <TableHead className="w-[8rem] text-center">פעולה</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((po) => (
                  <PoTableRow
                    key={po.id}
                    po={po}
                    transitioning={transitioningId === po.id}
                    onSubmit={handleSubmit}
                  />
                ))}
              </TableBody>
            </Table>
          </div>
        </section>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────
// PoTableRow — extracted to keep the JSX readable
// ─────────────────────────────────────────────

function PoTableRow({
  po,
  transitioning,
  onSubmit,
}: {
  po: ErpPurchaseOrder
  transitioning: boolean
  onSubmit: (id: string) => void
}) {
  return (
    <TableRow className="group transition-colors hover:bg-muted/30">
      <TableCell>
        <span className="font-mono text-sm font-semibold text-indigo-700 dark:text-indigo-400">
          {po.poNumber}
        </span>
      </TableCell>
      <TableCell>
        <span className="line-clamp-2 max-w-xs text-sm">{po.title}</span>
      </TableCell>
      <TableCell>
        <StatusBadge status={po.status} />
      </TableCell>
      <TableCell className="text-end font-semibold tabular-nums">
        {ILS.format(po.totalAmount)}
      </TableCell>
      <TableCell className="text-sm tabular-nums text-muted-foreground">
        {fmtDate(po.issuedAt)}
      </TableCell>
      <TableCell className="text-center">
        {po.status === "DRAFT" ? (
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5 border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 dark:border-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300"
            disabled={transitioning}
            onClick={() => onSubmit(po.id)}
            aria-label={`שלח הזמנה ${po.poNumber} לאישור`}
          >
            {transitioning ? (
              <Loader2 className="size-3.5 animate-spin" aria-hidden />
            ) : (
              <ArrowRight className="size-3.5 rotate-180" aria-hidden />
            )}
            שלח לאישור
          </Button>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
      </TableCell>
    </TableRow>
  )
}

// ─────────────────────────────────────────────
// KpiTile
// ─────────────────────────────────────────────

type KpiTone = "indigo" | "slate" | "emerald" | "rose"

const KPI_TONE: Record<KpiTone, string> = {
  indigo:
    "border-indigo-200 bg-indigo-50 text-indigo-800 dark:border-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-200",
  slate:
    "border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-600 dark:bg-slate-800/60 dark:text-slate-200",
  emerald:
    "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200",
  rose: "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-700 dark:bg-rose-900/40 dark:text-rose-200",
}

function KpiTile({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode
  label: string
  value: string
  tone: KpiTone
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-0.5 rounded-xl border px-3 py-2 text-center",
        KPI_TONE[tone],
      )}
    >
      <span className="opacity-70">{icon}</span>
      <span className="text-base font-bold tabular-nums leading-tight">
        {value}
      </span>
      <span className="text-[10px] font-medium opacity-70">{label}</span>
    </div>
  )
}
