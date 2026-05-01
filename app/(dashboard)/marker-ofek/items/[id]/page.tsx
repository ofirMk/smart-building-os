"use client"

/**
 * Master SKU Card — Phase 7.13.3 (refactored)
 *
 * רקע
 *   המסך ההיסטורי הציג כרטיס שטוח: הדר עם SKU + תיאור, 4 stat-cards, וטבלת
 *   "ניהול ספקים ומחירים" שעבדה על ה-API הישן `/api/erp/master-data/...`.
 *
 * מה השתנה ב-7.13.3
 *   המסך עודכן ל-4 טאבים שחושפים את כל ה-master-data layer של ה-ERP:
 *
 *     1. כללי (default)         — Stats + טבלת supplier-items הישנה כפי שהיתה.
 *     2. נכסים וקבצים            — `erp_md_item_assets` (Phase 7.13.3.A).
 *     3. מיפויי ספקים             — `erp_md_supplier_item_mapping` (7.13.3.B).
 *     4. היסטוריית רכש             — drill מתוך `erp_purchase_order_lines` (7.13.3.C).
 *
 * תאימות לאחור
 *   ה-API הישן `/api/erp/master-data/items/[id]` ממשיך לעבוד; הוא נטען רק
 *   בטאב "כללי" (כמו לפני). 3 ה-API החדשים לטאבים האחרים נטענים lazy על-ידי
 *   הטאב עצמו (kein בקשות מבוזבזות אם המשתמש לא נכנס לטאב).
 */

import * as React from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import {
  ArrowRight,
  FileStack,
  History,
  Loader2,
  Package,
  ShoppingBag,
  Tags,
  Warehouse,
} from "lucide-react"

import { ItemAssetsTab } from "@/components/marker-ofek/items/item-assets-tab"
import { ItemPurchaseHistoryTab } from "@/components/marker-ofek/items/item-purchase-history-tab"
import { ItemSupplierMappingsTab } from "@/components/marker-ofek/items/item-supplier-mappings-tab"
import { netUnitPrice } from "@/components/marker-ofek/supplier-compare-sheet"
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { masterDataFetch } from "@/lib/erp/master-data-browser"
import { cn, formatError } from "@/lib/utils"

// ============================================================================
// Types — שמורים מהמסך ההיסטורי כדי לצמצם diff בטאב "כללי".
// ============================================================================

type ItemDetails = {
  id: string
  sku: string
  description: string
  uom: string | null
  legacyDefaultPrice: number | null
  isInventoryManaged: boolean
  category?: string | null
}

type SupplierJoinRow = {
  id: string
  supplier_sku: string | null
  unit_price: number
  discount_pct: number
  last_updated: string | null
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

// ============================================================================
// Page
// ============================================================================

export default function MarkerOfekItemMasterPage() {
  const params = useParams()
  const id = typeof params.id === "string" ? params.id : ""

  const [item, setItem] = React.useState<ItemDetails | null>(null)
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
        const [itemData, supplierItems, supplierRows] = await Promise.all([
          masterDataFetch<ItemDetails>(`/api/erp/master-data/items/${id}`),
          masterDataFetch<
            Array<{
              id: string
              supplierId: string
              supplierSku: string | null
              basePrice: number
              discountPercentage: number
              aiLastParsedAt: string | null
              validFrom: string | null
            }>
          >(`/api/erp/master-data/supplier-items?itemId=${id}`),
          masterDataFetch<Array<{ id: string; name: string }>>(
            "/api/erp/master-data/suppliers"
          ),
        ])
        const supplierNameMap = new Map(
          supplierRows.map((row) => [row.id, row.name])
        )
        const mappedSuppliers: SupplierJoinRow[] = supplierItems.map((row) => ({
          id: row.id,
          supplier_sku: row.supplierSku,
          unit_price: Number(row.basePrice ?? 0),
          discount_pct: Number(row.discountPercentage ?? 0),
          last_updated: row.aiLastParsedAt ?? row.validFrom,
          entities: { name: supplierNameMap.get(row.supplierId) ?? "—" },
        }))
        if (!cancelled) {
          setItem(itemData ?? null)
          setSuppliers(mappedSuppliers)
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
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 pb-12">
      <Link
        href="/marker-ofek/items"
        className="inline-flex w-fit items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowRight className="size-4 rotate-180" aria-hidden />
        חזרה לקטלוג פריטים
      </Link>

      {/* Header */}
      <header className="rounded-2xl border border-border/70 bg-card/60 p-6 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="flex items-start gap-4">
            <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-violet-500/15 text-violet-700">
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

      {/* Tabs */}
      <Tabs defaultValue="general" className="flex flex-col gap-4">
        <TabsList className="w-full justify-start">
          <TabsTrigger value="general" className="gap-2">
            <Package className="size-4" aria-hidden />
            כללי
          </TabsTrigger>
          <TabsTrigger value="assets" className="gap-2">
            <FileStack className="size-4" aria-hidden />
            נכסים וקבצים
          </TabsTrigger>
          <TabsTrigger value="mappings" className="gap-2">
            <ShoppingBag className="size-4" aria-hidden />
            מיפויי ספקים
          </TabsTrigger>
          <TabsTrigger value="history" className="gap-2">
            <History className="size-4" aria-hidden />
            היסטוריית רכש
          </TabsTrigger>
        </TabsList>

        <TabsContent value="general" className="space-y-4">
          <GeneralTab item={item} suppliers={suppliers} />
        </TabsContent>

        <TabsContent value="assets">
          <ItemAssetsTab itemId={id} />
        </TabsContent>

        <TabsContent value="mappings">
          <ItemSupplierMappingsTab itemId={id} />
        </TabsContent>

        <TabsContent value="history">
          <ItemPurchaseHistoryTab itemId={id} />
        </TabsContent>
      </Tabs>
    </div>
  )
}

// ============================================================================
// GeneralTab — שומר את התצוגה ההיסטורית (4 stats + supplier prices table).
// מבודד מהפיצ'רים החדשים של 7.13.3 כדי להישאר reverse-compatible.
// ============================================================================

function GeneralTab({
  item,
  suppliers,
}: {
  item: ItemDetails
  suppliers: SupplierJoinRow[]
}) {
  const cheapestNet = React.useMemo(() => {
    if (suppliers.length === 0) return null
    let min = Infinity
    for (const s of suppliers) {
      const n = netUnitPrice(s.unit_price, s.discount_pct)
      if (n < min) min = n
    }
    return Number.isFinite(min) ? min : null
  }, [suppliers])

  return (
    <>
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="border-border/70 shadow-sm">
          <CardHeader className="pb-2">
            <CardDescription>יחידת מידה</CardDescription>
            <CardTitle className="text-lg">
              {item.uom?.trim() || "—"}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card className="border-border/70 shadow-sm">
          <CardHeader className="pb-2">
            <CardDescription>מחיר ברירת מחדל</CardDescription>
            <CardTitle className="text-lg tabular-nums">
              {item.legacyDefaultPrice != null
                ? currencyFormatter.format(Number(item.legacyDefaultPrice))
                : "—"}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card className="border-border/70 shadow-sm">
          <CardHeader className="pb-2">
            <CardDescription>מלאי</CardDescription>
            <CardTitle className="text-lg">
              {item.isInventoryManaged ? "כן" : "לא"}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card className="border-border/70 shadow-sm">
          <CardHeader className="pb-2">
            <CardDescription>ספקים מקושרים (legacy)</CardDescription>
            <CardTitle className="text-lg tabular-nums">
              {suppliers.length}
            </CardTitle>
          </CardHeader>
        </Card>
      </section>

      <Card className="border-border/70 shadow-sm">
        <CardHeader className="border-b border-border/60 pb-4">
          <div className="flex items-start gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-700">
              <Warehouse className="size-5" aria-hidden />
            </div>
            <div className="space-y-1">
              <CardTitle>ניהול ספקים ומחירים (legacy)</CardTitle>
              <CardDescription>
                מקור: `erp_md_supplier_items` הישן. ה-Master ↔ Supplier mappings
                החדשים מ-7.4.5 חיים ב-tab &quot;מיפויי ספקים&quot;.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-6">
          {suppliers.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              אין רשומות ספק מקושרות לפריט זה. הוסיפו הצעות ספק במסך מאסטר דאטה
              או דרך תהליך הרכש.
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
                            "bg-emerald-500/12 hover:bg-emerald-500/18"
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
                            isCheapest && "text-emerald-700"
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
    </>
  )
}
