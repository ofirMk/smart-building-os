"use client"

import Link from "next/link"
import { useParams } from "next/navigation"
import * as React from "react"
import {
  ArrowRight,
  Loader2,
  Package,
  Tags,
  Warehouse,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { netUnitPrice } from "@/components/marker-ofek/supplier-compare-sheet"
import { ITEMS_CATALOG_COLUMNS } from "@/lib/marker-ofek/supabase-fields"
import { createSupabaseBrowserClient } from "@/lib/supabase/browser"
import { cn, formatError } from "@/lib/utils"
import type { MarkerOfekItemsCatalogRow } from "@/types/marker-ofek"

type SupplierJoinRow = {
  id: string
  supplier_sku: string | null
  unit_price: number
  discount_pct: number
  last_updated: string
  entities: unknown
}

function supplierNameFromJoin(x: unknown): string {
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

export default function MarkerOfekItemMasterPage() {
  const params = useParams()
  const id = typeof params.id === "string" ? params.id : ""

  const [item, setItem] = React.useState<MarkerOfekItemsCatalogRow | null>(null)
  const [suppliers, setSuppliers] = React.useState<SupplierJoinRow[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!id) {
      setLoading(false)
      setError("מזהה פריט חסר")
      return
    }

    let cancelled = false
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const supabase = createSupabaseBrowserClient()
        const [itemRes, supRes] = await Promise.all([
          supabase
            .from("items_catalog")
            .select(ITEMS_CATALOG_COLUMNS)
            .eq("id", id)
            .maybeSingle(),
          supabase
            .from("supplier_items")
            .select(
              "id, supplier_sku, unit_price, discount_pct, last_updated, entities ( name )"
            )
            .eq("master_item_id", id)
            .order("unit_price", { ascending: true }),
        ])
        if (itemRes.error) throw itemRes.error
        if (supRes.error) throw supRes.error
        if (!cancelled) {
          setItem((itemRes.data as MarkerOfekItemsCatalogRow) ?? null)
          setSuppliers((supRes.data as SupplierJoinRow[]) ?? [])
        }
      } catch (e) {
        if (!cancelled) {
          setItem(null)
          setSuppliers([])
          setError(formatError(e) || "טעינת הפריט נכשלה")
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [id])

  const cheapestNet = React.useMemo(() => {
    if (suppliers.length === 0) return null
    let min = Infinity
    for (const s of suppliers) {
      const n = netUnitPrice(s.unit_price, s.discount_pct)
      if (n < min) min = n
    }
    return Number.isFinite(min) ? min : null
  }, [suppliers])

  if (!id) {
    return (
      <div className="mx-auto max-w-3xl py-10 text-center text-sm text-muted-foreground">
        קישור לא תקין.
      </div>
    )
  }

  if (loading) {
    return (
      <div className="mx-auto flex max-w-5xl items-center gap-2 py-16 text-muted-foreground">
        <Loader2 className="size-5 animate-spin" aria-hidden />
        טוען כרטיס פריט…
      </div>
    )
  }

  if (error || !item) {
    return (
      <div className="mx-auto flex max-w-3xl flex-col gap-4 py-10">
        <Link
          href="/marker-ofek/items"
          className="inline-flex w-fit items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowRight className="size-4 rotate-180" aria-hidden />
          חזרה לקטלוג
        </Link>
        <p className="text-sm text-destructive">
          {error ?? "הפריט לא נמצא או שאין הרשאה."}
        </p>
      </div>
    )
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 pb-12">
      <Link
        href="/marker-ofek/items"
        className="inline-flex w-fit items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowRight className="size-4 rotate-180" aria-hidden />
        חזרה לקטלוג פריטים
      </Link>

      <header className="rounded-2xl border border-border/70 bg-card/60 p-6 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="flex items-start gap-4">
            <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-violet-500/15 text-violet-700 dark:text-violet-400">
              <Tags className="size-6" aria-hidden />
            </div>
            <div className="min-w-0 space-y-2">
              <p className="text-xs font-medium text-muted-foreground">
                מאסטר SKU
              </p>
              <h1 className="font-mono text-2xl font-bold tracking-tight md:text-3xl">
                {item.sku}
              </h1>
              <p className="text-base leading-relaxed text-foreground">
                {item.description}
              </p>
            </div>
          </div>
          {item.category?.trim() ? (
            <Badge variant="secondary" className="shrink-0 self-start">
              {item.category.trim()}
            </Badge>
          ) : null}
        </div>
      </header>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="border-border/70 shadow-sm">
          <CardHeader className="pb-2">
            <CardDescription>יחידת מידה</CardDescription>
            <CardTitle className="text-lg">
              {item.unit?.trim() || "—"}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card className="border-border/70 shadow-sm">
          <CardHeader className="pb-2">
            <CardDescription>מחיר ברירת מחדל</CardDescription>
            <CardTitle className="text-lg tabular-nums">
              {item.default_price != null
                ? currencyFormatter.format(Number(item.default_price))
                : "—"}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card className="border-border/70 shadow-sm">
          <CardHeader className="pb-2">
            <CardDescription>מלאי</CardDescription>
            <CardTitle className="text-lg">
              {item.is_inventory ? "כן" : "לא"}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card className="border-border/70 shadow-sm">
          <CardHeader className="pb-2">
            <CardDescription>ספקים מקושרים</CardDescription>
            <CardTitle className="text-lg tabular-nums">
              {suppliers.length}
            </CardTitle>
          </CardHeader>
        </Card>
      </section>

      <Card className="border-border/70 shadow-sm">
        <CardHeader className="border-b border-border/60 pb-4">
          <div className="flex items-start gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-700 dark:text-emerald-400">
              <Warehouse className="size-5" aria-hidden />
            </div>
            <div className="space-y-1">
              <CardTitle>ניהול ספקים ומחירים</CardTitle>
              <CardDescription>
                כל ההצעות הרשומות לפריט מאסטר זה. השורה עם המחיר הנטו הנמוך ביותר
                מודגשת.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-6">
          {suppliers.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              אין רשומות ב־supplier_items לפריט זה. הוסיפו הצעות ספק ב-Supabase או
              דרך תהליך הרכש.
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
                  {suppliers.map((s) => {
                    const net = netUnitPrice(s.unit_price, s.discount_pct)
                    const isCheapest =
                      cheapestNet != null && Math.abs(net - cheapestNet) < 0.005
                    return (
                      <TableRow
                        key={s.id}
                        className={cn(
                          isCheapest &&
                            "bg-emerald-500/12 hover:bg-emerald-500/18 dark:bg-emerald-500/10"
                        )}
                      >
                        <TableCell className="font-medium">
                          {supplierNameFromJoin(s.entities)}
                          {isCheapest ? (
                            <Badge className="ms-2 bg-emerald-600 text-white hover:bg-emerald-600">
                              הזול ביותר
                            </Badge>
                          ) : null}
                        </TableCell>
                        <TableCell className="font-mono text-sm">
                          {s.supplier_sku?.trim() || "—"}
                        </TableCell>
                        <TableCell className="tabular-nums">
                          {currencyFormatter.format(Number(s.unit_price) || 0)}
                        </TableCell>
                        <TableCell className="tabular-nums">
                          {Number(s.discount_pct) || 0}%
                        </TableCell>
                        <TableCell
                          className={cn(
                            "font-semibold tabular-nums",
                            isCheapest && "text-emerald-700 dark:text-emerald-400"
                          )}
                        >
                          {currencyFormatter.format(net)}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {s.last_updated
                            ? dateTimeFormatter.format(new Date(s.last_updated))
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

      <Card className="border-dashed border-border/80 bg-muted/20">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Package className="size-5 text-muted-foreground" aria-hidden />
            <CardTitle className="text-base">שימוש ברכש</CardTitle>
          </div>
          <CardDescription>
            ביצירת הזמנת רכש חדשה ניתן לבחור פריט מאסטר זה ולהשוות מחירי ספקים
            לפני שמירת השורה.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Link
            href="/marker-ofek/procurement/new"
            className="text-sm font-medium text-primary underline-offset-4 hover:underline"
          >
            מעבר להזמנת רכש חדשה
          </Link>
        </CardContent>
      </Card>
    </div>
  )
}
