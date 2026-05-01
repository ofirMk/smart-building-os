"use client"

/**
 * ItemPreviewPane — Phase 7.13.5 (Master-Detail inline).
 *
 * קודם הקומפוננטה הייתה Sheet (slide-over עם overlay) וזה יצר "dead space"
 * עצום ברוב המסך. המשתמש ביקש master-detail אינליין — הטבלה והתצוגה המקדימה
 * זו לצד זו באותה שטח main, ללא overlay.
 *
 * עכשיו הקומפוננטה:
 *   • Card רגיל שנכנס בקולונת הצד של `ItemsCatalogScaffold`
 *   • כותרת sticky עם כפתור סגירה (X)
 *   • אזור תוכן גולל (overflow-y-auto) לתצוגת preview
 *   • Footer sticky עם CTA "פתח כרטיס מלא" → V3
 *
 * הרציונל:
 *   • אין overlay → הליסט נשאר אינטראקטיבי; דפדוף מהיר בין שורות = פשוט
 *     קליק על שורה אחרת וה-preview מתעדכן
 *   • ה-CTA "פתח כרטיס מלא" עדיין קיים לעבודה עמוקה ב-V3
 *   • Breadcrumbs ב-V3 מאפשרים חזרה ל-list בקליק אחד
 */

import * as React from "react"
import Image from "next/image"
import { useRouter } from "next/navigation"
import {
  AlertTriangle,
  ArrowLeft,
  Banknote,
  Barcode,
  Boxes,
  ImageOff,
  Loader2,
  Package,
  Star,
  Tag,
  TrendingDown,
  Warehouse,
  X,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { masterDataFetch } from "@/lib/erp/master-data-browser"
import { cn, formatError } from "@/lib/utils"

// ----------------------------------------------------------------------------
// Types — תת-קבוצה הדוקה של ה-DTO המלא, רק מה שה-preview צריך.
// ----------------------------------------------------------------------------

interface ItemPreviewDto {
  id: string
  sku: string
  description: string
  descriptionEn: string | null
  status: string
  uom: string | null
  unitOfMeasure: string | null
  uomDescription: string | null
  purchasingUom: string | null
  purchasingUomDescription: string | null
  minOrderQuantity: number
  barcode: string | null
  isInventoryManaged: boolean
  isSerialTracked: boolean
  standardCost: number | null
  defaultPrice: number | null
  imageUrl: string | null
  productFamilyId: string | null
  // ── Phase 7.14.2 — Resolved Pricing ──
  preferredUnitPrice: number | null
  preferredCurrency: string | null
  cheapestUnitPrice: number | null
  cheapestCurrency: string | null
  resolvedUnitPrice: number | null
  resolvedPriceSource: "preferred" | "cheapest" | "none"
  resolvedCurrency: string | null
  preferredIsOptimal: boolean | null
  preferredPremium: number | null
  activeSupplierCount: number
}

const STATUS_LABEL: Record<string, string> = {
  ACTIVE: "פעיל",
  INACTIVE: "לא פעיל",
  PURCHASE_ONLY: "רק רכש",
  INTERNAL_ONLY: "פנימי",
  OBSOLETE: "מיושן",
}

const STATUS_BADGE_CLASS: Record<string, string> = {
  ACTIVE: "bg-emerald-500/15 text-emerald-700 border-emerald-500/30",
  INACTIVE: "bg-slate-500/15 text-slate-700 border-slate-500/30",
  PURCHASE_ONLY: "bg-blue-500/15 text-blue-700 border-blue-500/30",
  INTERNAL_ONLY: "bg-amber-500/15 text-amber-700 border-amber-500/30",
  OBSOLETE: "bg-rose-500/15 text-rose-700 border-rose-500/30",
}

function formatNis(value: number | null): string {
  if (value == null) return "—"
  return new Intl.NumberFormat("he-IL", {
    style: "currency",
    currency: "ILS",
    maximumFractionDigits: 2,
  }).format(value)
}

// מטבע דינמי: ILS עם סמל ת, אחרת לפי קוד המטבע.
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

// ----------------------------------------------------------------------------
// Component
// ----------------------------------------------------------------------------

export interface ItemPreviewPaneProps {
  /** מזהה הפריט לתצוגה. אף פעם לא `null` כאן — ה-parent רק מרנדר כשיש ערך. */
  itemId: string
  /** קולבק לסגירת ה-preview (ביטול בחירה). */
  onClose: () => void
  className?: string
}

export function ItemPreviewPane({
  itemId,
  onClose,
  className,
}: ItemPreviewPaneProps) {
  const router = useRouter()
  const [item, setItem] = React.useState<ItemPreviewDto | null>(null)
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    setItem(null)
    masterDataFetch<ItemPreviewDto>(`/api/master-data/items/${itemId}`)
      .then((data) => {
        if (cancelled) return
        setItem(data)
      })
      .catch((e) => {
        if (cancelled) return
        setError(formatError(e) || "טעינת הפריט נכשלה")
      })
      .finally(() => {
        if (cancelled) return
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [itemId])

  const statusLabel = item ? (STATUS_LABEL[item.status] ?? item.status) : ""
  const statusClass = item
    ? (STATUS_BADGE_CLASS[item.status] ??
      "bg-slate-500/15 text-slate-700 border-slate-500/30")
    : ""

  function handleOpenFull() {
    router.push(`/marker-ofek/items/${itemId}`)
  }

  return (
    <Card
      className={cn(
        "flex flex-col overflow-hidden border-border shadow-sm",
        className
      )}
      aria-label="תצוגה מקדימה של פריט"
    >
      {/* Header — sticky title + close */}
      <CardHeader className="flex flex-row items-start justify-between space-y-0 border-b border-border/70 p-4">
        <div className="min-w-0 flex-1">
          <CardTitle className="text-sm font-semibold text-muted-foreground">
            תצוגה מקדימה של פריט
          </CardTitle>
          <p className="mt-0.5 text-[11px] text-muted-foreground/80">
            לפעולות עומק לחץ &quot;פתח כרטיס מלא&quot;.
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={onClose}
          aria-label="סגור תצוגה מקדימה"
          className="-mt-1 -me-1 shrink-0"
        >
          <X className="size-4" aria-hidden />
        </Button>
      </CardHeader>

      {/* Body — scrollable */}
      <CardContent className="flex-1 overflow-y-auto p-4">
        {loading ? (
          <div className="flex min-h-[12rem] items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" aria-hidden />
            טוען פריט…
          </div>
        ) : error ? (
          <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
            {error}
          </div>
        ) : item ? (
          <div className="flex flex-col gap-4">
            {/* Header — image + identity */}
            <div className="flex items-start gap-3">
              <div className="relative size-20 shrink-0 overflow-hidden rounded-xl border border-border/60 bg-muted/40">
                {item.imageUrl ? (
                  <Image
                    src={item.imageUrl}
                    alt={`תמונת פריט ${item.sku}`}
                    fill
                    unoptimized
                    sizes="80px"
                    className="object-cover"
                  />
                ) : (
                  <div className="flex size-full items-center justify-center text-muted-foreground/60">
                    <ImageOff className="size-7" aria-hidden />
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1 space-y-1">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  מאסטר SKU
                </p>
                <h2 className="font-mono text-lg font-bold tracking-tight">
                  {item.sku}
                </h2>
                <p className="line-clamp-2 text-sm leading-snug text-foreground">
                  {item.description}
                </p>
                {item.descriptionEn ? (
                  <p
                    className="line-clamp-1 text-[12px] text-muted-foreground"
                    dir="ltr"
                  >
                    {item.descriptionEn}
                  </p>
                ) : null}
                <div className="flex flex-wrap items-center gap-1.5 pt-1">
                  <Badge
                    variant="outline"
                    className={cn("text-[11px]", statusClass)}
                  >
                    {statusLabel}
                  </Badge>
                  {item.barcode ? (
                    <Badge
                      variant="outline"
                      className="gap-1 font-mono text-[11px]"
                    >
                      <Barcode className="size-3" aria-hidden />
                      {item.barcode}
                    </Badge>
                  ) : null}
                </div>
              </div>
            </div>

            <Separator />

            {/* Key fields grid */}
            <div className="grid grid-cols-2 gap-2">
              <KeyFieldCard
                icon={Warehouse}
                label="יחידת מידה"
                value={
                  item.uomDescription
                    ? `${item.unitOfMeasure ?? "—"} · ${item.uomDescription}`
                    : (item.unitOfMeasure ?? "—")
                }
              />
              <KeyFieldCard
                icon={Package}
                label="כמות הזמנה מינ׳"
                value={`${item.minOrderQuantity}`}
              />
              <KeyFieldCard
                icon={Tag}
                label="עלות תקן"
                value={formatNis(item.standardCost)}
                monospace
              />
              <KeyFieldCard
                icon={Banknote}
                label="מחיר מכירה"
                value={formatNis(item.defaultPrice)}
                monospace
              />
              {item.purchasingUom ? (
                <KeyFieldCard
                  icon={Boxes}
                  label="יחידת רכש"
                  value={
                    item.purchasingUomDescription
                      ? `${item.purchasingUom} · ${item.purchasingUomDescription}`
                      : item.purchasingUom
                  }
                  fullSpan
                />
              ) : null}
            </div>

            {/* ── Phase 7.14.2 — סקציית מחיר רכש פתור ── */}
            <ResolvedPriceSection item={item} />

            {/* Inventory flags */}
            <div className="flex flex-wrap gap-2">
              {item.isInventoryManaged ? (
                <Badge
                  variant="outline"
                  className="border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                >
                  מנוהל מלאי
                </Badge>
              ) : (
                <Badge variant="outline" className="text-muted-foreground">
                  ללא ניהול מלאי
                </Badge>
              )}
              {item.isSerialTracked ? (
                <Badge
                  variant="outline"
                  className="border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-400"
                >
                  מספר סידורי
                </Badge>
              ) : null}
            </div>
          </div>
        ) : null}
      </CardContent>

      {/* Sticky footer — primary CTA to V3 */}
      <div className="border-t border-border/70 bg-card/95 p-3 backdrop-blur supports-[backdrop-filter]:bg-card/85">
        <Button
          type="button"
          size="sm"
          onClick={handleOpenFull}
          disabled={loading}
          className="w-full justify-center gap-1.5"
        >
          פתח כרטיס מלא
          <ArrowLeft className="size-3.5" aria-hidden />
        </Button>
      </div>
    </Card>
  )
}

// ----------------------------------------------------------------------------
// ResolvedPriceSection — סקציית מחיר רכש פתור (Phase 7.14.2.3)
// ----------------------------------------------------------------------------

function ResolvedPriceSection({ item }: { item: ItemPreviewDto }) {
  const noPrice = item.resolvedPriceSource === "none"
  const isPreferred = item.resolvedPriceSource === "preferred"
  const isPremium = isPreferred && item.preferredIsOptimal === false

  return (
    <Card
      className={cn(
        "border-border/60 shadow-none",
        isPremium
          ? "border-amber-500/40 bg-amber-500/5"
          : noPrice
            ? "border-dashed bg-muted/20"
            : ""
      )}
    >
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 p-3 pb-1">
        <CardTitle className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
          <Banknote className="size-3.5" aria-hidden />
          מחיר רכש פתור
        </CardTitle>
        {noPrice ? null : (
          <Badge
            variant="outline"
            className={cn(
              "gap-1 text-[10px]",
              isPreferred
                ? "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300"
                : "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
            )}
          >
            {isPreferred ? (
              <>
                <Star className="size-2.5 fill-current" aria-hidden />
                מהמועדף
              </>
            ) : (
              <>
                <TrendingDown className="size-2.5" aria-hidden />
                מהזול ביותר
              </>
            )}
          </Badge>
        )}
      </CardHeader>
      <CardContent className="space-y-2 p-3 pt-1">
        {noPrice ? (
          <div className="flex flex-col gap-1 text-xs text-muted-foreground">
            <p className="font-medium text-foreground">אין מחיר פתור</p>
            <p>
              {item.activeSupplierCount === 0
                ? "לא הוגדרו מיפויי ספק פעילים לפריט זה."
                : "המיפויים הקיימים הם ללא מחיר."}
            </p>
          </div>
        ) : (
          <>
            <p className="font-currency-mono text-2xl font-bold tabular-nums leading-none">
              {formatPrice(item.resolvedUnitPrice, item.resolvedCurrency)}
            </p>
            <p className="text-[10px] text-muted-foreground">
              {item.activeSupplierCount} ספקים פעילים
            </p>
            {isPremium ? (
              <div className="flex items-start gap-1.5 rounded-md border border-amber-500/30 bg-amber-500/10 p-2 text-[11px] text-amber-800 dark:text-amber-200">
                <AlertTriangle className="size-3.5 shrink-0" aria-hidden />
                <div className="min-w-0 space-y-0.5">
                  <p className="font-medium">המועדף לא הזול ביותר</p>
                  <p className="text-[10px]">
                    מועדף:{" "}
                    <span className="font-currency-mono font-semibold tabular-nums">
                      {formatPrice(item.preferredUnitPrice, item.preferredCurrency)}
                    </span>
                    {" · "}
                    זול:{" "}
                    <span className="font-currency-mono font-semibold tabular-nums">
                      {formatPrice(item.cheapestUnitPrice, item.cheapestCurrency)}
                    </span>
                  </p>
                  {item.preferredPremium != null ? (
                    <p className="text-[10px]">
                      הפרש:{" "}
                      <span className="font-currency-mono font-semibold tabular-nums">
                        +{formatPrice(item.preferredPremium, item.resolvedCurrency)}
                      </span>
                    </p>
                  ) : null}
                </div>
              </div>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  )
}

// ----------------------------------------------------------------------------
// KeyFieldCard — קומפקטי, חוסך אנכית.
// ----------------------------------------------------------------------------

function KeyFieldCard({
  icon: Icon,
  label,
  value,
  monospace = false,
  fullSpan = false,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: string
  monospace?: boolean
  fullSpan?: boolean
}) {
  return (
    <Card
      className={cn(
        "border-border/60 shadow-none",
        fullSpan ? "col-span-2" : ""
      )}
    >
      <CardHeader className="flex flex-row items-center gap-1.5 space-y-0 p-2.5 pb-1">
        <Icon
          className="size-3.5 shrink-0 text-muted-foreground"
          aria-hidden
        />
        <CardTitle className="text-[11px] font-medium text-muted-foreground">
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-2.5 pt-0">
        <p
          className={cn(
            "truncate text-sm font-semibold text-foreground",
            monospace ? "font-currency-mono" : ""
          )}
        >
          {value}
        </p>
      </CardContent>
    </Card>
  )
}
