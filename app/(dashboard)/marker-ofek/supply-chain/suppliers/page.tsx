"use client"

import Link from "next/link"
import { useSearchParams } from "next/navigation"
import * as React from "react"
import {
  ArrowRight,
  Building2,
  Loader2,
  Phone,
  Scale,
  ShoppingCart,
  Tag,
} from "lucide-react"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { SupplierNameLink } from "@/components/marker-ofek/supplier-name-link"
import { createSupabaseBrowserClient } from "@/lib/supabase/browser"
import { formatError } from "@/lib/format-error"
import { cn } from "@/lib/utils"
import {
  normalizeSupplierSummaryRows,
  type SupplierSummary,
} from "@/lib/marker-ofek/supplier-summary"

type PurchaseOrderRow = {
  id: string
  supplier_id: string
  po_number: string
  status: string
  order_date: string
  total_amount: number
}

type SupplierPriceRow = {
  id: string
  supplier_sku: string | null
  unit_price: number
  discount_pct: number
  last_updated: string
  items_catalog:
    | { sku: string; description: string; unit: string | null }
    | { sku: string; description: string; unit: string | null }[]
    | null
}

type SupplierInvoiceRow = {
  id: string
  supplier_id: string
  po_id: string | null
  invoice_number: string
  total_amount: number
  status: string
  invoice_date: string
}

type SupplierInvoiceItemRow = {
  invoice_id: string
  unit_price: number
}

type SupplierItemHistoryRow = {
  import_id: string
  normalized_name: string | null
  unit_price: number | null
  quantity: number | null
  line_total: number | null
  created_at: string | null
}

function avg(nums: number[]): number | null {
  if (nums.length === 0) return null
  const s = nums.reduce((a, b) => a + b, 0)
  return Math.round((s / nums.length) * 100) / 100
}

function embedOne<T>(x: T | T[] | null | undefined): T | null {
  if (x == null) return null
  return Array.isArray(x) ? (x[0] ?? null) : x
}

export default function SupplyChainSuppliersPage() {
  const searchParams = useSearchParams()
  const requestedSupplier = searchParams.get("supplier")?.trim().toLowerCase() ?? ""
  const [suppliers, setSuppliers] = React.useState<SupplierSummary[]>([])
  const [poRows, setPoRows] = React.useState<PurchaseOrderRow[]>([])
  const [selectedSupplierId, setSelectedSupplierId] = React.useState("")
  const [searchQuery, setSearchQuery] = React.useState("")
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [priceRows, setPriceRows] = React.useState<SupplierPriceRow[]>([])
  const [invoiceRows, setInvoiceRows] = React.useState<SupplierInvoiceRow[]>([])
  const [invoiceItemRows, setInvoiceItemRows] = React.useState<SupplierInvoiceItemRow[]>(
    []
  )
  const [selectedPriceRowId, setSelectedPriceRowId] = React.useState("")
  const [itemHistoryRows, setItemHistoryRows] = React.useState<SupplierItemHistoryRow[]>([])
  const [loadingHistory, setLoadingHistory] = React.useState(false)
  const [loadingDetail, setLoadingDetail] = React.useState(false)

  const currencyFormatter = React.useMemo(
    () =>
      new Intl.NumberFormat("he-IL", {
        style: "currency",
        currency: "ILS",
        minimumFractionDigits: 2,
      }),
    []
  )

  React.useEffect(() => {
    let cancelled = false
    void (async () => {
      setLoading(true)
      setError(null)
      try {
        const supabase = createSupabaseBrowserClient()
        const [summaryRes, poRes] = await Promise.all([
          supabase.from("supplier_summaries").select("*").order("supplier_name", {
            ascending: true,
          }),
          supabase
            .from("purchase_orders")
            .select("id, supplier_id, po_number, status, order_date, total_amount")
            .eq("is_deleted", false)
            .order("created_at", { ascending: false })
            .limit(1200),
        ])
        if (poRes.error) throw poRes.error
        if (cancelled) return
        let nextSuppliers = !summaryRes.error && summaryRes.data
          ? normalizeSupplierSummaryRows(summaryRes.data as unknown[])
          : []
        if (nextSuppliers.length === 0) {
          const fallback = await supabase
            .from("entities")
            .select("id, name, legal_id, contact_info")
            .eq("type", "supplier")
            .eq("is_deleted", false)
            .order("name", { ascending: true })
          if (fallback.error) throw fallback.error
          nextSuppliers = (fallback.data ?? []).map((r: Record<string, unknown>) => {
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
        setSuppliers(nextSuppliers)
        setPoRows((poRes.data ?? []) as PurchaseOrderRow[])
        if (nextSuppliers.length > 0) {
          setSelectedSupplierId((prev) => {
            if (prev) return prev
            const requested = nextSuppliers.find(
              (s) => requestedSupplier && s.name.trim().toLowerCase() === requestedSupplier
            )
            return requested?.supplierId || nextSuppliers[0]!.supplierId || ""
          })
        }
      } catch (e) {
        if (!cancelled) setError(formatError(e))
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  React.useEffect(() => {
    if (!selectedSupplierId) {
      setPriceRows([])
      setInvoiceRows([])
      setInvoiceItemRows([])
      return
    }
    let cancelled = false
    void (async () => {
      setLoadingDetail(true)
      try {
        const supabase = createSupabaseBrowserClient()
        const [pricesRes, invoicesRes] = await Promise.all([
          supabase
            .from("supplier_items")
            .select(
              "id, supplier_sku, unit_price, discount_pct, last_updated, items_catalog ( sku, description, unit )"
            )
            .eq("supplier_id", selectedSupplierId)
            .order("last_updated", { ascending: false }),
          supabase
            .from("supplier_invoices")
            .select("id, supplier_id, po_id, invoice_number, total_amount, status, invoice_date")
            .eq("supplier_id", selectedSupplierId)
            .order("invoice_date", { ascending: false })
            .limit(500),
        ])
        if (pricesRes.error) throw pricesRes.error
        if (invoicesRes.error) throw invoicesRes.error
        const invRows = (invoicesRes.data ?? []) as SupplierInvoiceRow[]
        let invItemRows: SupplierInvoiceItemRow[] = []
        const invIds = invRows.map((x) => x.id)
        if (invIds.length > 0) {
          const itemsRes = await supabase
            .from("supplier_invoice_items")
            .select("invoice_id, unit_price")
            .in("invoice_id", invIds)
            .limit(4000)
          if (!itemsRes.error && itemsRes.data) {
            invItemRows = itemsRes.data as SupplierInvoiceItemRow[]
          }
        }
        if (cancelled) return
        const nextPriceRows = (pricesRes.data ?? []) as SupplierPriceRow[]
        setPriceRows(nextPriceRows)
        setSelectedPriceRowId((prev) => prev || nextPriceRows[0]?.id || "")
        setInvoiceRows(invRows)
        setInvoiceItemRows(invItemRows)
      } catch {
        if (!cancelled) {
          setPriceRows([])
          setSelectedPriceRowId("")
          setInvoiceRows([])
          setInvoiceItemRows([])
        }
      } finally {
        if (!cancelled) setLoadingDetail(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [selectedSupplierId])

  const filteredSuppliers = React.useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return suppliers
    return suppliers.filter((s) => {
      const text = `${s.name} ${s.legalId ?? ""} ${s.contactPhone ?? ""} ${s.contactEmail ?? ""}`.toLowerCase()
      return text.includes(q)
    })
  }, [suppliers, searchQuery])

  const selectedSupplier = React.useMemo(
    () => suppliers.find((s) => s.supplierId === selectedSupplierId) ?? null,
    [suppliers, selectedSupplierId]
  )
  const selectedPriceRow = React.useMemo(
    () => priceRows.find((r) => r.id === selectedPriceRowId) ?? null,
    [priceRows, selectedPriceRowId]
  )
  const selectedPriceItem = React.useMemo(
    () => embedOne(selectedPriceRow?.items_catalog ?? null),
    [selectedPriceRow]
  )

  React.useEffect(() => {
    if (!selectedSupplier?.name || !selectedPriceItem?.description) {
      setItemHistoryRows([])
      return
    }
    let cancelled = false
    void (async () => {
      setLoadingHistory(true)
      try {
        const supabase = createSupabaseBrowserClient()
        const importsRes = await supabase
          .from("mo_supplier_invoice_imports")
          .select("id")
          .ilike("supplier_name", selectedSupplier.name)
          .order("created_at", { ascending: false })
          .limit(300)
        if (importsRes.error) throw importsRes.error
        const importIds = (importsRes.data ?? []).map((r: { id: string }) => r.id)
        if (importIds.length === 0) {
          if (!cancelled) setItemHistoryRows([])
          return
        }
        const historyRes = await supabase
          .from("mo_supplier_invoice_import_lines")
          .select("import_id, normalized_name, unit_price, quantity, line_total, created_at")
          .in("import_id", importIds)
          .ilike("normalized_name", selectedPriceItem.description)
          .order("created_at", { ascending: false })
          .limit(120)
        if (historyRes.error) throw historyRes.error
        if (!cancelled) {
          setItemHistoryRows((historyRes.data ?? []) as SupplierItemHistoryRow[])
        }
      } catch {
        if (!cancelled) setItemHistoryRows([])
      } finally {
        if (!cancelled) setLoadingHistory(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [selectedSupplier?.name, selectedPriceItem?.description])

  const negotiatedAvg = React.useMemo(
    () => avg(priceRows.map((x) => Number(x.unit_price) || 0).filter((x) => x > 0)),
    [priceRows]
  )
  const invoiceAvg = React.useMemo(
    () => avg(invoiceItemRows.map((x) => Number(x.unit_price) || 0).filter((x) => x > 0)),
    [invoiceItemRows]
  )
  const deviationPct = React.useMemo(() => {
    if (negotiatedAvg == null || negotiatedAvg <= 0 || invoiceAvg == null) return null
    return Math.round(((invoiceAvg - negotiatedAvg) / negotiatedAvg) * 10000) / 100
  }, [negotiatedAvg, invoiceAvg])

  return (
    <div dir="rtl" className="mx-auto flex w-full max-w-7xl flex-col gap-6 pb-12">
      <Link
        href="/marker-ofek/procurement"
        className="inline-flex w-fit items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowRight className="size-4 rotate-180" aria-hidden />
        חזרה לשרשרת אספקה ורכש
      </Link>

      <div className="grid gap-4 lg:grid-cols-[420px_minmax(0,1fr)]">
        <Card className="border-border/70 shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Building2 className="size-5" aria-hidden />
              מסך ספקים (Parent)
            </CardTitle>
            <CardDescription>
              חיפוש ספקים + מדדים: סה״כ רכש, הזמנות פעילות ופרטי קשר.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Input
              placeholder="חיפוש ספק לפי שם / ח.פ / טלפון"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {loading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" aria-hidden />
                טוען ספקים…
              </div>
            ) : error ? (
              <p className="text-sm text-destructive">{error}</p>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-border/60">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-start">ספק</TableHead>
                      <TableHead className="text-start">סה״כ רכש</TableHead>
                      <TableHead className="text-start">הזמנות פעילות</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredSuppliers.map((s) => {
                      return (
                        <TableRow
                          key={s.supplierId ?? s.name}
                          className={`cursor-pointer hover:bg-muted/40 ${
                            selectedSupplierId === s.supplierId ? "bg-primary/5" : ""
                          }`}
                          onClick={() => setSelectedSupplierId(s.supplierId ?? "")}
                        >
                          <TableCell>
                            <SupplierNameLink
                              supplierId={s.supplierId}
                              supplierName={s.name}
                              className="font-medium"
                            />
                            <p className="text-xs text-muted-foreground">{s.legalId || "—"}</p>
                          </TableCell>
                          <TableCell className="tabular-nums">
                            {currencyFormatter.format(s.totalVolume2025)}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">{s.activePos}</Badge>
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

        <Card className="border-border/70 shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg">פרטי ספק</CardTitle>
            <CardDescription>
              מחירון ספק, היסטוריית הזמנות/חשבוניות וניתוח סטיות מול מחירי PO.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!selectedSupplier ? (
              <p className="text-sm text-muted-foreground">בחרו ספק מהרשימה משמאל.</p>
            ) : (
              <div className="space-y-4">
                <div className="grid gap-3 rounded-lg border border-border/60 bg-muted/20 p-3 md:grid-cols-3">
                  <p className="inline-flex items-center gap-2 text-sm">
                    <Building2 className="size-4 text-muted-foreground" aria-hidden />
                    {selectedSupplier.name}
                  </p>
                  <p className="inline-flex items-center gap-2 text-sm">
                    <Tag className="size-4 text-muted-foreground" aria-hidden />
                    {selectedSupplier.legalId || "—"}
                  </p>
                  <p className="inline-flex items-center gap-2 text-sm text-muted-foreground">
                    <Phone className="size-4" aria-hidden />
                    {selectedSupplier.contactPhone || "—"}
                  </p>
                </div>

                <div className="space-y-4">
                  <section className="rounded-lg border border-border/60 bg-muted/20 p-3">
                    <p className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground">
                      CHILD · מחירון ספק
                    </p>
                    {loadingDetail ? (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Loader2 className="size-4 animate-spin" aria-hidden />
                        טוען מחירון ספק…
                      </div>
                    ) : priceRows.length === 0 ? (
                      <p className="text-sm text-muted-foreground">אין נתוני מחירון לספק זה.</p>
                    ) : (
                      <div className="overflow-x-auto rounded-lg border border-border/60 bg-background">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="text-start">מק״ט פנימי</TableHead>
                              <TableHead className="text-start">תיאור</TableHead>
                              <TableHead className="text-start">מק״ט ספק</TableHead>
                              <TableHead className="text-start">מחיר אחרון</TableHead>
                              <TableHead className="text-start">עודכן</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {priceRows.map((r) => {
                              const item = embedOne(r.items_catalog)
                              return (
                                <TableRow
                                  key={r.id}
                                  onClick={() => setSelectedPriceRowId(r.id)}
                                  className={cn(
                                    "cursor-pointer hover:bg-muted/40",
                                    selectedPriceRowId === r.id && "bg-primary/5"
                                  )}
                                >
                                  <TableCell className="font-mono text-xs">
                                    {item?.sku ?? "—"}
                                  </TableCell>
                                  <TableCell>{item?.description ?? "—"}</TableCell>
                                  <TableCell className="font-mono text-xs">
                                    {r.supplier_sku?.trim() || "—"}
                                  </TableCell>
                                  <TableCell className="tabular-nums">
                                    {currencyFormatter.format(Number(r.unit_price) || 0)}
                                  </TableCell>
                                  <TableCell className="text-xs text-muted-foreground">
                                    {r.last_updated
                                      ? new Date(r.last_updated).toLocaleDateString("he-IL")
                                      : "—"}
                                  </TableCell>
                                </TableRow>
                              )
                            })}
                          </TableBody>
                        </Table>
                      </div>
                    )}
                  </section>

                  <section className="rounded-lg border border-border/60 bg-muted/10 p-3">
                    <p className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground">
                      GRANDCHILD · היסטוריית מחירים ולוגים לפריט נבחר
                    </p>
                    {!selectedPriceItem ? (
                      <p className="text-sm text-muted-foreground">בחרו פריט מהטבלה העליונה.</p>
                    ) : loadingHistory ? (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Loader2 className="size-4 animate-spin" aria-hidden />
                        טוען היסטוריית פריט…
                      </div>
                    ) : itemHistoryRows.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        לא נמצאה היסטוריית לוגים לפריט זה במסמכי קליטה.
                      </p>
                    ) : (
                      <div className="overflow-x-auto rounded-lg border border-border/60 bg-background">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="text-start">תאריך</TableHead>
                              <TableHead className="text-start">שם מזוהה</TableHead>
                              <TableHead className="text-start">כמות</TableHead>
                              <TableHead className="text-start">מחיר יח׳</TableHead>
                              <TableHead className="text-start">סה״כ</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {itemHistoryRows.map((h, idx) => (
                              <TableRow key={`${h.import_id}-${idx}`}>
                                <TableCell className="text-xs text-muted-foreground">
                                  {h.created_at
                                    ? new Date(h.created_at).toLocaleDateString("he-IL")
                                    : "—"}
                                </TableCell>
                                <TableCell>{h.normalized_name || "—"}</TableCell>
                                <TableCell className="tabular-nums">{h.quantity ?? "—"}</TableCell>
                                <TableCell className="tabular-nums">
                                  {h.unit_price != null
                                    ? currencyFormatter.format(h.unit_price)
                                    : "—"}
                                </TableCell>
                                <TableCell className="tabular-nums">
                                  {h.line_total != null
                                    ? currencyFormatter.format(h.line_total)
                                    : "—"}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    )}
                  </section>

                  <section className="rounded-lg border border-border/60 bg-muted/20 p-3">
                    <p className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground">
                      ניתוח סטיות ספק
                    </p>
                    <div className="grid gap-3 sm:grid-cols-3">
                      <Card>
                        <CardHeader className="pb-2">
                          <CardDescription>ממוצע מחיר מוסכם</CardDescription>
                          <CardTitle className="text-lg tabular-nums">
                            {negotiatedAvg != null ? currencyFormatter.format(negotiatedAvg) : "—"}
                          </CardTitle>
                        </CardHeader>
                      </Card>
                      <Card>
                        <CardHeader className="pb-2">
                          <CardDescription>ממוצע מחיר בפועל</CardDescription>
                          <CardTitle className="text-lg tabular-nums">
                            {invoiceAvg != null ? currencyFormatter.format(invoiceAvg) : "—"}
                          </CardTitle>
                        </CardHeader>
                      </Card>
                      <Card>
                        <CardHeader className="pb-2">
                          <CardDescription>סטייה ממוצעת</CardDescription>
                          <CardTitle
                            className={cn(
                              "text-lg tabular-nums",
                              deviationPct != null && deviationPct > 8
                                ? "text-red-600"
                                : deviationPct != null && deviationPct < 0
                                  ? "text-emerald-600"
                                  : ""
                            )}
                          >
                            {deviationPct != null ? `${deviationPct}%` : "—"}
                          </CardTitle>
                        </CardHeader>
                      </Card>
                    </div>
                  </section>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="inline-flex items-center gap-2 rounded-md border border-border/60 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
        <Scale className="size-3.5" aria-hidden />
        ניווט מהיר: חיפוש ספקים, מעבר טאבים, וטעינת היסטוריה בזמן אמת.
      </div>
    </div>
  )
}
