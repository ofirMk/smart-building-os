"use client"

/**
 * ItemPreviewFocusPane — Phase 7.13.5 (Hybrid Hierarchy).
 *
 * Slide-over Sheet שנפתח כשהמשתמש לוחץ על שורת פריט ב-`BentoSmartList`
 * של `/marker-ofek/items`. תצוגת preview קומפקטית של פריט עם CTA למעבר
 * לכרטיס המלא (V3 single-page).
 *
 * הרציונל:
 *   • שומר על pattern "EntityWorkspace + BentoSmartList + slide-over FocusPane"
 *     הקנוני של מרקר אופק (כמו ב-contracts).
 *   • לא מאבד context — רשימת הפריטים נשארת גלויה ברקע.
 *   • CTA "פתח כרטיס מלא" מעביר ל-route ייעודי `/marker-ofek/items/[id]`
 *     לעבודה עמוקה (V3 onepage).
 *
 * שימוש בפועל:
 *   • סריקה מהירה: דפדוף בין פריטים בלי לעזוב את הליסט.
 *   • עבודה עמוקה: לחיצה על "פתח כרטיס מלא" → V3 עם sticky-side-nav.
 */

import * as React from "react"
import Image from "next/image"
import { useRouter } from "next/navigation"
import {
  ArrowLeft,
  Banknote,
  Barcode,
  Boxes,
  ImageOff,
  Loader2,
  Package,
  Tag,
  Warehouse,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Separator } from "@/components/ui/separator"
import { masterDataFetch } from "@/lib/erp/master-data-browser"
import { cn, formatError } from "@/lib/utils"

// ----------------------------------------------------------------------------
// Types — tight subset of the full ItemDto, only what we need for preview.
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

// ----------------------------------------------------------------------------
// Component
// ----------------------------------------------------------------------------

export interface ItemPreviewFocusPaneProps {
  /** מזהה הפריט הפעיל. `null` סוגר את ה-Sheet. */
  itemId: string | null
  /** קולבק כשה-Sheet נסגר (X / ESC / קליק מחוץ). */
  onClose: () => void
}

export function ItemPreviewFocusPane({
  itemId,
  onClose,
}: ItemPreviewFocusPaneProps) {
  const router = useRouter()
  const [item, setItem] = React.useState<ItemPreviewDto | null>(null)
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!itemId) {
      // אל תאפס מיד — אנימציית הסגירה של Sheet עדין מתבצעת.
      // טעינה הבאה תאפס תוצרים ישנים לפני המחזה החדש.
      return
    }
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

  const isOpen = Boolean(itemId)
  const statusLabel = item ? (STATUS_LABEL[item.status] ?? item.status) : ""
  const statusClass = item
    ? (STATUS_BADGE_CLASS[item.status] ??
      "bg-slate-500/15 text-slate-700 border-slate-500/30")
    : ""

  function handleOpenFull() {
    if (!itemId) return
    router.push(`/marker-ofek/items/${itemId}`)
  }

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        side="left"
        // ‎`sm:max-w-[36rem]` מכריח override ל-default `sm:max-w-sm` שמגיע מ-shadcn
        // (אחרת ה-Sheet חנוק ב-24rem גם אם אנחנו מבקשים 36rem).
        className="flex w-[min(36rem,100vw)] flex-col gap-0 p-0 sm:max-w-[36rem]"
      >
        <SheetHeader className="border-b border-border/70 p-4 text-start">
          <SheetTitle className="text-sm font-semibold text-muted-foreground">
            תצוגה מקדימה של פריט
          </SheetTitle>
          <SheetDescription className="text-[12px]">
            מבט מהיר על הפריט הנבחר. לפעולות עומק לחץ &quot;פתח כרטיס מלא&quot;.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto p-4">
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
                    // ‎next/image עם unoptimized כי URLs יכולים להיות חיצוניים שונים.
                    // ה-fill עם sizes שומר על ביצועים טובים גם ב-mobile.
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
                    fullSpan={!item.isSerialTracked && !item.isInventoryManaged}
                  />
                ) : null}
              </div>

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
        </div>

        {/* Sticky footer — CTAs */}
        <div className="sticky bottom-0 border-t border-border/70 bg-card/95 p-3 backdrop-blur supports-[backdrop-filter]:bg-card/85">
          <div className="flex items-center justify-between gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={onClose}>
              סגור
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleOpenFull}
              disabled={!itemId || loading}
              className="gap-1.5"
            >
              פתח כרטיס מלא
              <ArrowLeft className="size-3.5" aria-hidden />
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
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
