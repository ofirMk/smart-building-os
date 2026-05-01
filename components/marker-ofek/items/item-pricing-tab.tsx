"use client"

/**
 * ItemPricingTab — Phase 7.13.4
 *
 * טאב "מחירים" editable:
 *   • standard_cost — עלות תקן (חדש ב-7.13.4; להערכת שווי מלאי ולחישוב רווח תיאורטי).
 *   • default_price — מחיר מחירון ברירת מחדל לפו"ר (cost יעד).
 *   • (read-only) טבלת `erp_md_supplier_items` ההיסטורית שהופיעה לפני 7.13.4
 *     בטאב "כללי". מועברת לכאן כדי לרכז את כל היבטי המחירים.
 */

import * as React from "react"
import { useFormContext } from "react-hook-form"
import { Banknote, Warehouse } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { netUnitPrice } from "@/components/marker-ofek/supplier-compare-sheet"
import { cn } from "@/lib/utils"

import type { ItemEditFormValues } from "./item-edit-form-types"

// ----------------------------------------------------------------------------
// Types — Legacy supplier-items row (erp_md_supplier_items).
// ----------------------------------------------------------------------------

export interface LegacySupplierPriceRow {
  id: string
  supplierName: string
  supplierSku: string | null
  unitPrice: number
  discountPct: number
  lastUpdated: string | null
}

export interface ItemPricingTabProps {
  /** רשומות מחיר היסטוריות מ-supplier_items (legacy). אופציונלי. */
  legacySuppliers?: LegacySupplierPriceRow[]
}

// ----------------------------------------------------------------------------
// Formatters (co-located — לא משותפים עם ה-page כדי שהטאב יהיה self-contained).
// ----------------------------------------------------------------------------

const currencyFormatter = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const dateTimeFormatter = new Intl.DateTimeFormat("he-IL", {
  dateStyle: "short",
  timeStyle: "short",
})

// ----------------------------------------------------------------------------
// Component
// ----------------------------------------------------------------------------

export function ItemPricingTab({ legacySuppliers = [] }: ItemPricingTabProps) {
  const {
    register,
    formState: { errors },
  } = useFormContext<ItemEditFormValues>()

  const cheapestNet = React.useMemo(() => {
    if (legacySuppliers.length === 0) return null
    let min = Infinity
    for (const s of legacySuppliers) {
      const n = netUnitPrice(s.unitPrice, s.discountPct)
      if (n < min) min = n
    }
    return Number.isFinite(min) ? min : null
  }, [legacySuppliers])

  return (
    <div className="space-y-4">
      {/* ── Cost inputs ── */}
      <Card className="border-border/70 shadow-sm">
        <CardHeader className="pb-4">
          <div className="flex items-start gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-amber-500/15 text-amber-700">
              <Banknote className="size-5" aria-hidden />
            </div>
            <div>
              <CardTitle>עלויות ומחירים</CardTitle>
              <CardDescription>
                עלות תקן להערכת שווי מלאי + מחיר מחירון יעד לרכש.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="price-std-cost">עלות תקן (₪)</Label>
              <Input
                id="price-std-cost"
                dir="ltr"
                inputMode="decimal"
                className="font-mono"
                {...register("standardCost", {
                  validate: (v) => {
                    if (!v.trim()) return true
                    const s = v.trim().replace(",", ".")
                    if (!/^\d+(\.\d{1,4})?$/.test(s))
                      return "עד 4 ספרות עשרוניות, לא שלילי"
                    return true
                  },
                })}
                placeholder="0.00"
              />
              <p className="text-[11px] text-muted-foreground">
                לחישוב שווי מלאי תיאורטי ולמדדי רווחיות. לא מוזן לתנועות מלאי
                ישירות.
              </p>
              {errors.standardCost ? (
                <p className="text-[11px] text-destructive">
                  {errors.standardCost.message}
                </p>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor="price-default">מחיר מחירון ברירת מחדל (₪)</Label>
              <Input
                id="price-default"
                dir="ltr"
                inputMode="decimal"
                className="font-mono"
                {...register("defaultPrice", {
                  validate: (v) => {
                    if (!v.trim()) return true
                    const s = v.trim().replace(",", ".")
                    if (!/^\d+(\.\d{1,4})?$/.test(s))
                      return "עד 4 ספרות עשרוניות, לא שלילי"
                    return true
                  },
                })}
                placeholder="0.00"
              />
              <p className="text-[11px] text-muted-foreground">
                מחיר ברירת המחדל שמופיע בשורות פו&quot;ר חדשות (לפני suggestions).
              </p>
              {errors.defaultPrice ? (
                <p className="text-[11px] text-destructive">
                  {errors.defaultPrice.message}
                </p>
              ) : null}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Legacy supplier prices table ── */}
      <Card className="border-border/70 shadow-sm">
        <CardHeader className="border-b border-border/60 pb-4">
          <div className="flex items-start gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-700">
              <Warehouse className="size-5" aria-hidden />
            </div>
            <div className="space-y-1">
              <CardTitle>מחירי ספקים (legacy)</CardTitle>
              <CardDescription>
                מקור: <code>erp_md_supplier_items</code> ההיסטורי. ה-Master ↔
                Supplier mappings המודרניים חיים בטאב &quot;מיפויי ספקים&quot;.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-6">
          {legacySuppliers.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              אין רשומות ספק מקושרות לפריט זה. ניתן להוסיף דרך טאב &quot;מיפויי
              ספקים&quot; או תהליך הרכש.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-border/60">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-start">שם ספק</TableHead>
                    <TableHead className="text-start">מק״ט ספק</TableHead>
                    <TableHead className="text-start">מחיר מחירון</TableHead>
                    <TableHead className="text-start">הנחה</TableHead>
                    <TableHead className="text-start">מחיר נטו</TableHead>
                    <TableHead className="text-start">עדכון אחרון</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {legacySuppliers.map((s) => {
                    const net = netUnitPrice(s.unitPrice, s.discountPct)
                    const isCheapest =
                      cheapestNet != null && Math.abs(net - cheapestNet) < 0.005
                    return (
                      <TableRow
                        key={s.id}
                        className={cn(
                          isCheapest &&
                            "bg-emerald-500/12 hover:bg-emerald-500/18"
                        )}
                      >
                        <TableCell className="font-medium">
                          {s.supplierName}
                          {isCheapest ? (
                            <Badge className="ms-2 bg-emerald-600 text-white hover:bg-emerald-600">
                              הזול ביותר
                            </Badge>
                          ) : null}
                        </TableCell>
                        <TableCell className="font-mono text-sm">
                          {s.supplierSku?.trim() || "—"}
                        </TableCell>
                        <TableCell className="tabular-nums">
                          {currencyFormatter.format(s.unitPrice)}
                        </TableCell>
                        <TableCell className="tabular-nums">
                          {s.discountPct}%
                        </TableCell>
                        <TableCell
                          className={cn(
                            "font-semibold tabular-nums",
                            isCheapest && "text-emerald-700"
                          )}
                        >
                          {currencyFormatter.format(net)}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {s.lastUpdated
                            ? dateTimeFormatter.format(new Date(s.lastUpdated))
                            : "—"}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
