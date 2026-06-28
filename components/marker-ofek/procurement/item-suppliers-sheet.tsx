"use client"

/**
 * ItemSuppliersSheet — מסך בן אוניברסלי "ספקים של מוצר"
 *
 * מציג את כל הספקים שמקושרים למוצר (master SKU), ממוינים לפי:
 *   1. ספק מועדף (is_preferred) — תמיד ראשון
 *   2. מחיר נטו עולה — הזול ביותר בראש
 *   3. שם ספק אלפביתי — לשוות-מחיר
 *
 * שימוש:
 *   <ItemSuppliersSheet
 *     itemId="uuid"
 *     itemName="שם המוצר"
 *     trigger={<Button>ספקים</Button>}
 *     onSelectPrice={(p) => { setPrice(p.netUnitPrice) }}
 *   />
 *
 * ה-`onSelectPrice` משמש כאשר ה-Sheet מוטמע בתוך dialog של PO line —
 * לחיצה על "בחר מחיר" ממלאת את שדה המחיר בטופס.
 */

import * as React from "react"
import {
  BadgeCheck,
  Bot,
  ExternalLink,
  Loader2,
  ShieldCheck,
  ShieldQuestion,
  Star,
  TrendingDown,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { masterDataFetch } from "@/lib/erp/master-data-browser"
import { cn } from "@/lib/utils"

// ── Types ──────────────────────────────────────────────────────────────────

export type SupplierPriceOption = {
  rowKey: string
  supplierId: string
  supplierName: string | null
  supplierSku: string
  supplierItemId: string | null
  mappingId: string | null
  unitPrice: number | null
  netUnitPrice: number | null
  basePrice: number | null
  discountPercentage: number | null
  currency: string | null
  isPreferred: boolean | null
  supplierDescription: string | null
  confidence: number | null
  matchedByAi: boolean
  verifiedByUser: boolean
  sources: Array<"pricing" | "mapping">
  uom: string | null
  minQty: number | null
  leadTimeDays: number | null
  validFrom: string | null
  validTo: string | null
  isActive: boolean
}

export type SelectedPrice = {
  supplierId: string
  supplierName: string | null
  supplierSku: string
  unitPrice: number
  currency: string
  uom: string | null
  discountPercentage: number | null
  leadTimeDays: number | null
  isPreferred: boolean
}

// ── Helpers ────────────────────────────────────────────────────────────────

const numberFmt = new Intl.NumberFormat("he-IL", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 4,
})

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
    return `${numberFmt.format(value)} ${cur}`
  }
}

function confidenceTier(c: number | null): "A" | "B" | "C" | null {
  if (c == null) return null
  if (c >= 0.9) return "A"
  if (c >= 0.7) return "B"
  return "C"
}

const TIER_COLOR: Record<"A" | "B" | "C", string> = {
  A: "border-emerald-500/40 bg-emerald-50 text-emerald-800",
  B: "border-amber-500/40 bg-amber-50 text-amber-800",
  C: "border-rose-500/40 bg-rose-50 text-rose-800",
}

// ── Main component ──────────────────────────────────────────────────────────

export function ItemSuppliersSheet({
  itemId,
  itemName,
  trigger,
  onSelectPrice,
}: {
  itemId: string
  itemName?: string | null
  trigger?: React.ReactNode
  onSelectPrice?: (selected: SelectedPrice) => void
}) {
  const [open, setOpen] = React.useState(false)
  const [rows, setRows] = React.useState<SupplierPriceOption[]>([])
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const load = React.useCallback(async () => {
    if (!itemId) return
    setLoading(true)
    setError(null)
    try {
      const data = await masterDataFetch<SupplierPriceOption[]>(
        `/api/master-data/items/${encodeURIComponent(itemId)}/suppliers`
      )
      setRows(data)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "טעינת ספקים נכשלה")
    } finally {
      setLoading(false)
    }
  }, [itemId])

  React.useEffect(() => {
    if (open) void load()
  }, [open, load])

  const handleSelect = React.useCallback(
    (row: SupplierPriceOption) => {
      if (!onSelectPrice) return
      const price = row.netUnitPrice ?? row.unitPrice
      if (price == null) return
      onSelectPrice({
        supplierId: row.supplierId,
        supplierName: row.supplierName,
        supplierSku: row.supplierSku,
        unitPrice: price,
        currency: row.currency ?? "ILS",
        uom: row.uom,
        discountPercentage: row.discountPercentage ?? null,
        leadTimeDays: row.leadTimeDays ?? null,
        isPreferred: Boolean(row.isPreferred),
      })
      setOpen(false)
    },
    [onSelectPrice]
  )

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger>
        {trigger ?? (
          <Button variant="ghost" size="sm" className="gap-1.5 text-xs">
            <TrendingDown className="size-3.5" aria-hidden />
            ספקים
          </Button>
        )}
      </SheetTrigger>

      <SheetContent
        side="bottom"
        dir="rtl"
        className="max-h-[80vh] overflow-y-auto"
      >
        <SheetHeader className="mb-4">
          <SheetTitle className="text-start">
            ספקים למוצר
            {itemName ? ` — ${itemName}` : ""}
          </SheetTitle>
          <SheetDescription className="text-start text-xs">
            כל הספקים הזמינים, ממוינים לפי מחיר נמוך. ★ = ספק מועדף.
          </SheetDescription>
        </SheetHeader>

        {loading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <p className="py-4 text-center text-sm text-destructive">{error}</p>
        ) : rows.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">
            אין ספקים מקושרים למוצר זה עדיין.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border">
            <Table>
              <TableHeader>
                <TableRow className="text-xs">
                  <TableHead className="w-8 text-center">#</TableHead>
                  <TableHead>ספק</TableHead>
                  <TableHead>מק&quot;ט ספק</TableHead>
                  <TableHead className="text-end">מחיר נטו</TableHead>
                  <TableHead className="text-end">מחיר ב&apos;</TableHead>
                  <TableHead className="text-end">הנחה</TableHead>
                  <TableHead className="w-14">מ&quot;מ</TableHead>
                  <TableHead className="w-16 text-end">ל&apos; ימים</TableHead>
                  <TableHead className="w-20 text-center">AI</TableHead>
                  {onSelectPrice ? (
                    <TableHead className="w-24 text-center">בחירה</TableHead>
                  ) : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row, idx) => {
                  const tier = confidenceTier(row.confidence)
                  const canSelect =
                    onSelectPrice != null &&
                    (row.netUnitPrice ?? row.unitPrice) != null
                  return (
                    <TableRow
                      key={row.rowKey}
                      className={cn(
                        row.isPreferred &&
                          "bg-amber-50/40 dark:bg-amber-900/10",
                        !row.isActive && "opacity-50"
                      )}
                    >
                      {/* rank */}
                      <TableCell className="text-center text-xs text-muted-foreground tabular-nums">
                        {idx + 1}
                      </TableCell>

                      {/* supplier name */}
                      <TableCell>
                        <div className="flex items-center gap-1.5 text-sm font-medium">
                          {row.isPreferred ? (
                            <Star
                              className="size-3.5 fill-amber-400 text-amber-500 flex-none"
                              aria-label="ספק מועדף"
                            />
                          ) : null}
                          {row.supplierName ?? row.supplierId.slice(0, 8)}
                        </div>
                      </TableCell>

                      {/* supplier SKU */}
                      <TableCell className="font-mono text-xs">
                        {row.supplierSku || "—"}
                      </TableCell>

                      {/* net price */}
                      <TableCell className="text-end font-semibold tabular-nums text-sm">
                        {idx === 0 ? (
                          <span className="text-emerald-700">
                            {formatPrice(row.netUnitPrice ?? row.unitPrice, row.currency)}
                          </span>
                        ) : (
                          formatPrice(row.netUnitPrice ?? row.unitPrice, row.currency)
                        )}
                      </TableCell>

                      {/* base price */}
                      <TableCell className="text-end tabular-nums text-xs text-muted-foreground">
                        {row.basePrice != null && row.discountPercentage
                          ? formatPrice(row.basePrice, row.currency)
                          : "—"}
                      </TableCell>

                      {/* discount */}
                      <TableCell className="text-end tabular-nums text-xs">
                        {row.discountPercentage
                          ? `${row.discountPercentage.toFixed(1)}%`
                          : "—"}
                      </TableCell>

                      {/* UOM */}
                      <TableCell className="text-xs font-mono">
                        {row.uom ?? "—"}
                      </TableCell>

                      {/* lead time */}
                      <TableCell className="text-end tabular-nums text-xs">
                        {row.leadTimeDays != null ? `${row.leadTimeDays}` : "—"}
                      </TableCell>

                      {/* AI confidence */}
                      <TableCell className="text-center">
                        {row.sources.includes("mapping") ? (
                          <div className="flex items-center justify-center gap-1">
                            {row.verifiedByUser ? (
                              <ShieldCheck
                                className="size-3.5 text-emerald-600"
                                aria-label="אומת ידנית"
                              />
                            ) : (
                              <ShieldQuestion
                                className="size-3.5 text-muted-foreground"
                                aria-label="ממתין לאימות"
                              />
                            )}
                            {row.matchedByAi && tier ? (
                              <Badge
                                variant="outline"
                                className={cn(
                                  "h-4 px-1 text-[9px] leading-none",
                                  TIER_COLOR[tier]
                                )}
                              >
                                <Bot className="me-0.5 size-2.5" aria-hidden />
                                {tier}
                              </Badge>
                            ) : null}
                          </div>
                        ) : (
                          <BadgeCheck
                            className="mx-auto size-3.5 text-slate-400"
                            aria-label="הוזן ידנית"
                          />
                        )}
                      </TableCell>

                      {/* select price */}
                      {onSelectPrice ? (
                        <TableCell className="text-center">
                          <Button
                            type="button"
                            size="sm"
                            variant={canSelect ? "outline" : "ghost"}
                            disabled={!canSelect}
                            className="h-6 px-2 text-xs"
                            onClick={() => handleSelect(row)}
                          >
                            בחר
                          </Button>
                        </TableCell>
                      ) : null}
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        )}

        {rows.length > 0 ? (
          <p className="mt-2 text-xs text-muted-foreground">
            {rows.length} ספקים • מחיר ראשון = הנמוך ביותר
          </p>
        ) : null}
      </SheetContent>
    </Sheet>
  )
}
