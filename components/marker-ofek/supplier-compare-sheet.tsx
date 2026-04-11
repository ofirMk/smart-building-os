"use client"

import * as React from "react"
import { Loader2 } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { createSupabaseBrowserClient } from "@/lib/supabase/browser"
import { cn } from "@/lib/utils"

type SupplierRow = {
  id: string
  supplier_sku: string | null
  unit_price: number
  discount_pct: number
  last_updated: string
  entities: unknown
}

function embedEntityName(x: unknown): string {
  if (x == null) return "—"
  if (
    typeof x === "object" &&
    x !== null &&
    "name" in x &&
    typeof (x as { name: unknown }).name === "string"
  ) {
    return (x as { name: string }).name
  }
  if (Array.isArray(x) && x[0] && typeof (x[0] as { name?: unknown }).name === "string") {
    return (x[0] as { name: string }).name
  }
  return "—"
}

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100
}

export function netUnitPrice(unitPrice: number, discountPct: number): number {
  const p = Number(unitPrice) || 0
  const d = Number(discountPct) || 0
  return roundMoney(p * (1 - d / 100))
}

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

export type SupplierPickPayload = {
  supplierItemId: string
  supplierSku: string
  netUnitPrice: number
}

type SupplierCompareSheetProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  masterItemId: string | null
  masterLabel: string
  onPick: (payload: SupplierPickPayload) => void
}

export function SupplierCompareSheet({
  open,
  onOpenChange,
  masterItemId,
  masterLabel,
  onPick,
}: SupplierCompareSheetProps) {
  const [rows, setRows] = React.useState<SupplierRow[]>([])
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!open || !masterItemId) {
      setRows([])
      setError(null)
      return
    }

    let cancelled = false
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const supabase = createSupabaseBrowserClient()
        const { data, error: qErr } = await supabase
          .from("supplier_items")
          .select(
            "id, supplier_sku, unit_price, discount_pct, last_updated, entities ( name )"
          )
          .eq("master_item_id", masterItemId)
          .order("unit_price", { ascending: true })

        if (qErr) throw qErr
        if (!cancelled) setRows((data as SupplierRow[]) ?? [])
      } catch (e) {
        if (!cancelled) {
          setRows([])
          setError(
            e instanceof Error
              ? e.message
              : "טעינת ספקים נכשלה — ודאו שקיימת טבלת supplier_items"
          )
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [open, masterItemId])

  const cheapestNet = React.useMemo(() => {
    if (rows.length === 0) return null
    let min = Infinity
    for (const r of rows) {
      const n = netUnitPrice(r.unit_price, r.discount_pct)
      if (n < min) min = n
    }
    return Number.isFinite(min) ? min : null
  }, [rows])

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 overflow-y-auto sm:max-w-lg"
      >
        <SheetHeader className="border-b border-border/60 pb-4 text-start">
          <SheetTitle className="text-start">השוואת מחירים</SheetTitle>
          <SheetDescription className="text-start">
            פריט מאסטר: <span className="font-medium text-foreground">{masterLabel}</span>
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-1 flex-col gap-3 p-4">
          {loading ? (
            <div className="flex items-center gap-2 py-8 text-muted-foreground">
              <Loader2 className="size-5 animate-spin" aria-hidden />
              טוען הצעות ספקים…
            </div>
          ) : error ? (
            <p className="text-sm text-destructive">{error}</p>
          ) : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              אין רשומות ספק לפריט זה. הוסיפו הצעות בכרטיס הפריט או ב-Supabase.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {rows.map((r) => {
                const net = netUnitPrice(r.unit_price, r.discount_pct)
                const isCheapest =
                  cheapestNet != null && Math.abs(net - cheapestNet) < 0.005
                return (
                  <li key={r.id}>
                    <Button
                      type="button"
                      variant="outline"
                      className={cn(
                        "h-auto min-h-[4.5rem] w-full flex-col items-stretch gap-2 py-3 text-start whitespace-normal",
                        isCheapest &&
                          "border-emerald-500/60 bg-emerald-500/10 hover:bg-emerald-500/15"
                      )}
                      onClick={() => {
                        onPick({
                          supplierItemId: r.id,
                          supplierSku: r.supplier_sku?.trim() || "",
                          netUnitPrice: net,
                        })
                        onOpenChange(false)
                      }}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-semibold">
                          {embedEntityName(r.entities)}
                        </span>
                        {isCheapest ? (
                          <Badge className="shrink-0 bg-emerald-600 text-white hover:bg-emerald-600">
                            הזול ביותר
                          </Badge>
                        ) : null}
                      </div>
                      <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-muted-foreground sm:grid-cols-3">
                        <span>
                          מק״ט ספק:{" "}
                          <span className="font-mono text-foreground">
                            {r.supplier_sku?.trim() || "—"}
                          </span>
                        </span>
                        <span>
                          מחירון:{" "}
                          <span className="tabular-nums text-foreground">
                            {currencyFormatter.format(Number(r.unit_price) || 0)}
                          </span>
                        </span>
                        <span>
                          הנחה:{" "}
                          <span className="tabular-nums text-foreground">
                            {Number(r.discount_pct) || 0}%
                          </span>
                        </span>
                        <span className="col-span-2 sm:col-span-1">
                          נטו:{" "}
                          <span className="font-semibold tabular-nums text-foreground">
                            {currencyFormatter.format(net)}
                          </span>
                        </span>
                        <span className="col-span-2 text-[11px] sm:col-span-2">
                          עדכון:{" "}
                          {r.last_updated
                            ? dateTimeFormatter.format(new Date(r.last_updated))
                            : "—"}
                        </span>
                      </div>
                    </Button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
