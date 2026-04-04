"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import * as React from "react"
import { ArrowRight, Loader2, Package, Plus, TrendingDown } from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { buttonVariants } from "@/components/ui/button-variants"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
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
import { ITEMS_CATALOG_COLUMNS } from "@/lib/marker-ofek/supabase-fields"
import { createSupabaseBrowserClient } from "@/lib/supabase/browser"
import { cn, formatError } from "@/lib/utils"
import type { MarkerOfekItemsCatalogRow } from "@/types/marker-ofek"

type SupplierPriceHistoryRow = {
  id: string
  supplier_sku: string | null
  unit_price: number
  discount_pct: number
  last_updated: string
  entities: { name: string } | { name: string }[] | null
}

function embedOne<T>(x: T | T[] | null | undefined): T | null {
  if (x == null) return null
  return Array.isArray(x) ? (x[0] ?? null) : x
}

function netUnitPrice(unitPrice: number, discountPct: number): number {
  const p = Number(unitPrice) || 0
  const d = Number(discountPct) || 0
  return Math.round(p * (1 - d / 100) * 100) / 100
}

const CATALOG_PAGE_SIZE = 50

const currencyFormatter = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

export default function MarkerOfekItemsCatalogPage() {
  const router = useRouter()
  const [rows, setRows] = React.useState<MarkerOfekItemsCatalogRow[]>([])
  const [loading, setLoading] = React.useState(true)
  const [loadingMore, setLoadingMore] = React.useState(false)
  const [hasMore, setHasMore] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const [searchQuery, setSearchQuery] = React.useState("")
  const [selectedItemId, setSelectedItemId] = React.useState<string>("")
  const [historyRows, setHistoryRows] = React.useState<SupplierPriceHistoryRow[]>([])
  const [loadingHistory, setLoadingHistory] = React.useState(false)
  const [form, setForm] = React.useState({
    sku: "",
    description: "",
    unit: "",
    category: "",
    default_price: "",
    is_inventory: false,
  })

  const rowsRef = React.useRef<MarkerOfekItemsCatalogRow[]>([])
  React.useEffect(() => {
    rowsRef.current = rows
  }, [rows])

  const loadFirstPage = React.useCallback(async () => {
    setLoading(true)
    setHasMore(true)
    setError(null)
    try {
      const supabase = createSupabaseBrowserClient()
      const db = supabase.schema("public")
      const { data, error: qErr } = await db
        .from("items_catalog")
        .select(ITEMS_CATALOG_COLUMNS)
        .order("sku", { ascending: true })
        .range(0, CATALOG_PAGE_SIZE - 1)
      if (qErr) throw qErr
      const batch = (data as MarkerOfekItemsCatalogRow[]) ?? []
      setRows(batch)
      setHasMore(batch.length === CATALOG_PAGE_SIZE)
    } catch (e) {
      setError(formatError(e))
      setRows([])
      setHasMore(false)
    } finally {
      setLoading(false)
    }
  }, [])

  const loadMoreBusyRef = React.useRef(false)
  const loadMore = React.useCallback(async () => {
    if (loadMoreBusyRef.current || !hasMore) return
    loadMoreBusyRef.current = true
    setLoadingMore(true)
    setError(null)
    try {
      const supabase = createSupabaseBrowserClient()
      const db = supabase.schema("public")
      const from = rowsRef.current.length
      const { data, error: qErr } = await db
        .from("items_catalog")
        .select(ITEMS_CATALOG_COLUMNS)
        .order("sku", { ascending: true })
        .range(from, from + CATALOG_PAGE_SIZE - 1)
      if (qErr) throw qErr
      const batch = (data as MarkerOfekItemsCatalogRow[]) ?? []
      setRows((p) => [...p, ...batch])
      setHasMore(batch.length === CATALOG_PAGE_SIZE)
    } catch (e) {
      setError(formatError(e))
    } finally {
      loadMoreBusyRef.current = false
      setLoadingMore(false)
    }
  }, [hasMore])

  React.useEffect(() => {
    void loadFirstPage()
  }, [loadFirstPage])

  React.useEffect(() => {
    if (!selectedItemId && rows.length > 0) {
      setSelectedItemId(rows[0]!.id)
    }
  }, [rows, selectedItemId])

  React.useEffect(() => {
    if (!selectedItemId) {
      setHistoryRows([])
      return
    }
    let cancelled = false
    void (async () => {
      setLoadingHistory(true)
      try {
        const supabase = createSupabaseBrowserClient()
        const db = supabase.schema("public")
        const { data, error: qErr } = await db
          .from("supplier_items")
          .select(
            "id, supplier_sku, unit_price, discount_pct, last_updated, entities ( name )"
          )
          .eq("master_item_id", selectedItemId)
          .order("unit_price", { ascending: true })
          .limit(120)
        if (qErr) throw qErr
        if (!cancelled) {
          setHistoryRows((data ?? []) as SupplierPriceHistoryRow[])
        }
      } catch {
        if (!cancelled) setHistoryRows([])
      } finally {
        if (!cancelled) setLoadingHistory(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [selectedItemId])

  async function handleAddItem(e: React.FormEvent) {
    e.preventDefault()
    const sku = form.sku.trim()
    const description = form.description.trim()
    const cat = form.category.trim()
    if (!sku || !description) {
      toast.error("מק״ט מאסטר ותיאור פנימי הם שדות חובה")
      return
    }
    if (!cat) {
      toast.error("קטגוריה חובה — ללא קטגוריה לא נשמר פריט בקטלוג")
      return
    }
    const defaultPriceRaw = form.default_price.trim().replace(",", ".")
    const defaultPrice =
      defaultPriceRaw === "" ? null : parseFloat(defaultPriceRaw)
    if (defaultPriceRaw !== "" && !Number.isFinite(defaultPrice)) {
      toast.error("מחיר ברירת מחדל אינו מספר תקין")
      return
    }

    setSaving(true)
    try {
      const supabase = createSupabaseBrowserClient()
      const db = supabase.schema("public")
      const { data, error: insErr } = await db
        .from("items_catalog")
        .insert({
          sku,
          description,
          unit: form.unit.trim() || null,
          category: cat,
          default_price: defaultPrice,
          is_inventory: form.is_inventory,
        })
        .select("id")
        .single()
      if (insErr) throw insErr
      toast.success("הפריט נוסף לקטלוג")
      setDialogOpen(false)
      setForm({
        sku: "",
        description: "",
        unit: "",
        category: "",
        default_price: "",
        is_inventory: false,
      })
      await loadFirstPage()
      if (data?.id) router.push(`/marker-ofek/items/${data.id}`)
    } catch (err) {
      toast.error(formatError(err) || "שמירת הפריט נכשלה")
    } finally {
      setSaving(false)
    }
  }

  const filteredRows = React.useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return rows
    return rows.filter((r) => {
      const text = `${r.sku} ${r.description} ${r.category ?? ""}`.toLowerCase()
      return text.includes(q)
    })
  }, [rows, searchQuery])

  const selectedItem = React.useMemo(
    () => rows.find((r) => r.id === selectedItemId) ?? null,
    [rows, selectedItemId]
  )

  const cheapestNet = React.useMemo(() => {
    if (historyRows.length === 0) return null
    let min = Infinity
    for (const r of historyRows) {
      const n = netUnitPrice(r.unit_price, r.discount_pct)
      if (n < min) min = n
    }
    return Number.isFinite(min) ? min : null
  }, [historyRows])

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 pb-12">
      <Link
        href="/marker-ofek"
        className="inline-flex w-fit items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowRight className="size-4 rotate-180" aria-hidden />
        חזרה ללוח מרקר אופק
      </Link>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">
            קטלוג פריטים
          </h1>
          <p className="text-sm text-muted-foreground">
            מק״טים פנימיים (מאסטר) לרכש ולניהול ספקים.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
        <Button className="gap-2" render={<Link href="/marker-ofek/items/new" />}>
          <Plus className="size-4" aria-hidden />
          טופס מלא (קטגוריה חובה)
        </Button>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger
            type="button"
            className={cn(buttonVariants({ variant: "outline" }), "gap-2 shrink-0")}
          >
            <Plus className="size-4" aria-hidden />
            הוספת מק״ט פנימי
          </DialogTrigger>
          <DialogContent className="max-w-md" dir="rtl">
            <form onSubmit={(e) => void handleAddItem(e)}>
              <DialogHeader>
                <DialogTitle>פריט חדש בקטלוג</DialogTitle>
                <DialogDescription>
                  מק״ט ייחודי ותיאור פנימי — ישמשו בבחירת פריט בהזמנות רכש.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="new-sku">מק״ט מאסטר</Label>
                  <Input
                    id="new-sku"
                    value={form.sku}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, sku: e.target.value }))
                    }
                    placeholder="למשל MO-CEM-001"
                    dir="ltr"
                    className="font-mono"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="new-desc">תיאור פנימי</Label>
                  <Input
                    id="new-desc"
                    value={form.description}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, description: e.target.value }))
                    }
                    placeholder="תיאור לשימוש ארגוני"
                    required
                  />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="new-unit">יחידת מידה</Label>
                    <Input
                      id="new-unit"
                      value={form.unit}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, unit: e.target.value }))
                      }
                      placeholder="מ״ק, יח׳, ק״ג…"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="new-cat">קטגוריה (חובה)</Label>
                    <Input
                      id="new-cat"
                      value={form.category}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, category: e.target.value }))
                      }
                      placeholder="למשל: חומרי גמר"
                      required
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="new-price">מחיר ברירת מחדל (₪)</Label>
                  <Input
                    id="new-price"
                    type="text"
                    inputMode="decimal"
                    value={form.default_price}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, default_price: e.target.value }))
                    }
                    placeholder="ריק אם אין"
                  />
                </div>
                <label className="flex cursor-pointer items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form.is_inventory}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, is_inventory: e.target.checked }))
                    }
                    className="size-4 rounded border-input"
                  />
                  פריט מלאי
                </label>
              </div>
              <DialogFooter className="gap-2 sm:gap-0">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setDialogOpen(false)}
                  disabled={saving}
                >
                  ביטול
                </Button>
                <Button type="submit" disabled={saving} className="gap-2">
                  {saving ? (
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                  ) : null}
                  שמירה
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
        </div>
      </div>

      {error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : null}

      <Card className="border-border/70 shadow-sm">
        <CardHeader className="border-b border-border/60 pb-4">
          <div className="flex items-start gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-cyan-500/15 text-cyan-700 dark:text-cyan-400">
              <Package className="size-5" aria-hidden />
            </div>
            <div className="space-y-1">
              <CardTitle>רשימת פריטים</CardTitle>
              <CardDescription>
                לחצו על שורה לפתיחת כרטיס מאסטר וניהול ספקים.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-6">
          {loading ? (
            <div className="flex items-center gap-2 py-10 text-muted-foreground">
              <Loader2 className="size-5 animate-spin" aria-hidden />
              טוען קטלוג…
            </div>
          ) : rows.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              לא נמצאו פריטים בקטלוג. הוסיפו מק״ט פנימי חדש.
            </p>
          ) : (
            <div className="space-y-4">
              <div className="max-w-md">
                <Input
                  placeholder="חיפוש פריט לפי מק״ט / תיאור / קטגוריה"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              <div className="overflow-x-auto rounded-lg border border-border/60">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-start">מק״ט מאסטר</TableHead>
                      <TableHead className="text-start">תיאור פנימי</TableHead>
                      <TableHead className="text-start">יחידה</TableHead>
                      <TableHead className="text-start">מחיר ברירת מחדל</TableHead>
                      <TableHead className="text-start">מלאי</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredRows.map((r) => (
                      <TableRow
                        key={r.id}
                        className={cn(
                          "cursor-pointer hover:bg-muted/40",
                          selectedItemId === r.id && "bg-primary/5"
                        )}
                        onClick={() => setSelectedItemId(r.id)}
                      >
                        <TableCell className="font-mono text-sm">
                          <Link
                            href={`/marker-ofek/items/${r.id}`}
                            className="text-primary underline-offset-4 hover:underline"
                          >
                            {r.sku}
                          </Link>
                        </TableCell>
                        <TableCell>{r.description}</TableCell>
                        <TableCell>{r.unit?.trim() || "—"}</TableCell>
                        <TableCell className="tabular-nums">
                          {r.default_price != null
                            ? currencyFormatter.format(Number(r.default_price))
                            : "—"}
                        </TableCell>
                        <TableCell>{r.is_inventory ? "כן" : "לא"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              {filteredRows.length === 0 ? (
                <p className="text-center text-sm text-muted-foreground">לא נמצאו פריטים</p>
              ) : null}
              {hasMore ? (
                <div className="flex justify-center">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={loadingMore}
                    onClick={() => void loadMore()}
                    className="gap-2"
                  >
                    {loadingMore ? (
                      <Loader2 className="size-4 animate-spin" aria-hidden />
                    ) : null}
                    טען עוד ({CATALOG_PAGE_SIZE})
                  </Button>
                </div>
              ) : (
                <p className="text-center text-xs text-muted-foreground">
                  מוצגים {filteredRows.length} מתוך {rows.length} · סוף הקטלוג
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-border/70 shadow-sm">
        <CardHeader className="border-b border-border/60 pb-4">
          <div className="flex items-start gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-700 dark:text-emerald-400">
              <TrendingDown className="size-5" aria-hidden />
            </div>
            <div className="space-y-1">
              <CardTitle>Price History & Supplier Comparison</CardTitle>
              <CardDescription>
                Child: היסטוריית מחירים לפריט הנבחר והדגשת המחיר הנמוך.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-6">
          {!selectedItem ? (
            <p className="text-sm text-muted-foreground">בחרו פריט מהרשימה העליונה.</p>
          ) : loadingHistory ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" aria-hidden />
              טוען היסטוריית מחירים…
            </div>
          ) : historyRows.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              אין היסטוריית ספקים לפריט {selectedItem.sku}.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-border/60">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-start">ספק</TableHead>
                    <TableHead className="text-start">מק״ט ספק</TableHead>
                    <TableHead className="text-start">מחיר</TableHead>
                    <TableHead className="text-start">הנחה</TableHead>
                    <TableHead className="text-start">מחיר נטו</TableHead>
                    <TableHead className="text-start">תאריך</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {historyRows.map((h) => {
                    const net = netUnitPrice(h.unit_price, h.discount_pct)
                    const isLowest =
                      cheapestNet != null && Math.abs(net - cheapestNet) < 0.005
                    const supplierName = embedOne(h.entities)?.name ?? "—"
                    return (
                      <TableRow key={h.id} className={cn(isLowest && "bg-emerald-500/10")}>
                        <TableCell>
                          {supplierName}
                          {isLowest ? (
                            <Badge className="ms-2 bg-emerald-600 text-white hover:bg-emerald-600">
                              הזול ביותר
                            </Badge>
                          ) : null}
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {h.supplier_sku?.trim() || "—"}
                        </TableCell>
                        <TableCell className="tabular-nums">
                          {currencyFormatter.format(Number(h.unit_price) || 0)}
                        </TableCell>
                        <TableCell className="tabular-nums">{Number(h.discount_pct) || 0}%</TableCell>
                        <TableCell className="font-semibold tabular-nums">
                          {currencyFormatter.format(net)}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {h.last_updated
                            ? new Date(h.last_updated).toLocaleDateString("he-IL")
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
