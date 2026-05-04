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
import { useRouter } from "next/navigation"
import {
  CheckCircle2,
  ClipboardList,
  FileCheck,
  FileText,
  Loader2,
  Package,
  Plus,
  Receipt,
  Search,
  ShoppingCart,
} from "lucide-react"
import { toast } from "sonner"

import {
  BentoSmartList,
  type BentoSmartListColumn,
} from "@/components/ui/bento-smart-list"
import { Button } from "@/components/ui/button"
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
// Component
// ----------------------------------------------------------------------------

export function OrdersListScaffold() {
  const router = useRouter()
  const [rows, setRows] = React.useState<PoRow[]>([])
  const [loading, setLoading] = React.useState(true)
  const [searchTerm, setSearchTerm] = React.useState("")
  const [activePoId, setActivePoId] = React.useState<string | null>(null)

  // Phase B' — טעינת מטא-דאטה של כל סטטוסי ה-PO מ-erp_po_status_types.
  //           משמש ל-<PoStatusBadge /> (הוא קורא ל-hook פנימית) ול-KPI classifiers.
  const { statusMap } = usePoStatusTypes()

  // ── Load (callback כדי שנוכל לרענן אחרי quick-actions כגון submit) ──
  const loadOrders = React.useCallback(async () => {
    setLoading(true)
    try {
      const data = await masterDataFetch<PoRow[]>("/api/procurement/orders")
      setRows(data)
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "טעינת הזמנות הרכש נכשלה",
      )
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [])

  // ── Load on mount ────────────────────────────────────────────────────
  React.useEffect(() => {
    void loadOrders()
  }, [loadOrders])

  // ── Filter (client-side) ─────────────────────────────────────────────
  const filteredRows = React.useMemo(() => {
    const trimmed = searchTerm.trim().toLowerCase()
    if (!trimmed) return rows
    return rows.filter(
      (row) =>
        row.poNumber.toLowerCase().includes(trimmed) ||
        row.title.toLowerCase().includes(trimmed) ||
        (row.supplier?.name ?? "").toLowerCase().includes(trimmed),
    )
  }, [rows, searchTerm])

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
                : `${filteredRows.length.toLocaleString("he-IL")} מתוך ${rows.length.toLocaleString(
                    "he-IL",
                  )} הזמנות`}
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
      <div className="flex min-h-0 flex-1 flex-col">
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
            rowActions={(r) =>
              // Quick-submit רק לשורות DRAFT. הרכיב עצמו self-gates ומחזיר null
              // אחרת (defense in depth — גם אם הסטטוס ישתנה אחרי quick actions).
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
