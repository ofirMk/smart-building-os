"use client"

/**
 * ItemsCatalogScaffold — UX Hotfix (post Phase 7.13.5).
 *
 * **Why this rewrite**
 *   הלקוח פסל את ה-split pane (BentoSmartList + ItemPreviewPane אינליין). הוא
 *   דורש חוויית ERP מלאה: data grid רחב על כל המסך, KPIs בשורה עילית, וקליק
 *   על שורה מנווט ישר ל-`/marker-ofek/items/[id]` (כרטיס V3 העמוק).
 *
 * **What changed vs. Phase 7.13.5**
 *   • הוסרו `EntityWorkspace` (sidebar+main), `ItemPreviewPane`, ה-state
 *     `selectedItemId`, וה-toggle של בחירה ב-onRowClick.
 *   • ה-KPIs עברו מ-sidebar עמוד לשורה אופקית קומפקטית מעל הטבלה.
 *   • ה-onRowClick עושה `router.push(/marker-ofek/items/{id})` — ניווט ישיר.
 *   • הטבלה תופסת את כל הרוחב הזמין; ה-empty state נשאר.
 *
 * **What was preserved**
 *   • טעינת `/api/master-data/items`, חיפוש client-side, סינון, קומפוט KPIs,
 *     קומפוננטת KpiCard לוקאלית, פורמטור מטבע, פורמטור קומפקטי לסכומים.
 *   • הקומפוננטה `ItemPreviewPane` לא נמחקה — נשארת ב-codebase למקרה של
 *     שימוש עתידי (Cmd+K preview, mobile drawer וכו'); רק אינה מיובאת פה.
 */

import * as React from "react"
import { useRouter } from "next/navigation"
import {
  AlertTriangle,
  Loader2,
  Plus,
  Search,
  Star,
  TrendingDown,
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
import { masterDataFetch } from "@/lib/erp/master-data-browser"
import { cn } from "@/lib/utils"

// ----------------------------------------------------------------------------
// Types — תואם תגובת `/api/master-data/items` (GET list).
// ----------------------------------------------------------------------------

type ItemRow = {
  id: string
  sku: string
  description: string
  status: string
  uom: string | null
  uomDescription: string | null
  productFamily: { familyCode: string; familyName: string } | null
  // ── Phase 7.14.2 — Resolved Pricing ──
  resolvedUnitPrice: number | null
  resolvedPriceSource: "preferred" | "cheapest" | "none"
  resolvedCurrency: string | null
  preferredIsOptimal: boolean | null
  preferredPremium: number | null
  activeSupplierCount: number
}

// פורמטור מטבע: ILS עם סמל ₪, אחרת לפי קוד המטבע.
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
    return `${value.toLocaleString("he-IL", { maximumFractionDigits: 2 })} ${cur}`
  }
}

// פורמטור קומפקטי ל-KPIs סכומיים: 1.2M / 350K / 12.5K.
function formatPriceCompact(value: number, currency: string | null): string {
  const cur = currency ?? "ILS"
  try {
    return new Intl.NumberFormat("he-IL", {
      style: "currency",
      currency: cur,
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(value)
  } catch {
    return `${value.toLocaleString("he-IL", { maximumFractionDigits: 0 })} ${cur}`
  }
}

type ItemStatus =
  | "ACTIVE"
  | "INACTIVE"
  | "PURCHASE_ONLY"
  | "INTERNAL_ONLY"
  | "OBSOLETE"

const STATUS_LABEL: Record<string, string> = {
  ACTIVE: "פעיל",
  INACTIVE: "לא פעיל",
  PURCHASE_ONLY: "רק רכש",
  INTERNAL_ONLY: "פנימי",
  OBSOLETE: "מיושן",
}

function statusTone(
  status: string,
): "neutral" | "success" | "warning" | "info" | "danger" {
  if (status === "ACTIVE") return "success"
  if (status === "PURCHASE_ONLY") return "info"
  if (status === "INTERNAL_ONLY") return "warning"
  if (status === "OBSOLETE") return "danger"
  return "neutral"
}

// ----------------------------------------------------------------------------
// Component
// ----------------------------------------------------------------------------

export function ItemsCatalogScaffold() {
  const router = useRouter()
  const [rows, setRows] = React.useState<ItemRow[]>([])
  const [loading, setLoading] = React.useState(true)
  const [searchTerm, setSearchTerm] = React.useState("")

  // טעינת רשימת הפריטים — פעם אחת בעלייה.
  React.useEffect(() => {
    let cancelled = false
    setLoading(true)
    masterDataFetch<ItemRow[]>("/api/master-data/items")
      .then((data) => {
        if (cancelled) return
        setRows(data)
      })
      .catch((error) => {
        if (cancelled) return
        toast.error(
          error instanceof Error
            ? error.message
            : "טעינת רשימת הפריטים נכשלה",
        )
        setRows([])
      })
      .finally(() => {
        if (cancelled) return
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  // ── סינון לפי חיפוש (client-side, עד 5K פריטים סביר) ─────────────────────
  const filteredRows = React.useMemo(() => {
    const trimmed = searchTerm.trim().toLowerCase()
    if (!trimmed) return rows
    return rows.filter(
      (row) =>
        row.sku.toLowerCase().includes(trimmed) ||
        row.description.toLowerCase().includes(trimmed) ||
        (row.productFamily?.familyName ?? "").toLowerCase().includes(trimmed),
    )
  }, [rows, searchTerm])

  // ── KPIs נגזרים מהליסט ────────────────────────────────────────────────
  const kpis = React.useMemo(() => {
    const total = rows.length
    const active = rows.filter((r) => r.status === "ACTIVE").length
    const obsolete = rows.filter((r) => r.status === "OBSOLETE").length
    const familySet = new Set<string>()
    for (const r of rows) {
      if (r.productFamily?.familyCode) familySet.add(r.productFamily.familyCode)
    }
    const withoutPrice = rows.filter((r) => r.resolvedPriceSource === "none").length
    const withPremium = rows.filter((r) => r.preferredIsOptimal === false).length

    // KPIs כספיים על פריטים פעילים בלבד — מטבע דומיננטי כדי למנוע mixed-currency.
    const currencyCounts = new Map<string, number>()
    for (const r of rows) {
      if (r.resolvedUnitPrice != null && r.resolvedCurrency) {
        currencyCounts.set(
          r.resolvedCurrency,
          (currencyCounts.get(r.resolvedCurrency) ?? 0) + 1,
        )
      }
    }
    let dominantCurrency: string | null = null
    let dominantCount = 0
    for (const [cur, cnt] of currencyCounts) {
      if (cnt > dominantCount) {
        dominantCurrency = cur
        dominantCount = cnt
      }
    }
    const otherCurrencyItems =
      Array.from(currencyCounts.values()).reduce((s, c) => s + c, 0) -
      dominantCount

    let catalogValue = 0
    let catalogValueItemCount = 0
    let savingsOpportunity = 0
    let savingsItemCount = 0
    let supplierCountSum = 0
    let supplierCountActive = 0
    for (const r of rows) {
      if (r.status !== "ACTIVE") continue
      if (r.resolvedUnitPrice != null && r.resolvedCurrency === dominantCurrency) {
        catalogValue += r.resolvedUnitPrice
        catalogValueItemCount += 1
      }
      if (
        r.preferredIsOptimal === false &&
        r.preferredPremium != null &&
        r.preferredPremium > 0 &&
        r.resolvedCurrency === dominantCurrency
      ) {
        savingsOpportunity += r.preferredPremium
        savingsItemCount += 1
      }
      supplierCountSum += r.activeSupplierCount
      supplierCountActive += 1
    }
    const supplierCoverageAvg =
      supplierCountActive > 0 ? supplierCountSum / supplierCountActive : 0

    return {
      total,
      active,
      obsolete,
      withoutFamily: rows.filter((r) => !r.productFamily).length,
      familyCount: familySet.size,
      withoutPrice,
      withPremium,
      catalogValue,
      catalogValueItemCount,
      savingsOpportunity,
      savingsItemCount,
      supplierCoverageAvg,
      dominantCurrency,
      otherCurrencyItems,
    }
  }, [rows])

  // ── עמודות ה-BentoSmartList ────────────────────────────────────────────
  const columns = React.useMemo<BentoSmartListColumn<ItemRow>[]>(
    () => [
      {
        key: "sku",
        title: "מק״ט",
        className: "w-[8.5rem] font-mono text-xs",
        render: (item) => item.sku,
      },
      {
        key: "description",
        title: "תיאור",
        className: "min-w-[16rem]",
        render: (item) => (
          <span className="block truncate font-medium text-foreground">
            {item.description}
          </span>
        ),
      },
      {
        key: "family",
        title: "משפחת מוצר",
        className: "min-w-[10rem]",
        render: (item) =>
          item.productFamily ? (
            <span className="text-xs">
              <span className="font-mono text-[10px] text-muted-foreground">
                {item.productFamily.familyCode}
              </span>
              {" · "}
              {item.productFamily.familyName}
            </span>
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
      },
      {
        key: "uom",
        title: "יח׳ מידה",
        className: "w-[7rem] text-xs",
        render: (item) => {
          if (!item.uom) return "—"
          if (item.uomDescription && item.uomDescription !== item.uom) {
            return `${item.uom} · ${item.uomDescription}`
          }
          return item.uom
        },
      },
      {
        key: "resolvedPrice",
        title: "מחיר רכש",
        className: "w-[11rem] text-xs",
        render: (item) => {
          if (item.resolvedPriceSource === "none") {
            return (
              <span
                className="text-muted-foreground"
                title={
                  item.activeSupplierCount === 0
                    ? "אין מיפויי ספקים פעילים"
                    : "אין מחיר תקף"
                }
              >
                —
              </span>
            )
          }
          return (
            <div className="flex items-center gap-1.5">
              <span className="font-currency-mono font-semibold tabular-nums">
                {formatPrice(item.resolvedUnitPrice, item.resolvedCurrency)}
              </span>
              {item.resolvedPriceSource === "preferred" ? (
                item.preferredIsOptimal === false ? (
                  <span
                    title={
                      item.preferredPremium != null
                        ? `המועדף יקר ב-${formatPrice(item.preferredPremium, item.resolvedCurrency)} מהזול ביותר`
                        : "המועדף לא הזול ביותר"
                    }
                  >
                    <AlertTriangle
                      className="size-3 text-amber-600 dark:text-amber-400"
                      aria-label="המחיר המועדף גבוה מהזול ביותר"
                    />
                  </span>
                ) : (
                  <span title="מהספק המועדף (גם הזול ביותר)">
                    <Star
                      className="size-3 fill-amber-400 text-amber-500"
                      aria-label="מהספק המועדף"
                    />
                  </span>
                )
              ) : (
                <span title="מהספק הזול ביותר (אין ספק מועדף מוגדר)">
                  <TrendingDown
                    className="size-3 text-emerald-600 dark:text-emerald-400"
                    aria-label="מהספק הזול ביותר"
                  />
                </span>
              )}
              {item.activeSupplierCount > 1 ? (
                <span
                  className="text-[10px] text-muted-foreground"
                  title={`${item.activeSupplierCount} ספקים פעילים`}
                >
                  ×{item.activeSupplierCount}
                </span>
              ) : null}
            </div>
          )
        },
      },
      {
        key: "status",
        title: "סטטוס",
        className: "w-[6.5rem]",
        render: (item) => (
          <SmartListStatusPill tone={statusTone(item.status)}>
            {STATUS_LABEL[item.status] ?? item.status}
          </SmartListStatusPill>
        ),
      },
    ],
    [],
  )

  // ── Page layout: header → KPI strip → full-width data grid ──────────────
  return (
    <div
      dir="rtl"
      className="flex h-full min-h-0 flex-col gap-4 p-4 md:p-6"
    >
      {/* Page header — כותרת + מטא + פעולות */}
      <header className="flex flex-wrap items-end justify-between gap-3 border-b pb-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">קטלוג פריטים</h1>
          <p className="mt-1 text-xs text-muted-foreground">
            {loading
              ? "טוען רשימת פריטים…"
              : `${filteredRows.length.toLocaleString("he-IL")} מתוך ${rows.length.toLocaleString("he-IL")} פריטים`}
          </p>
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
              placeholder="חיפוש מק״ט / תיאור / משפחה…"
              className="h-9 w-72 pe-8 text-xs"
              aria-label="חיפוש פריטים"
            />
          </div>
          <Button
            type="button"
            size="sm"
            onClick={() => router.push("/marker-ofek/items/new")}
            className="gap-1.5"
          >
            <Plus className="size-3.5" aria-hidden />
            פריט חדש
          </Button>
        </div>
      </header>

      {/* KPI strip — שורה עילית קומפקטית */}
      <section
        aria-label="סיכום קטלוג"
        className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-9"
      >
        <KpiCard
          title="סה״כ פריטים"
          value={`${kpis.total}`}
          hint="כל הפריטים בקטלוג"
        />
        <KpiCard
          title="פעילים"
          value={`${kpis.active}`}
          hint={`${kpis.total > 0 ? Math.round((kpis.active / kpis.total) * 100) : 0}% מהקטלוג`}
          tone="success"
        />
        <KpiCard
          title="מיושנים"
          value={`${kpis.obsolete}`}
          hint="OBSOLETE"
          tone={kpis.obsolete > 0 ? "warning" : "neutral"}
        />
        <KpiCard
          title="משפחות מוצר"
          value={`${kpis.familyCount}`}
          hint={
            kpis.withoutFamily > 0
              ? `${kpis.withoutFamily} ללא משפחה`
              : "כולם משויכים"
          }
          tone={kpis.withoutFamily > 0 ? "warning" : "neutral"}
        />
        <KpiCard
          title="ללא מחיר"
          value={`${kpis.withoutPrice}`}
          hint={kpis.withoutPrice > 0 ? "דרוש מיפוי ספק" : "כולם תמחורים"}
          tone={kpis.withoutPrice > 0 ? "warning" : "success"}
        />
        <KpiCard
          title="מועדף לא זול"
          value={`${kpis.withPremium}`}
          hint={
            kpis.withPremium > 0 ? "הזדמנות חיסכון" : "מועדף = זול ביותר"
          }
          tone={kpis.withPremium > 0 ? "warning" : "success"}
        />
        <KpiCard
          title="ערך קטלוג"
          value={
            kpis.catalogValueItemCount > 0
              ? formatPriceCompact(kpis.catalogValue, kpis.dominantCurrency)
              : "—"
          }
          hint={
            kpis.catalogValueItemCount > 0
              ? `${kpis.catalogValueItemCount} פריטים${
                  kpis.otherCurrencyItems > 0
                    ? ` (+${kpis.otherCurrencyItems} מטבע אחר)`
                    : ""
                }`
              : "אין מחירים פעילים"
          }
        />
        <KpiCard
          title="פוט׳ חיסכון"
          value={
            kpis.savingsItemCount > 0
              ? formatPriceCompact(
                  kpis.savingsOpportunity,
                  kpis.dominantCurrency,
                )
              : "—"
          }
          hint={
            kpis.savingsItemCount > 0
              ? `${kpis.savingsItemCount} פריטים${
                  kpis.catalogValue > 0
                    ? ` · ${Math.round((kpis.savingsOpportunity / kpis.catalogValue) * 100)}%`
                    : ""
                }`
              : "אין premium"
          }
          tone={kpis.savingsItemCount > 0 ? "warning" : "success"}
        />
        <KpiCard
          title="כיסוי ספקים"
          value={kpis.active > 0 ? kpis.supplierCoverageAvg.toFixed(1) : "—"}
          hint={
            kpis.active === 0
              ? "אין פעילים"
              : kpis.supplierCoverageAvg < 1.5
                ? "דל"
                : kpis.supplierCoverageAvg < 3
                  ? "סביר"
                  : "טוב"
          }
          tone={
            kpis.active === 0
              ? "neutral"
              : kpis.supplierCoverageAvg < 1.5
                ? "warning"
                : kpis.supplierCoverageAvg >= 3
                  ? "success"
                  : "neutral"
          }
        />
      </section>

      {/* Data Grid — רוחב מלא */}
      <div className="flex min-h-0 flex-1 flex-col">
        {loading ? (
          <div className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-border bg-card text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" aria-hidden />
            טוען פריטים…
          </div>
        ) : (
          <BentoSmartList<ItemRow>
            items={filteredRows}
            columns={columns}
            rowKey={(item) => item.id}
            onRowClick={(item) =>
              router.push(`/marker-ofek/items/${encodeURIComponent(item.id)}`)
            }
            emptyState={
              rows.length === 0
                ? "אין פריטים בקטלוג. לחץ \u201Cפריט חדש\u201D כדי ליצור את הראשון."
                : "לא נמצאו פריטים התואמים לחיפוש."
            }
          />
        )}
      </div>
    </div>
  )
}

// ----------------------------------------------------------------------------
// Local KpiCard — קומפקטי לשורה אופקית (קטן יותר מהגרסה הקודמת ב-sidebar).
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
  tone?: "neutral" | "success" | "warning"
}) {
  const valueTone =
    tone === "success"
      ? "text-emerald-600 dark:text-emerald-400"
      : tone === "warning"
        ? "text-amber-600 dark:text-amber-400"
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

export type { ItemStatus }
