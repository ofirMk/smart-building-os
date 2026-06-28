"use client"

/**
 * OrdersListScaffold — Phase 8.3.X.
 *
 * שני השלב של סטנדרט ה-Master/Detail (אחרי items catalog): מסך רשימת
 * הזמנות הרכש.
 *
 *   • Master (למעלה): data grid של כל ה-POs של החברה — PO#, ספק, סטטוס,
 *     תאריך, סכום; single click = בחירה, double click = כרטיס PO מלא.
 *   • Detail (למטה, ב-tabs):
 *       1. שורות ההזמנה — הפריטים עצמם + סטייה + יצרן + תאריך אספקה.
 *       2. סטטוס קליטה — הוזמן / נקלט / נותר, progress bar.
 *       3. אישורים — שרשרת האישורים המחושבת + הרשומות בפועל.
 *       4. חשבוניות — vendor invoices שהגיעו כנגד ה-PO + 3-Way Match
 *          aggregations (perfect / variance / unmatched).
 *
 * ערך עסקי: משתמש הרכש לא נאלץ לפתוח כל כרטיס כדי לבדוק "מה בפנים,
 * מה נקלט, מי חתם, האם הגיעה חשבונית". הכול בקליק אחד.
 *
 * שימו לב: ה-page.tsx הפך ל-thin wrapper (ראו
 * `app/(dashboard)/marker-ofek/procurement/orders/page.tsx`).
 */

import * as React from "react"
import { usePathname, useRouter } from "next/navigation"
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  FileCheck,
  FileText,
  Filter,
  Loader2,
  Package,
  Plus,
  Receipt,
  RefreshCw,
  Search,
  ShoppingCart,
  SlidersHorizontal,
  X,
} from "lucide-react"
import { toast } from "sonner"

import {
  BentoSmartList,
  type BentoSmartListColumn,
} from "@/components/ui/bento-smart-list"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { MasterDetailShell } from "@/components/infrastructure/master-detail/master-detail-shell"
import { PoLinesTab } from "@/components/marker-ofek/procurement/detail-tabs/po-lines-tab"
import { ReceiptTab } from "@/components/marker-ofek/procurement/detail-tabs/receipt-tab"
import { ApprovalsTab } from "@/components/marker-ofek/procurement/detail-tabs/approvals-tab"
import { PoInvoicesTab } from "@/components/marker-ofek/procurement/detail-tabs/po-invoices-tab"
import { PoStatusBadge } from "@/components/marker-ofek/procurement/po-status-badge"
import { PoSubmitButton } from "@/components/marker-ofek/procurement/po-submit-button"
import { masterDataFetch } from "@/lib/erp/master-data-browser"
import { usePoStatusTypes } from "@/lib/hooks/use-po-status-types"
import {
  getAvailableTransitions,
  isTransitionAllowed,
  type POStatus,
} from "@/lib/procurement/po-state-machine"
import { cn } from "@/lib/utils"

// ----------------------------------------------------------------------------
// Types — תואם /api/procurement/orders (GET list)
// ----------------------------------------------------------------------------

type PoRow = {
  id: string
  poNumber: string
  title: string
  status: string
  totalAmount: number
  currency: string
  issuedAt: string | null
  createdAt: string
  notes: string | null
  supplier: {
    id: string
    name: string
    supplierNum: string | null
  } | null
}

// ----------------------------------------------------------------------------
// Status classification
// ----------------------------------------------------------------------------
// Phase B' — הוסרו מפות STATUS_LABEL ו-statusTone ה-hardcoded. עכשיו התצוגה
// מגיעה מ-erp_po_status_types (Phase A seed) דרך usePoStatusTypes() + <PoStatusBadge />.
//
// ה-KPI classification משתמש ב-legacy sets כ fallback בלבד כשה-hook עדיין
// טוען — ברגע שה-hook טוען, פונה אל ה-statusMap (lifecycle_stage + is_closed +
// is_cancelled + is_post_approval) לסיווג שמופגן בה-DB.

const LEGACY_PENDING_STATUSES = new Set([
  "PENDING",
  "PENDING_APPROVAL",
  "PENDING_PRICE_APPROVAL",
  "PENDING_CEO_APPROVAL",
])
const LEGACY_OPEN_FOR_RECEIPT_STATUSES = new Set([
  "APPROVED",
  "ISSUED",
  "SENT_TO_SUPPLIER",
  "PARTIALLY_RECEIVED",
  "ON_SHIP",
  "SHIPMENT_CONFIRMED",
])
const LEGACY_CLOSED_STATUSES = new Set([
  "FULLY_RECEIVED",
  "RECEIVED",
  "CLOSED",
  "CANCELED",
  "CANCELLED",
])

// ----------------------------------------------------------------------------
// Formatters
// ----------------------------------------------------------------------------

const dateFormatter = new Intl.DateTimeFormat("he-IL", { dateStyle: "short" })

function formatMoney(value: number, currency: string | null): string {
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

function formatMoneyCompact(value: number, currency: string | null): string {
  const cur = currency ?? "ILS"
  try {
    return new Intl.NumberFormat("he-IL", {
      style: "currency",
      currency: cur,
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(value)
  } catch {
    return `${value.toLocaleString("he-IL")} ${cur}`
  }
}

// ----------------------------------------------------------------------------
// Helpers — URL state sync (no useSearchParams to avoid Suspense boundary)
// ----------------------------------------------------------------------------

function readUrlFilters() {
  if (typeof window === "undefined") return {}
  const p = new URLSearchParams(window.location.search)
  return {
    searchTerm: p.get("q") ?? "",
    statusFilter: p.get("status") ?? "",
    selectedStatuses: p.get("statuses") ? p.get("statuses")!.split(",").filter(Boolean) : [],
    dateFrom: p.get("dateFrom") ?? "",
    dateTo: p.get("dateTo") ?? "",
    amountMin: p.get("amountMin") ?? "",
    amountMax: p.get("amountMax") ?? "",
    supplierSearch: p.get("supplier") ?? "",
  }
}

// ----------------------------------------------------------------------------
// Component
// ----------------------------------------------------------------------------

export function OrdersListScaffold() {
  const router = useRouter()
  const pathname = usePathname()
  const [rows, setRows] = React.useState<PoRow[]>([])
  const [loading, setLoading] = React.useState(true)
  const [loadError, setLoadError] = React.useState<string | null>(null)
  const [activePoId, setActivePoId] = React.useState<string | null>(null)
  const [page, setPage] = React.useState(1)
  const [totalRows, setTotalRows] = React.useState(0)
  const PAGE_SIZE = 50

  // ── Phase 4.1: Advanced filter state (initialised from URL) ──────────────
  const initFilters = React.useMemo(() => readUrlFilters(), [])
  const [searchTerm, setSearchTerm] = React.useState(initFilters.searchTerm ?? "")
  const [statusFilter, setStatusFilter] = React.useState(initFilters.statusFilter ?? "")
  const [selectedStatuses, setSelectedStatuses] = React.useState<string[]>(
    initFilters.selectedStatuses ?? [],
  )
  const [dateFrom, setDateFrom] = React.useState(initFilters.dateFrom ?? "")
  const [dateTo, setDateTo] = React.useState(initFilters.dateTo ?? "")
  const [amountMin, setAmountMin] = React.useState(initFilters.amountMin ?? "")
  const [amountMax, setAmountMax] = React.useState(initFilters.amountMax ?? "")
  const [supplierSearch, setSupplierSearch] = React.useState(initFilters.supplierSearch ?? "")
  const [advancedOpen, setAdvancedOpen] = React.useState(false)

  // ── Phase 4.2: Bulk selection ─────────────────────────────────────────────
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set())
  const [bulkLoading, setBulkLoading] = React.useState(false)

  // Phase B' — status meta from DB
  const { statusMap } = usePoStatusTypes()

  // ── Sync URL on filter changes ────────────────────────────────────────────
  const syncUrl = React.useCallback(
    (overrides: Partial<{
      q: string; status: string; statuses: string[]; dateFrom: string; dateTo: string;
      amountMin: string; amountMax: string; supplier: string
    }>) => {
      const p = new URLSearchParams()
      const q = overrides.q ?? searchTerm
      const st = overrides.status ?? statusFilter
      const sts = overrides.statuses ?? selectedStatuses
      const df = overrides.dateFrom ?? dateFrom
      const dt = overrides.dateTo ?? dateTo
      const aMin = overrides.amountMin ?? amountMin
      const aMax = overrides.amountMax ?? amountMax
      const sup = overrides.supplier ?? supplierSearch
      if (q) p.set("q", q)
      if (st) p.set("status", st)
      if (sts.length) p.set("statuses", sts.join(","))
      if (df) p.set("dateFrom", df)
      if (dt) p.set("dateTo", dt)
      if (aMin) p.set("amountMin", aMin)
      if (aMax) p.set("amountMax", aMax)
      if (sup) p.set("supplier", sup)
      const qs = p.toString()
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
    },
    [router, pathname, searchTerm, statusFilter, selectedStatuses, dateFrom, dateTo, amountMin, amountMax, supplierSearch],
  )

  // ── Load (callback כדי שנוכל לרענן אחרי quick-actions כגון submit) ──
  const loadOrders = React.useCallback(
    async (
      targetPage = 1,
      opts?: {
        status?: string
        statuses?: string[]
        dateFrom?: string
        dateTo?: string
        amountMin?: string
        amountMax?: string
      },
    ) => {
      setLoading(true)
      setLoadError(null)
      try {
        const url = new URL("/api/procurement/orders", window.location.origin)
        url.searchParams.set("page", String(targetPage))
        url.searchParams.set("limit", String(PAGE_SIZE))
        const st = opts?.status ?? statusFilter
        const sts = opts?.statuses ?? selectedStatuses
        const df = opts?.dateFrom ?? dateFrom
        const dt = opts?.dateTo ?? dateTo
        const aMin = opts?.amountMin ?? amountMin
        const aMax = opts?.amountMax ?? amountMax
        if (st) url.searchParams.set("status", st)
        if (sts.length) url.searchParams.set("statuses", sts.join(","))
        if (df) url.searchParams.set("dateFrom", df)
        if (dt) url.searchParams.set("dateTo", dt)
        if (aMin) url.searchParams.set("amountMin", aMin)
        if (aMax) url.searchParams.set("amountMax", aMax)

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
          data?: PoRow[]
          error?: string
          total?: number
          page?: number
        }
        if (!res.ok) throw new Error(payload.error ?? `שגיאת שרת ${res.status}`)
        setRows(payload.data ?? [])
        setTotalRows(payload.total ?? 0)
        setPage(targetPage)
        setSelectedIds(new Set()) // clear selection on reload
      } catch (error) {
        const message = error instanceof Error ? error.message : "טעינת הזמנות הרכש נכשלה"
        toast.error(message)
        setLoadError(message)
        setRows([])
      } finally {
        setLoading(false)
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [PAGE_SIZE, statusFilter, selectedStatuses, dateFrom, dateTo, amountMin, amountMax],
  )

  // ── Load on mount ────────────────────────────────────────────────────
  React.useEffect(() => {
    void loadOrders()
  }, [loadOrders])

  // ── Filter (client-side: text search + supplier) ─────────────────────
  const filteredRows = React.useMemo(() => {
    let result = rows
    const trimmed = searchTerm.trim().toLowerCase()
    if (trimmed) {
      result = result.filter(
        (row) =>
          row.poNumber.toLowerCase().includes(trimmed) ||
          row.title.toLowerCase().includes(trimmed) ||
          (row.supplier?.name ?? "").toLowerCase().includes(trimmed),
      )
    }
    const sup = supplierSearch.trim().toLowerCase()
    if (sup) {
      result = result.filter((row) =>
        (row.supplier?.name ?? "").toLowerCase().includes(sup),
      )
    }
    return result
  }, [rows, searchTerm, supplierSearch])

  // ── KPI classifier helpers — dynamic from statusMap + legacy fallback ───
  const classifyStatus = React.useCallback(
    (status: string): "pending" | "open" | "closed" | "other" => {
      const meta = statusMap[status]
      if (meta) {
        if (meta.isCancelled || meta.isClosed) return "closed"
        // FULLY_RECEIVED — נסגור גם אם ה-PO לא נסגר פורמלית.
        if (meta.status === "FULLY_RECEIVED") return "closed"
        if (meta.status === "PENDING_APPROVAL" || meta.status === "PENDING_PRICE_APPROVAL") {
          return "pending"
        }
        if (meta.allowsGr || meta.isPostApproval) return "open"
        return "other"
      }
      // Fallback ל-legacy כאשר ה-hook עדיין לא נטען (ה-flash הראשון).
      if (LEGACY_PENDING_STATUSES.has(status)) return "pending"
      if (LEGACY_OPEN_FOR_RECEIPT_STATUSES.has(status)) return "open"
      if (LEGACY_CLOSED_STATUSES.has(status)) return "closed"
      return "other"
    },
    [statusMap]
  )

  // ── KPI computation ──────────────────────────────────────────────
  const kpis = React.useMemo(() => {
    const total = rows.length
    let pending = 0
    let openForReceipt = 0
    let closed = 0
    let openValue = 0
    let closedValue = 0

    // Dominant currency across open POs — מונע mixed-currency בסיכום.
    const currencyCounts = new Map<string, number>()
    for (const r of rows) {
      if (classifyStatus(r.status) === "closed") continue
      currencyCounts.set(r.currency, (currencyCounts.get(r.currency) ?? 0) + 1)
    }
    let dominantCurrency: string | null = null
    let dominantCount = 0
    for (const [cur, cnt] of currencyCounts) {
      if (cnt > dominantCount) {
        dominantCurrency = cur
        dominantCount = cnt
      }
    }
    const otherCurrencyOpen =
      Array.from(currencyCounts.values()).reduce((s, c) => s + c, 0) -
      dominantCount

    for (const r of rows) {
      const bucket = classifyStatus(r.status)
      if (bucket === "pending") pending += 1
      if (bucket === "open") openForReceipt += 1
      if (bucket === "closed") {
        closed += 1
        if (r.currency === dominantCurrency) closedValue += r.totalAmount
      } else if (r.currency === dominantCurrency) {
        openValue += r.totalAmount
      }
    }
    return {
      total,
      pending,
      openForReceipt,
      closed,
      openValue,
      closedValue,
      dominantCurrency,
      otherCurrencyOpen,
    }
  }, [rows, classifyStatus])

  // ── Phase 4.2: Bulk action helpers ───────────────────────────────────
  const selectedRows = React.useMemo(
    () => rows.filter((r) => selectedIds.has(r.id)),
    [rows, selectedIds],
  )

  // Determine which bulk transitions are valid for ALL selected rows
  const canBulkApprove =
    selectedRows.length > 0 &&
    selectedRows.every((r) => isTransitionAllowed(r.status as POStatus, "APPROVE"))
  const canBulkCancel =
    selectedRows.length > 0 &&
    selectedRows.every((r) => isTransitionAllowed(r.status as POStatus, "CANCEL"))
  const canBulkSend =
    selectedRows.length > 0 &&
    selectedRows.every((r) => isTransitionAllowed(r.status as POStatus, "SEND"))

  async function executeBulkTransition(transition: "APPROVE" | "CANCEL" | "SEND") {
    if (bulkLoading) return
    setBulkLoading(true)
    const ids = [...selectedIds]
    const h = new Headers({ "content-type": "application/json" })
    if (typeof document !== "undefined") {
      const m = document.cookie.match(/active_company_id=([^;]+)/)
      if (m) {
        h.set("x-company-id", m[1])
        h.set("x-active-company-id", m[1])
      }
    }
    let success = 0
    let fail = 0
    await Promise.allSettled(
      ids.map(async (id) => {
        const res = await fetch("/api/procurement/po-transition", {
          method: "POST",
          credentials: "same-origin",
          headers: h,
          body: JSON.stringify({ poId: id, transition }),
        })
        if (res.ok) success++
        else fail++
      }),
    )
    setBulkLoading(false)
    if (fail > 0) toast.error(`${fail} הזמנות נכשלו; ${success} הצליחו`)
    else toast.success(`${success} הזמנות עודכנו בהצלחה`)
    void loadOrders()
  }

  // ── Columns ───────────────────────────────────────────────────────────
  const columns = React.useMemo<BentoSmartListColumn<PoRow>[]>(
    () => [
      {
        key: "poNumber",
        title: "מספר הזמנה",
        className: "w-[9rem] font-mono text-xs font-semibold",
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
        key: "supplier",
        title: "ספק",
        className: "min-w-[12rem]",
        render: (r) =>
          r.supplier ? (
            <span className="text-xs">
              {r.supplier.supplierNum ? (
                <span className="font-mono text-[10px] text-muted-foreground">
                  {r.supplier.supplierNum}
                  {" · "}
                </span>
              ) : null}
              <span className="font-medium text-foreground">{r.supplier.name}</span>
            </span>
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
      },
      {
        key: "date",
        title: "תאריך",
        className: "w-[7rem] text-xs text-muted-foreground",
        render: (r) => {
          const raw = r.issuedAt ?? r.createdAt
          return raw ? dateFormatter.format(new Date(raw)) : "—"
        },
      },
      {
        key: "amount",
        title: "סכום",
        className: "w-[10rem] text-xs",
        render: (r) => (
          <span className="font-currency-mono font-semibold tabular-nums">
            {formatMoney(r.totalAmount, r.currency)}
          </span>
        ),
      },
      {
        key: "status",
        title: "סטטוס",
        className: "w-[8rem]",
        render: (r) => (
          <PoStatusBadge status={r.status} meta={statusMap[r.status] ?? null} />
        ),
      },
    ],
    [statusMap],
  )

  // ── Master content ────────────────────────────────────────────────────
  const masterContent = (
    <>
      {loadError ? (
        <Alert variant="destructive" className="mb-3">
          <AlertTriangle className="size-4" aria-hidden />
          <AlertDescription className="flex items-center justify-between gap-3">
            <span>{loadError}</span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void loadOrders()}
              className="shrink-0 gap-1.5"
            >
              <RefreshCw className="size-3.5" aria-hidden />
              נסה שוב
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}
      <header className="flex flex-wrap items-end justify-between gap-3 border-b pb-3">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <ShoppingCart className="size-5" aria-hidden />
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight">הזמנות רכש</h1>
            <p className="mt-1 text-xs text-muted-foreground">
              {loading
                ? "טוען רשימת הזמנות…"
                : totalRows > PAGE_SIZE
                  ? `עמוד ${page} — ${rows.length.toLocaleString("he-IL")} מתוך ${totalRows.toLocaleString("he-IL")} הזמנות`
                  : `${rows.length.toLocaleString("he-IL")} הזמנות`}
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
              placeholder="חיפוש לפי מספר / כותרת / ספק…"
              className="h-9 w-72 pe-8 text-xs"
              aria-label="חיפוש הזמנות רכש"
              disabled={rows.length === 0 && !loading}
            />
          </div>
          <Select
            value={statusFilter}
            onValueChange={(val) => {
              const v = val ?? ""
              setStatusFilter(v)
              syncUrl({ status: v ?? undefined })
              void loadOrders(1, { status: v ?? undefined })
            }}
          >
            <SelectTrigger className="h-9 w-40 text-xs" aria-label="סנן לפי סטטוס">
              <SelectValue placeholder="כל הסטטוסים" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">כל הסטטוסים</SelectItem>
              {Object.entries(statusMap).map(([key, meta]) => (
                <SelectItem key={key} value={key} className="text-xs">
                  {meta.nameHe ?? key}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {/* Phase 4.1 — Advanced filters toggle */}
          <Button
            type="button"
            variant={advancedOpen ? "secondary" : "outline"}
            size="sm"
            onClick={() => setAdvancedOpen((v) => !v)}
            className="gap-1.5"
            aria-expanded={advancedOpen}
          >
            <SlidersHorizontal className="size-3.5" aria-hidden />
            פילטרים
            {(selectedStatuses.length || dateFrom || dateTo || amountMin || amountMax) ? (
              <Badge variant="default" className="ml-1 h-4 px-1 text-[10px]">
                {[selectedStatuses.length ? "✓" : null, dateFrom || dateTo ? "📅" : null, amountMin || amountMax ? "₪" : null].filter(Boolean).length}
              </Badge>
            ) : null}
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={() => router.push("/marker-ofek/procurement/orders/new")}
            className="gap-1.5"
          >
            <Plus className="size-3.5" aria-hidden />
            הזמנה חדשה
          </Button>
        </div>
      </header>

      {/* Phase 4.1 — Advanced filter panel */}
      {advancedOpen ? (
        <div className="rounded-lg border border-border bg-muted/40 p-4">
          <div className="grid grid-cols-2 gap-x-6 gap-y-3 md:grid-cols-4">
            {/* Date range */}
            <div className="flex flex-col gap-1">
              <Label className="text-xs font-medium">מתאריך</Label>
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => {
                  setDateFrom(e.target.value)
                  syncUrl({ dateFrom: e.target.value })
                }}
                className="h-8 text-xs"
                aria-label="מתאריך"
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-xs font-medium">עד תאריך</Label>
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => {
                  setDateTo(e.target.value)
                  syncUrl({ dateTo: e.target.value })
                }}
                className="h-8 text-xs"
                aria-label="עד תאריך"
              />
            </div>
            {/* Amount range */}
            <div className="flex flex-col gap-1">
              <Label className="text-xs font-medium">סכום מינימום</Label>
              <Input
                type="number"
                min={0}
                value={amountMin}
                onChange={(e) => {
                  setAmountMin(e.target.value)
                  syncUrl({ amountMin: e.target.value })
                }}
                placeholder="0"
                className="h-8 text-xs"
                aria-label="סכום מינימום"
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-xs font-medium">סכום מקסימום</Label>
              <Input
                type="number"
                min={0}
                value={amountMax}
                onChange={(e) => {
                  setAmountMax(e.target.value)
                  syncUrl({ amountMax: e.target.value })
                }}
                placeholder="ללא הגבלה"
                className="h-8 text-xs"
                aria-label="סכום מקסימום"
              />
            </div>
            {/* Multi-status selector */}
            <div className="col-span-2 flex flex-col gap-1">
              <Label className="text-xs font-medium">סטטוסים</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 w-full justify-between text-xs font-normal"
                  >
                    {selectedStatuses.length > 0
                      ? `${selectedStatuses.length} סטטוסים נבחרו`
                      : "כל הסטטוסים"}
                    <ChevronDown className="size-3.5 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="start" className="w-56 p-1" dir="rtl">
                  <div className="max-h-60 overflow-y-auto">
                    {Object.entries(statusMap).map(([key, meta]) => (
                      <label
                        key={key}
                        className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-xs hover:bg-muted"
                      >
                        <Checkbox
                          checked={selectedStatuses.includes(key)}
                          onCheckedChange={(chk) => {
                            const next = chk
                              ? [...selectedStatuses, key]
                              : selectedStatuses.filter((s) => s !== key)
                            setSelectedStatuses(next)
                            syncUrl({ statuses: next })
                          }}
                          aria-label={meta.nameHe ?? key}
                        />
                        {meta.nameHe ?? key}
                      </label>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>
            </div>
            {/* Supplier search */}
            <div className="col-span-2 flex flex-col gap-1">
              <Label className="text-xs font-medium">ספק</Label>
              <div className="relative">
                <Search className="pointer-events-none absolute end-2 top-1/2 size-3 -translate-y-1/2 text-muted-foreground" aria-hidden />
                <Input
                  type="search"
                  value={supplierSearch}
                  onChange={(e) => {
                    setSupplierSearch(e.target.value)
                    syncUrl({ supplier: e.target.value })
                  }}
                  placeholder="שם ספק…"
                  className="h-8 pe-7 text-xs"
                  aria-label="חיפוש ספק"
                />
              </div>
            </div>
          </div>
          <div className="mt-3 flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 gap-1 text-xs"
              onClick={() => {
                setSelectedStatuses([])
                setDateFrom("")
                setDateTo("")
                setAmountMin("")
                setAmountMax("")
                setSupplierSearch("")
                syncUrl({ statuses: [], dateFrom: "", dateTo: "", amountMin: "", amountMax: "", supplier: "" })
              }}
            >
              <X className="size-3" />
              נקה פילטרים
            </Button>
            <Button
              type="button"
              size="sm"
              className="h-7 text-xs"
              onClick={() => void loadOrders(1)}
            >
              <Filter className="me-1 size-3" />
              החל
            </Button>
          </div>
        </div>
      ) : null}

      {/* KPI strip */}
      <section
        aria-label="סיכום הזמנות רכש"
        className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6"
      >
        <KpiCard
          title="סה״כ הזמנות"
          value={`${kpis.total}`}
          hint="כל הרשומות במערכת"
        />
        <KpiCard
          title="ממתינות לאישור"
          value={`${kpis.pending}`}
          hint={
            kpis.pending > 0 ? "צריך טיפול דחוף" : "אין התעכבויות אישור"
          }
          tone={kpis.pending > 0 ? "warning" : "success"}
        />
        <KpiCard
          title="פתוחות לקליטה"
          value={`${kpis.openForReceipt}`}
          hint="אושרו / הונפקו / חלקיות"
          tone={kpis.openForReceipt > 0 ? "info" : "neutral"}
        />
        <KpiCard
          title="סגורות"
          value={`${kpis.closed}`}
          hint="נקלטו/סגורות/בוטלו"
          tone="success"
        />
        <KpiCard
          title="ערך פתוח"
          value={
            kpis.openValue > 0
              ? formatMoneyCompact(kpis.openValue, kpis.dominantCurrency)
              : "—"
          }
          hint={
            kpis.otherCurrencyOpen > 0
              ? `+${kpis.otherCurrencyOpen} במטבעות אחרים`
              : "מטבע דומיננטי"
          }
        />
        <KpiCard
          title="ערך סגור"
          value={
            kpis.closedValue > 0
              ? formatMoneyCompact(kpis.closedValue, kpis.dominantCurrency)
              : "—"
          }
          hint="POs שנסגרו"
          tone="neutral"
        />
      </section>

      {/* Master grid */}
      <div className="flex min-h-0 flex-1 flex-col gap-2">
        {/* Phase 4.2 — Bulk Actions bar */}
        {selectedIds.size > 0 ? (
          <div className="flex flex-wrap items-center gap-3 rounded-lg border border-primary/30 bg-primary/5 px-4 py-2 text-sm">
            <span className="font-medium text-primary">
              {selectedIds.size} הזמנות נבחרו
            </span>
            {canBulkApprove ? (
              <Button
                size="sm"
                className="h-7 gap-1.5 text-xs"
                disabled={bulkLoading}
                onClick={() => void executeBulkTransition("APPROVE")}
              >
                {bulkLoading ? (
                  <Loader2 className="size-3.5 animate-spin" aria-hidden />
                ) : (
                  <CheckCircle2 className="size-3.5" aria-hidden />
                )}
                אשר נבחרות
              </Button>
            ) : null}
            {canBulkSend ? (
              <Button
                size="sm"
                variant="outline"
                className="h-7 gap-1.5 text-xs"
                disabled={bulkLoading}
                onClick={() => void executeBulkTransition("SEND")}
              >
                שלח לספק
              </Button>
            ) : null}
            {canBulkCancel ? (
              <Button
                size="sm"
                variant="destructive"
                className="h-7 gap-1.5 text-xs"
                disabled={bulkLoading}
                onClick={() => void executeBulkTransition("CANCEL")}
              >
                בטל נבחרות
              </Button>
            ) : null}
            <Button
              size="sm"
              variant="ghost"
              className="ml-auto h-7 text-xs"
              onClick={() => setSelectedIds(new Set())}
            >
              <X className="me-1 size-3" />
              נקה בחירה
            </Button>
          </div>
        ) : null}

        {loading ? (
          <div className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-border bg-card text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" aria-hidden />
            טוען הזמנות רכש…
          </div>
        ) : rows.length === 0 ? (
          <EmptyOrdersState
            onCreate={() =>
              router.push("/marker-ofek/procurement/orders/new")
            }
          />
        ) : (
          <BentoSmartList<PoRow>
            items={filteredRows}
            columns={columns}
            rowKey={(r) => r.id}
            selectedRowKey={activePoId}
            onRowClick={(r) => setActivePoId(r.id)}
            onRowDoubleClick={(r) =>
              router.push(
                `/marker-ofek/procurement/orders/${encodeURIComponent(r.id)}`,
              )
            }
            emptyState="לא נמצאו הזמנות התואמות לחיפוש."
            selectable
            selectedKeys={selectedIds}
            onSelectionChange={setSelectedIds}
            rowActions={(r) =>
              r.status === "DRAFT" ? (
                <PoSubmitButton
                  poId={r.id}
                  status={r.status}
                  onChanged={() => void loadOrders()}
                />
              ) : null
            }
          />
        )}
      </div>

      {/* Pagination controls — only when total > page size */}
      {totalRows > PAGE_SIZE ? (
        <div className="flex items-center justify-between border-t pt-2 text-xs text-muted-foreground">
          <span>
            עמוד {page} מתוך {Math.ceil(totalRows / PAGE_SIZE)}
          </span>
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => void loadOrders(page - 1)}
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
              onClick={() => void loadOrders(page + 1)}
              disabled={page >= Math.ceil(totalRows / PAGE_SIZE) || loading}
              className="h-7 w-7 p-0"
              aria-label="עמוד הבא"
            >
              <ChevronLeft className="size-3.5" aria-hidden />
            </Button>
          </div>
        </div>
      ) : null}
    </>
  )

  return (
    <MasterDetailShell
      activeMasterId={activePoId}
      onActiveMasterIdChange={setActivePoId}
      masterContent={
        <div dir="rtl" className="flex h-full min-h-0 flex-col gap-3 p-4">
          {masterContent}
        </div>
      }
      detailTabs={[
        {
          id: "lines",
          label: "שורות ההזמנה",
          icon: ClipboardList,
          render: (id) => <PoLinesTab poId={id} />,
        },
        {
          id: "receipt",
          label: "סטטוס קליטה",
          icon: Package,
          render: (id) => <ReceiptTab poId={id} />,
        },
        {
          id: "approvals",
          label: "אישורים",
          icon: FileCheck,
          render: (id) => <ApprovalsTab poId={id} />,
        },
        {
          id: "invoices",
          label: "חשבוניות",
          icon: Receipt,
          render: (id) => <PoInvoicesTab poId={id} />,
        },
      ]}
      initialTabId="lines"
      defaultMasterSize={58}
    />
  )
}

// ----------------------------------------------------------------------------
// KpiCard — קומפקטי, אותה משפחת עיצוב כמו בקטלוג הפריטים.
// ----------------------------------------------------------------------------

function KpiCard({
  title,
  value,
  hint,
  tone = "neutral",
}: {
  title: string
  value: string
  hint?: string
  tone?: "neutral" | "success" | "warning" | "info"
}) {
  const valueTone =
    tone === "success"
      ? "text-emerald-600 dark:text-emerald-400"
      : tone === "warning"
        ? "text-amber-600 dark:text-amber-400"
        : tone === "info"
          ? "text-sky-600 dark:text-sky-400"
          : "text-foreground"

  return (
    <Card className="border-border">
      <CardHeader className="px-3 pb-1 pt-2">
        <CardTitle className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-0.5 px-3 pb-2">
        <p className={cn("text-lg font-semibold tracking-tight", valueTone)}>
          {value}
        </p>
        {hint ? (
          <p className="line-clamp-1 text-[10px] leading-tight text-muted-foreground">
            {hint}
          </p>
        ) : null}
      </CardContent>
    </Card>
  )
}

// ----------------------------------------------------------------------------
// Empty state
// ----------------------------------------------------------------------------

function EmptyOrdersState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="flex flex-1 items-center justify-center">
      <Card className="max-w-md text-center">
        <CardHeader>
          <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            <FileText className="size-6" aria-hidden />
          </div>
          <CardTitle className="mt-3 text-base">אין עדיין הזמנות רכש</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">
            צור את ההזמנה הראשונה כדי להתחיל: בחירת ספק, שורות פריטים, אישור
            וקליטה.
          </p>
          <Button onClick={onCreate} className="gap-1.5">
            <CheckCircle2 className="size-4" aria-hidden />
            יצירת הזמנת רכש
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
