"use client"

import * as React from "react"
import { PanelRightOpen, Star, Truck } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { createSupabaseBrowserClient } from "@/lib/supabase/browser"
import {
  normalizeSupplierSummaryRows,
  type SupplierSummary,
} from "@/lib/marker-ofek/supplier-summary"
import { cn } from "@/lib/utils"

import { useMarkerOfekWorkspace } from "./marker-ofek-workspace-context"

type SupplierPriceRow = {
  id: string
  supplier_sku: string | null
  unit_price: number
  last_updated: string
  items_catalog:
    | { sku: string; description: string; unit: string | null }
    | { sku: string; description: string; unit: string | null }[]
    | null
}

type SupplierInvoiceItemRow = {
  invoice_id: string
  unit_price: number
}

type PoLinePrice = {
  po_id: string
  unit_price: number
}

type HistoryRow = {
  id: string
  kind: "po" | "invoice"
  docNo: string
  status: string
  date: string
  amount: number
}

function embedOne<T>(x: T | T[] | null | undefined): T | null {
  if (x == null) return null
  return Array.isArray(x) ? (x[0] ?? null) : x
}

function avg(values: number[]): number | null {
  if (values.length === 0) return null
  return values.reduce((a, b) => a + b, 0) / values.length
}

function SupplierDrawerSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-10 w-full rounded-md" />
      <div className="grid gap-3 rounded-lg border border-border/60 bg-muted/20 p-3">
        <Skeleton className="h-5 w-2/3" />
        <div className="grid gap-2 sm:grid-cols-3">
          <Skeleton className="h-14 rounded-md" />
          <Skeleton className="h-14 rounded-md" />
          <Skeleton className="h-14 rounded-md" />
        </div>
      </div>
      <Skeleton className="h-9 w-full rounded-md" />
      <Skeleton className="h-64 w-full rounded-md" />
    </div>
  )
}

const currency = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

function RatingStars({ rating }: { rating: number }) {
  const rounded = Math.max(0, Math.min(5, Math.round(rating)))
  return (
    <div className="inline-flex items-center gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          className={cn(
            "size-3.5",
            i < rounded ? "fill-amber-400 text-amber-400" : "text-muted-foreground/40"
          )}
          aria-hidden
        />
      ))}
    </div>
  )
}

export function MarkerOfekSupplierDrawerTrigger({ className }: { className?: string }) {
  const { openSupplierDrawer } = useMarkerOfekWorkspace()
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className={cn(
        "gap-2 border-emerald-500/30 bg-emerald-500/5 shadow-sm hover:bg-emerald-500/10",
        className
      )}
      onClick={() => openSupplierDrawer()}
    >
      <PanelRightOpen className="size-4" aria-hidden />
      מגירת ספק
    </Button>
  )
}

export function MarkerOfekSupplierDrawer() {
  const {
    supplierDrawerOpen,
    setSupplierDrawerOpen,
    contextSupplierId,
    contextSupplierName,
  } = useMarkerOfekWorkspace()

  const [supplierSummaries, setSupplierSummaries] = React.useState<SupplierSummary[]>([])
  const [selectedSupplierId, setSelectedSupplierId] = React.useState("")
  const [loading, setLoading] = React.useState(false)
  const [loadingDetail, setLoadingDetail] = React.useState(false)
  const [priceRows, setPriceRows] = React.useState<SupplierPriceRow[]>([])
  const [historyRows, setHistoryRows] = React.useState<HistoryRow[]>([])
  const [invoiceItems, setInvoiceItems] = React.useState<SupplierInvoiceItemRow[]>([])
  const [poUnitPrices, setPoUnitPrices] = React.useState<PoLinePrice[]>([])
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!supplierDrawerOpen) return
    let cancelled = false
    void (async () => {
      setLoading(true)
      setError(null)
      try {
        const supabase = createSupabaseBrowserClient()
        const view = await supabase
          .from("supplier_summaries")
          .select("*")
          .order("supplier_name", { ascending: true })
          .limit(500)

        let summaries: SupplierSummary[] = []
        if (!view.error && view.data) {
          summaries = normalizeSupplierSummaryRows(view.data as unknown[])
        } else {
          const fallback = await supabase
            .from("entities")
            .select("id, name, legal_id, contact_info")
            .eq("is_deleted", false)
            .in("type", ["supplier", "subcontractor"])
            .order("name", { ascending: true })
            .limit(500)
          if (fallback.error) throw fallback.error
          summaries = (fallback.data ?? []).map((r: Record<string, unknown>) => {
            const row = r as {
              id: string
              name: string
              legal_id: string | null
              contact_info: Record<string, unknown> | null
            }
            return {
              supplierId: row.id,
              name: row.name,
              legalId: row.legal_id ?? null,
              contactPhone: String(row.contact_info?.phone ?? "") || null,
              contactEmail: String(row.contact_info?.email ?? "") || null,
              rating: 0,
              totalVolume2025: 0,
              currentDebt: 0,
              activePos: 0,
            } satisfies SupplierSummary
          })
        }
        if (cancelled) return
        setSupplierSummaries(summaries)

        const byId = contextSupplierId?.trim()
        const byName = contextSupplierName?.trim().toLowerCase()
        const preferred =
          summaries.find((s) => byId && s.supplierId === byId) ??
          summaries.find((s) => byName && s.name.trim().toLowerCase() === byName) ??
          summaries[0] ??
          null
        setSelectedSupplierId(preferred?.supplierId ?? "")
      } catch (e) {
        if (!cancelled) {
          setSupplierSummaries([])
          setSelectedSupplierId("")
          setError(e instanceof Error ? e.message : "טעינת ספקים נכשלה")
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [supplierDrawerOpen, contextSupplierId, contextSupplierName])

  const selectedSummary = React.useMemo(
    () =>
      supplierSummaries.find((s) => s.supplierId === selectedSupplierId) ??
      supplierSummaries.find(
        (s) =>
          !selectedSupplierId &&
          contextSupplierName &&
          s.name.trim().toLowerCase() === contextSupplierName.trim().toLowerCase()
      ) ??
      null,
    [supplierSummaries, selectedSupplierId, contextSupplierName]
  )

  React.useEffect(() => {
    if (!supplierDrawerOpen || !selectedSummary?.supplierId) {
      setPriceRows([])
      setHistoryRows([])
      setInvoiceItems([])
      setPoUnitPrices([])
      return
    }
    let cancelled = false
    void (async () => {
      setLoadingDetail(true)
      try {
        const supabase = createSupabaseBrowserClient()
        const supplierId = selectedSummary.supplierId
        const [pricesRes, poRes, invRes] = await Promise.all([
          supabase
            .from("supplier_items")
            .select(
              "id, supplier_sku, unit_price, last_updated, items_catalog ( sku, description, unit )"
            )
            .eq("supplier_id", supplierId)
            .order("last_updated", { ascending: false })
            .limit(400),
          supabase
            .from("purchase_orders")
            .select("id, po_number, status, order_date, total_amount")
            .eq("supplier_id", supplierId)
            .eq("is_deleted", false)
            .order("created_at", { ascending: false })
            .limit(150),
          supabase
            .from("supplier_invoices")
            .select("id, invoice_number, status, invoice_date, total_amount")
            .eq("supplier_id", supplierId)
            .order("invoice_date", { ascending: false })
            .limit(150),
        ])
        if (pricesRes.error) throw pricesRes.error
        if (poRes.error) throw poRes.error
        if (invRes.error) throw invRes.error

        const poRows = (poRes.data ?? []) as Array<{
          id: string
          po_number: string
          status: string
          order_date: string
          total_amount: number
        }>
        const invoiceRows = (invRes.data ?? []) as Array<{
          id: string
          invoice_number: string
          status: string
          invoice_date: string
          total_amount: number
        }>

        const poIds = poRows.map((p) => p.id)
        const invoiceIds = invoiceRows.map((i) => i.id)
        const [poLinesRes, invoiceItemsRes] = await Promise.all([
          poIds.length
            ? supabase
                .from("po_line_items")
                .select("po_id, unit_price")
                .in("po_id", poIds)
                .limit(3000)
            : Promise.resolve({ data: [], error: null }),
          invoiceIds.length
            ? supabase
                .from("supplier_invoice_items")
                .select("invoice_id, unit_price")
                .in("invoice_id", invoiceIds)
                .limit(3000)
            : Promise.resolve({ data: [], error: null }),
        ])
        if (poLinesRes.error) throw poLinesRes.error
        if (invoiceItemsRes.error) throw invoiceItemsRes.error

        if (cancelled) return
        setPriceRows((pricesRes.data ?? []) as SupplierPriceRow[])
        setPoUnitPrices((poLinesRes.data ?? []) as PoLinePrice[])
        setInvoiceItems((invoiceItemsRes.data ?? []) as SupplierInvoiceItemRow[])
        setHistoryRows([
          ...poRows.map((p) => ({
            id: `po-${p.id}`,
            kind: "po" as const,
            docNo: p.po_number,
            status: p.status,
            date: p.order_date,
            amount: Number(p.total_amount) || 0,
          })),
          ...invoiceRows.map((i) => ({
            id: `inv-${i.id}`,
            kind: "invoice" as const,
            docNo: i.invoice_number || "—",
            status: i.status || "—",
            date: i.invoice_date,
            amount: Number(i.total_amount) || 0,
          })),
        ])
      } catch {
        if (!cancelled) {
          setPriceRows([])
          setHistoryRows([])
          setInvoiceItems([])
          setPoUnitPrices([])
        }
      } finally {
        if (!cancelled) setLoadingDetail(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [supplierDrawerOpen, selectedSummary?.supplierId])

  const poAvg = React.useMemo(
    () => avg(poUnitPrices.map((x) => Number(x.unit_price) || 0).filter((n) => n > 0)),
    [poUnitPrices]
  )
  const invAvg = React.useMemo(
    () => avg(invoiceItems.map((x) => Number(x.unit_price) || 0).filter((n) => n > 0)),
    [invoiceItems]
  )
  const deviationPct = React.useMemo(() => {
    if (poAvg == null || poAvg <= 0 || invAvg == null) return null
    return Math.round(((invAvg - poAvg) / poAvg) * 10000) / 100
  }, [poAvg, invAvg])

  return (
    <Sheet open={supplierDrawerOpen} onOpenChange={setSupplierDrawerOpen}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 border-border/70 bg-background/95 p-0 sm:max-w-xl"
        dir="rtl"
      >
        <SheetHeader className="border-b border-border/60 px-4 py-4 text-start">
          <SheetTitle className="flex items-center gap-2 text-base">
            <Truck className="size-5 text-emerald-500" aria-hidden />
            ספקים — מגירה גלובלית
          </SheetTitle>
          <SheetDescription className="text-start">
            דירוג, מחזור 2025, חוב נוכחי, מחירון והיסטוריית מסמכים.
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-4 py-4">
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">ספק</Label>
            <Select
              value={selectedSupplierId || undefined}
              onValueChange={(v) => setSelectedSupplierId(v ?? "")}
              disabled={loading || supplierSummaries.length === 0}
            >
              <SelectTrigger className="border-border/70">
                <SelectValue placeholder="בחרו ספק" />
              </SelectTrigger>
              <SelectContent diamondEntity="entities">
                {supplierSummaries
                  .filter((s) => !!s.supplierId)
                  .map((s) => (
                    <SelectItem key={s.supplierId!} value={s.supplierId!}>
                      {s.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>

          {error ? (
            <p className="rounded-md border border-destructive/40 bg-destructive/10 px-2 py-2 text-xs text-destructive">
              {error}
            </p>
          ) : null}

          {loading ? (
            <SupplierDrawerSkeleton />
          ) : !selectedSummary ? (
            <p className="text-sm text-muted-foreground">אין נתוני ספקים להצגה.</p>
          ) : (
            <>
              <div className="grid gap-3 rounded-lg border border-border/60 bg-muted/20 p-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-medium">{selectedSummary.name}</span>
                  <RatingStars rating={selectedSummary.rating} />
                </div>
                <div className="grid gap-2 sm:grid-cols-3">
                  <div className="rounded-md border border-border/60 bg-background px-2 py-1.5">
                    <p className="text-[11px] text-muted-foreground">מחזור 2025</p>
                    <p className="text-sm font-semibold tabular-nums">
                      {currency.format(selectedSummary.totalVolume2025)}
                    </p>
                  </div>
                  <div className="rounded-md border border-border/60 bg-background px-2 py-1.5">
                    <p className="text-[11px] text-muted-foreground">חוב נוכחי</p>
                    <p className="text-sm font-semibold tabular-nums text-amber-700">
                      {currency.format(selectedSummary.currentDebt)}
                    </p>
                  </div>
                  <div className="rounded-md border border-border/60 bg-background px-2 py-1.5">
                    <p className="text-[11px] text-muted-foreground">הזמנות פעילות</p>
                    <p className="text-sm font-semibold tabular-nums">
                      {selectedSummary.activePos}
                    </p>
                  </div>
                </div>
              </div>

              <Tabs defaultValue="price-list" dir="rtl">
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="price-list">מחירון ספק</TabsTrigger>
                  <TabsTrigger value="history">היסטוריית הזמנות/חשבוניות</TabsTrigger>
                  <TabsTrigger value="deviation">ניתוח סטיות</TabsTrigger>
                </TabsList>
                <TabsContent value="price-list" className="mt-3">
                  {loadingDetail ? (
                    <div className="space-y-2">
                      <Skeleton className="h-8 w-1/3 rounded-md" />
                      <Skeleton className="h-56 w-full rounded-md" />
                    </div>
                  ) : (
                    <div className="max-h-[280px] overflow-auto rounded-lg border border-border/60">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="text-start">מק״ט פנימי</TableHead>
                            <TableHead className="text-start">תיאור</TableHead>
                            <TableHead className="text-start">מק״ט ספק</TableHead>
                            <TableHead className="text-start">מחיר אחרון</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {priceRows.slice(0, 120).map((r) => {
                            const item = embedOne(r.items_catalog)
                            return (
                              <TableRow key={r.id}>
                                <TableCell className="font-mono text-xs">
                                  {item?.sku ?? "—"}
                                </TableCell>
                                <TableCell>{item?.description ?? "—"}</TableCell>
                                <TableCell className="font-mono text-xs">
                                  {r.supplier_sku || "—"}
                                </TableCell>
                                <TableCell className="tabular-nums">
                                  {currency.format(Number(r.unit_price) || 0)}
                                </TableCell>
                              </TableRow>
                            )
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </TabsContent>
                <TabsContent value="history" className="mt-3">
                  <div className="max-h-[320px] overflow-auto rounded-lg border border-border/60">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-start">סוג</TableHead>
                          <TableHead className="text-start">מסמך</TableHead>
                          <TableHead className="text-start">תאריך</TableHead>
                          <TableHead className="text-start">סטטוס</TableHead>
                          <TableHead className="text-start">סכום</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {historyRows.slice(0, 200).map((h) => (
                          <TableRow key={h.id}>
                            <TableCell>{h.kind === "po" ? "PO" : "חשבונית"}</TableCell>
                            <TableCell className="font-mono text-xs">{h.docNo}</TableCell>
                            <TableCell>{h.date || "—"}</TableCell>
                            <TableCell>{h.status || "—"}</TableCell>
                            <TableCell className="tabular-nums">
                              {currency.format(h.amount)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </TabsContent>
                <TabsContent value="deviation" className="mt-3 space-y-3">
                  <div className="grid gap-2 sm:grid-cols-3">
                    <div className="rounded-md border border-border/60 bg-muted/20 p-2">
                      <p className="text-[11px] text-muted-foreground">מחיר יח׳ ממוצע PO</p>
                      <p className="font-semibold tabular-nums">
                        {poAvg != null ? currency.format(poAvg) : "—"}
                      </p>
                    </div>
                    <div className="rounded-md border border-border/60 bg-muted/20 p-2">
                      <p className="text-[11px] text-muted-foreground">מחיר יח׳ ממוצע חשבוניות</p>
                      <p className="font-semibold tabular-nums">
                        {invAvg != null ? currency.format(invAvg) : "—"}
                      </p>
                    </div>
                    <div className="rounded-md border border-border/60 bg-muted/20 p-2">
                      <p className="text-[11px] text-muted-foreground">סטייה ממוצעת</p>
                      <p
                        className={cn(
                          "font-semibold tabular-nums",
                          deviationPct != null && deviationPct > 8 ? "text-red-600" : ""
                        )}
                      >
                        {deviationPct != null ? `${deviationPct}%` : "—"}
                      </p>
                    </div>
                  </div>
                </TabsContent>
              </Tabs>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
