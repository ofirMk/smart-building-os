"use client"

/**
 * SuppliersListScaffold — Phase 9.1.
 *
 * השלב השלישי של סטנדרט ה-Master/Detail (אחרי items catalog ו-PO list):
 * מסך הספקים. אימוץ Priority-style מלא — Master למעלה, Detail-tabs למטה.
 *
 *   Master (top): data grid של כל הספקים — מס׳, שם, סוג, ערך פתוח, חוב,
 *     פעולה אחרונה. single-click = בחירה, double-click = כרטיס ספק מלא.
 *
 *   Detail (bottom, ב-tabs):
 *     1. פרטים        — read-only summary (header fields, primary contact, primary bank)
 *     2. אנשי קשר      — sub-grid of erp_md_supplier_contacts
 *     3. הזמנות פתוחות — POs filtered by supplier_id + open status (תמונה #25)
 *     4. חשבוניות AP   — vendor invoices for supplier + 3-Way Match status
 *     5. מחירונים      — supplier price lines (flat model, MVP)
 *     6. מסמכים        — erp_supplier_attachments (חוזים, אישורים)
 *
 * KPI strip (4 cards): סה"כ פעילים | סה"כ ערך פתוח (PO) | חוב נוכחי |
 *   ספקים בסיכון (חוב > 0 או PO פתוח > X ימים).
 *
 * תיעוד מלא של ההחלטות: `docs/priority-suppliers-reference.md`,
 * Section "Implementation Plan (Phase 9)".
 */

import * as React from "react"
import { useRouter } from "next/navigation"
import {
  AlertTriangle,
  Building2,
  CreditCard,
  FileText,
  Loader2,
  Plus,
  Receipt,
  Search,
  ShoppingCart,
  User,
  Users,
} from "lucide-react"
import { toast } from "sonner"

import {
  BentoSmartList,
  type BentoSmartListColumn,
  SmartListStatusPill,
} from "@/components/ui/bento-smart-list"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { MasterDetailShell } from "@/components/infrastructure/master-detail/master-detail-shell"
import { SupplierDetailsTab } from "@/components/marker-ofek/master-data/suppliers/detail-tabs/supplier-details-tab"
import { SupplierContactsTab } from "@/components/marker-ofek/master-data/suppliers/detail-tabs/supplier-contacts-tab"
import { SupplierOpenPosTab } from "@/components/marker-ofek/master-data/suppliers/detail-tabs/supplier-open-pos-tab"
import { SupplierInvoicesTab } from "@/components/marker-ofek/master-data/suppliers/detail-tabs/supplier-invoices-tab"
import { SupplierPriceListTab } from "@/components/marker-ofek/master-data/suppliers/detail-tabs/supplier-price-list-tab"
import { SupplierDocumentsTab } from "@/components/marker-ofek/master-data/suppliers/detail-tabs/supplier-documents-tab"
import { masterDataFetch } from "@/lib/erp/master-data-browser"
import { cn } from "@/lib/utils"

// ---------------------------------------------------------------------------
// Types — תואם /api/master-data/suppliers?include=aggregates
// ---------------------------------------------------------------------------

type SupplierAggregateDto = {
  openPoCount: number
  openPoValue: number | null
  openPoCurrency: string | null
  unpaidInvoiceCount: number
  unpaidInvoiceValue: number
  lastActivityAt: string | null
}

type SupplierRow = {
  id: string
  companyId: string
  supplierNum: string
  name: string
  taxId: string | null
  type: "STANDARD" | "SUBCONTRACTOR"
  paymentTerms: string | null
  aggregates?: SupplierAggregateDto
}

// ---------------------------------------------------------------------------
// Formatters
// ---------------------------------------------------------------------------

const dateFormatter = new Intl.DateTimeFormat("he-IL", { dateStyle: "short" })

function formatMoney(value: number | null, currency: string | null): string {
  if (value == null) return "—"
  const cur = currency ?? "ILS"
  try {
    return new Intl.NumberFormat("he-IL", {
      style: "currency",
      currency: cur,
      maximumFractionDigits: 0,
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

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SuppliersListScaffold() {
  const router = useRouter()
  const [rows, setRows] = React.useState<SupplierRow[]>([])
  const [loading, setLoading] = React.useState(true)
  const [searchTerm, setSearchTerm] = React.useState("")
  const [activeSupplierId, setActiveSupplierId] = React.useState<string | null>(
    null,
  )

  // ── Load on mount ────────────────────────────────────────────────────
  React.useEffect(() => {
    let cancelled = false
    setLoading(true)
    masterDataFetch<SupplierRow[]>(
      "/api/master-data/suppliers?include=aggregates",
    )
      .then((data) => {
        if (cancelled) return
        setRows(data)
      })
      .catch((error) => {
        if (cancelled) return
        toast.error(
          error instanceof Error ? error.message : "טעינת רשימת הספקים נכשלה",
        )
        setRows([])
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  // ── Filter ────────────────────────────────────────────────────────────
  const filteredRows = React.useMemo(() => {
    const trimmed = searchTerm.trim().toLowerCase()
    if (!trimmed) return rows
    return rows.filter(
      (r) =>
        r.name.toLowerCase().includes(trimmed) ||
        r.supplierNum.toLowerCase().includes(trimmed) ||
        (r.taxId ?? "").toLowerCase().includes(trimmed),
    )
  }, [rows, searchTerm])

  // ── KPIs ──────────────────────────────────────────────────────────────
  const kpis = React.useMemo(() => {
    const total = rows.length
    let standard = 0
    let subcontractor = 0
    let totalOpenPoValue = 0
    let openPoCurrency: string | null = null
    let totalUnpaidValue = 0
    let atRiskCount = 0

    const ccyCounts = new Map<string, number>()
    for (const r of rows) {
      const a = r.aggregates
      if (!a) continue
      if (a.openPoCurrency) {
        ccyCounts.set(
          a.openPoCurrency,
          (ccyCounts.get(a.openPoCurrency) ?? 0) + 1,
        )
      }
    }
    let dominantCount = 0
    for (const [ccy, cnt] of ccyCounts) {
      if (cnt > dominantCount) {
        openPoCurrency = ccy
        dominantCount = cnt
      }
    }

    for (const r of rows) {
      if (r.type === "SUBCONTRACTOR") subcontractor += 1
      else standard += 1
      const a = r.aggregates
      if (!a) continue
      if (a.openPoCurrency === openPoCurrency && a.openPoValue != null) {
        totalOpenPoValue += a.openPoValue
      }
      totalUnpaidValue += a.unpaidInvoiceValue
      if (a.unpaidInvoiceValue > 0 || a.openPoCount >= 3) atRiskCount += 1
    }

    return {
      total,
      standard,
      subcontractor,
      totalOpenPoValue,
      openPoCurrency,
      totalUnpaidValue,
      atRiskCount,
    }
  }, [rows])

  // ── Columns ───────────────────────────────────────────────────────────
  const columns = React.useMemo<BentoSmartListColumn<SupplierRow>[]>(
    () => [
      {
        key: "supplierNum",
        title: "מס' ספק",
        className: "w-[7rem] font-mono text-xs font-semibold",
        render: (r) => r.supplierNum,
      },
      {
        key: "name",
        title: "שם הספק",
        className: "min-w-[14rem]",
        render: (r) => (
          <span className="block truncate font-medium text-foreground">
            {r.name}
          </span>
        ),
      },
      {
        key: "type",
        title: "סוג",
        className: "w-[7rem]",
        render: (r) => (
          <SmartListStatusPill
            tone={r.type === "SUBCONTRACTOR" ? "info" : "neutral"}
          >
            {r.type === "SUBCONTRACTOR" ? "קבלן משנה" : "ספק"}
          </SmartListStatusPill>
        ),
      },
      {
        key: "openPos",
        title: "PO פתוחות",
        className: "w-[8rem] text-xs",
        render: (r) => {
          const a = r.aggregates
          if (!a || a.openPoCount === 0) {
            return <span className="text-muted-foreground">—</span>
          }
          return (
            <span className="flex items-baseline gap-1">
              <span className="font-currency-mono font-semibold tabular-nums">
                {formatMoney(a.openPoValue, a.openPoCurrency)}
              </span>
              <span className="text-[10px] text-muted-foreground">
                ({a.openPoCount})
              </span>
            </span>
          )
        },
      },
      {
        key: "unpaid",
        title: "חוב פתוח",
        className: "w-[8rem] text-xs",
        render: (r) => {
          const a = r.aggregates
          if (!a || a.unpaidInvoiceCount === 0) {
            return <span className="text-muted-foreground">—</span>
          }
          return (
            <span className="flex items-baseline gap-1">
              <span className="font-currency-mono font-semibold tabular-nums text-amber-700 dark:text-amber-400">
                {formatMoney(a.unpaidInvoiceValue, "ILS")}
              </span>
              <span className="text-[10px] text-muted-foreground">
                ({a.unpaidInvoiceCount})
              </span>
            </span>
          )
        },
      },
      {
        key: "lastActivity",
        title: "פעולה אחרונה",
        className: "w-[7rem] text-[11px] text-muted-foreground",
        render: (r) => {
          const d = r.aggregates?.lastActivityAt
          return d ? dateFormatter.format(new Date(d)) : "—"
        },
      },
    ],
    [],
  )

  // ── Master content ────────────────────────────────────────────────────
  const masterContent = (
    <>
      <header className="flex flex-wrap items-end justify-between gap-3 border-b pb-3">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Users className="size-5" aria-hidden />
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight">ספקים</h1>
            <p className="mt-1 text-xs text-muted-foreground">
              {loading
                ? "טוען רשימת ספקים…"
                : `${filteredRows.length.toLocaleString("he-IL")} מתוך ${rows.length.toLocaleString(
                    "he-IL",
                  )} ספקים`}
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
              placeholder="חיפוש לפי שם / מספר / ח.פ…"
              className="h-9 w-72 pe-8 text-xs"
              aria-label="חיפוש ספקים"
              disabled={rows.length === 0 && !loading}
            />
          </div>
          <Button
            type="button"
            size="sm"
            onClick={() => router.push("/marker-ofek/entities/new")}
            className="gap-1.5"
          >
            <Plus className="size-3.5" aria-hidden />
            ספק חדש
          </Button>
        </div>
      </header>

      {/* KPI strip */}
      <section
        aria-label="סיכום ספקים"
        className="grid grid-cols-2 gap-2 sm:grid-cols-4"
      >
        <KpiCard
          title="סה״כ ספקים"
          value={`${kpis.total}`}
          hint={
            kpis.subcontractor > 0
              ? `${kpis.standard} ספקים · ${kpis.subcontractor} קבלני משנה`
              : "כל הספקים במערכת"
          }
        />
        <KpiCard
          title="ערך הזמנות פתוח"
          value={
            kpis.totalOpenPoValue > 0
              ? formatMoneyCompact(kpis.totalOpenPoValue, kpis.openPoCurrency)
              : "—"
          }
          hint="מצטבר מכל הספקים"
          tone="info"
        />
        <KpiCard
          title="חוב פתוח (AP)"
          value={
            kpis.totalUnpaidValue > 0
              ? formatMoneyCompact(kpis.totalUnpaidValue, "ILS")
              : "—"
          }
          hint="חשבוניות לא שולמו"
          tone={kpis.totalUnpaidValue > 0 ? "warning" : "success"}
        />
        <KpiCard
          title="ספקים בסיכון"
          value={`${kpis.atRiskCount}`}
          hint={
            kpis.atRiskCount > 0
              ? "חוב פתוח או POs מצטברים"
              : "אין ספקים בסיכון"
          }
          tone={kpis.atRiskCount > 0 ? "warning" : "success"}
        />
      </section>

      {/* Master grid */}
      <div className="flex min-h-0 flex-1 flex-col">
        {loading ? (
          <div className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-border bg-card text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" aria-hidden />
            טוען ספקים…
          </div>
        ) : rows.length === 0 ? (
          <EmptySuppliersState
            onCreate={() => router.push("/marker-ofek/entities/new")}
          />
        ) : (
          <BentoSmartList<SupplierRow>
            items={filteredRows}
            columns={columns}
            rowKey={(r) => r.id}
            selectedRowKey={activeSupplierId}
            onRowClick={(r) => setActiveSupplierId(r.id)}
            onRowDoubleClick={(r) =>
              router.push(
                `/marker-ofek/entities/${encodeURIComponent(r.id)}`,
              )
            }
            emptyState="לא נמצאו ספקים התואמים לחיפוש."
          />
        )}
      </div>
    </>
  )

  return (
    <MasterDetailShell
      activeMasterId={activeSupplierId}
      onActiveMasterIdChange={setActiveSupplierId}
      masterContent={
        <div dir="rtl" className="flex h-full min-h-0 flex-col gap-3 p-4">
          {masterContent}
        </div>
      }
      detailTabs={[
        {
          id: "details",
          label: "פרטים",
          icon: User,
          render: (id) => <SupplierDetailsTab supplierId={id} />,
        },
        {
          id: "contacts",
          label: "אנשי קשר",
          icon: Users,
          render: (id) => <SupplierContactsTab supplierId={id} />,
        },
        {
          id: "open-pos",
          label: "הזמנות",
          icon: ShoppingCart,
          render: (id) => <SupplierOpenPosTab supplierId={id} />,
        },
        {
          id: "invoices",
          label: "חשבוניות AP",
          icon: Receipt,
          render: (id) => <SupplierInvoicesTab supplierId={id} />,
        },
        {
          id: "price-list",
          label: "מחירון",
          icon: CreditCard,
          render: (id) => <SupplierPriceListTab supplierId={id} />,
        },
        {
          id: "documents",
          label: "מסמכים",
          icon: FileText,
          render: (id) => <SupplierDocumentsTab supplierId={id} />,
        },
      ]}
      initialTabId="details"
      defaultMasterSize={58}
    />
  )
}

// ----------------------------------------------------------------------------
// KpiCard
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

function EmptySuppliersState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="flex flex-1 items-center justify-center">
      <Card className="max-w-md text-center">
        <CardHeader>
          <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Building2 className="size-6" aria-hidden />
          </div>
          <CardTitle className="mt-3 text-base">אין עדיין ספקים</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">
            הוסף ספק ראשון כדי להתחיל לנהל הזמנות, מחירונים, אנשי קשר ומסמכים.
          </p>
          <Button onClick={onCreate} className="gap-1.5">
            <AlertTriangle className="size-4" aria-hidden />
            יצירת ספק חדש
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
