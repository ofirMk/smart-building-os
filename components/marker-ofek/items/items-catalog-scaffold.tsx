"use client"

/**
 * ItemsCatalogScaffold — Phase 7.13.5 (Hybrid Hierarchy).
 *
 * החלפה לקיים `ItemsDataGrid`. עוקב אחר הדפוס הקנוני של מרקר אופק:
 *   • `EntityWorkspace` כ-shell (header + sidebar + main)
 *   • `BentoSmartList` כטבלה ראשית
 *   • slide-over `ItemPreviewFocusPane` כ-FocusPane של בחירת שורה
 *   • CTA "פתח כרטיס מלא" ב-FocusPane → מנווט ל-`/marker-ofek/items/[id]` (V3)
 *
 * KPI sidebar:
 *   חישוב client-side מ-rows שכבר נטענו — ללא קריאה נוספת ל-API. אם נצטרך
 *   metrics אגרגטיביים (היסטוריית רכש וכו׳) נוסיף endpoint ייעודי בשלב הבא.
 *
 * חיפוש:
 *   נשמר client-side (SKU / תיאור / משפחה) — אותו UX כמו ב-`ItemsDataGrid`
 *   הישן. רעיון לעתיד: לחבר ל-Cmd+K command palette הגלובלי.
 */

import * as React from "react"
import { useRouter } from "next/navigation"
import {
  AlertTriangle,
  Boxes,
  Loader2,
  Plus,
  Search,
  Star,
  TrendingDown,
} from "lucide-react"
import { toast } from "sonner"

import { EntityWorkspace } from "@/components/layout/EntityWorkspace"
import { ItemPreviewPane } from "@/components/marker-ofek/items/item-preview-pane"
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

// פורמטור מטבע מטבע: ILS עם סמל ת, אחרת לפי קוד המטבע.
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
  status: string
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
  const [selectedItemId, setSelectedItemId] = React.useState<string | null>(
    null
  )

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
            : "טעינת רשימת הפריטים נכשלה"
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
        (row.productFamily?.familyName ?? "").toLowerCase().includes(trimmed)
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
    // ── Phase 7.14.2 — KPI טיה מחיר ──
    // פריטים ללא מחיר רכש פתור = resolvedPriceSource = 'none'.
    const withoutPrice = rows.filter((r) => r.resolvedPriceSource === "none").length
    // “premium” = עדיף מוגדר אבל לא הזול ביותר.
    const withPremium = rows.filter((r) => r.preferredIsOptimal === false).length
    return {
      total,
      active,
      obsolete,
      withoutFamily: rows.filter((r) => !r.productFamily).length,
      familyCount: familySet.size,
      withoutPrice,
      withPremium,
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
      // ── Phase 7.14.2 — מחיר רכש פתור ──
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
    []
  )

  return (
    <EntityWorkspace
      title="קטלוג פריטים"
        description={
          loading
            ? "טוען רשימת פריטים…"
            : `${filteredRows.length} מתוך ${rows.length} פריטים`
        }
        headerActions={
          <>
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
                className="h-8 w-64 pe-8 text-xs"
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
          </>
        }
        sidebar={
          <div className="flex flex-col gap-2">
            <KpiCard
              title="סה״כ פריטים"
              value={`${kpis.total}`}
              hint="כל הפריטים בקטלוג"
            />
            <KpiCard
              title="פעילים"
              value={`${kpis.active}`}
              hint={`${kpis.total > 0 ? Math.round((kpis.active / kpis.total) * 100) : 0}% מתוך הקטלוג`}
              tone="success"
            />
            <KpiCard
              title="מיושנים"
              value={`${kpis.obsolete}`}
              hint="OBSOLETE — לא לשימוש פעיל"
              tone={kpis.obsolete > 0 ? "warning" : "neutral"}
            />
            <KpiCard
              title="משפחות מוצר"
              value={`${kpis.familyCount}`}
              hint={
                kpis.withoutFamily > 0
                  ? `${kpis.withoutFamily} פריטים ללא משפחה`
                  : "כל הפריטים משויכים"
              }
              tone={kpis.withoutFamily > 0 ? "warning" : "neutral"}
            />
            <KpiCard
              title="ללא מחיר תקף"
              value={`${kpis.withoutPrice}`}
              hint={
                kpis.withoutPrice > 0
                  ? "דרוש מיפוי ספק פעיל"
                  : "לכל פריט יש מחיר"
              }
              tone={kpis.withoutPrice > 0 ? "warning" : "success"}
            />
            <KpiCard
              title="מועדף לא זול"
              value={`${kpis.withPremium}`}
              hint={
                kpis.withPremium > 0
                  ? "מועדף > זול ביותר (הזדמנות לאופטימיזציה)"
                  : "כל ספק מועדף = זול ביותר"
              }
              tone={kpis.withPremium > 0 ? "warning" : "success"}
            />
            <Card className="border-dashed border-border/60 bg-muted/30">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-1.5 text-xs">
                  <Boxes className="size-3.5" aria-hidden />
                  טיפ ניווט
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1 text-[11px] leading-relaxed text-muted-foreground">
                <p>
                  <strong className="text-foreground">קליק על שורה</strong> —
                  פותח preview בצד שמאל בלי לסגור את הליסט.
                </p>
                <p>
                  מה-preview: <strong className="text-foreground">&quot;פתח כרטיס מלא&quot;</strong>{" "}
                  לכרטיס V3 העמוק.
                </p>
              </CardContent>
            </Card>
          </div>
        }
        main={
          // Master-detail אינליין: הליסט וה-preview זה לצד זה באותו אזור, ללא overlay.
          // ללא בחירה: הליסט תופס את כל ה-main. עם בחירה: ליסט 60% | preview 40%.
          // ב-mobile (<md): ה-preview נערם מעל הליסט (stack).
          <div className="flex min-h-0 flex-1 flex-col gap-3 md:flex-row md:items-stretch">
            <div
              className={cn(
                "flex min-h-0 flex-col gap-2",
                selectedItemId
                  ? "md:w-3/5 md:flex-none"
                  : "md:flex-1"
              )}
            >
              {loading ? (
                <div className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-border bg-card py-16 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                  טוען פריטים…
                </div>
              ) : (
                <BentoSmartList<ItemRow>
                  items={filteredRows}
                  columns={columns}
                  rowKey={(item) => item.id}
                  selectedRowKey={selectedItemId}
                  onRowClick={(item) =>
                    setSelectedItemId((prev) =>
                      prev === item.id ? null : item.id
                    )
                  }
                  emptyState={
                    rows.length === 0
                      ? "אין פריטים בקטלוג. לחץ \u201Cפריט חדש\u201D כדי ליצור את הראשון."
                      : "לא נמצאו פריטים התואמים לחיפוש."
                  }
                />
              )}
            </div>

            {selectedItemId ? (
              <div className="min-h-0 md:w-2/5 md:flex-none">
                <ItemPreviewPane
                  itemId={selectedItemId}
                  onClose={() => setSelectedItemId(null)}
                  className="h-full max-h-[calc(100vh-11rem)] md:sticky md:top-4"
                />
              </div>
            ) : null}
          </div>
        }
    />
  )
}

// ----------------------------------------------------------------------------
// Local KpiCard — תואם לקונבנציה של מודולים אחרים (כל מודול מגדיר משלו).
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
      <CardHeader className="pb-1">
        <CardTitle className="text-[11px] font-medium text-muted-foreground">
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-0.5">
        <p className={cn("text-xl font-semibold tracking-tight", valueTone)}>
          {value}
        </p>
        {hint ? (
          <p className="text-[10px] leading-tight text-muted-foreground">
            {hint}
          </p>
        ) : null}
      </CardContent>
    </Card>
  )
}

// Suppress unused warning for the union type — kept for documentation/future strict typing.
export type { ItemStatus }
