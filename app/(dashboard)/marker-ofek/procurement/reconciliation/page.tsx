"use client"

import Link from "next/link"
import * as React from "react"
import { ArrowRight, Loader2, ShieldCheck } from "lucide-react"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { createSupabaseBrowserClient } from "@/lib/supabase/browser"
import { formatError } from "@/lib/format-error"

type MonthlyRow = {
  month: string
  invoicesTotal: number
  poTotal: number
  deliveryTotal: number
}

const currency = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

function monthKeyFromDate(value: string | null | undefined): string {
  const d = value ? new Date(value) : new Date()
  if (Number.isNaN(d.getTime())) return ""
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
}

function sumByMonth(
  map: Map<string, MonthlyRow>,
  month: string,
  field: "invoicesTotal" | "poTotal" | "deliveryTotal",
  amount: number
) {
  const row = map.get(month) ?? { month, invoicesTotal: 0, poTotal: 0, deliveryTotal: 0 }
  row[field] += amount
  map.set(month, row)
}

export default function ProcurementReconciliationPage() {
  const [rows, setRows] = React.useState<MonthlyRow[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [monthFilter, setMonthFilter] = React.useState<string>("all")

  React.useEffect(() => {
    let cancelled = false
    void (async () => {
      setLoading(true)
      setError(null)
      try {
        const supabase = createSupabaseBrowserClient()
        const [invRes, poRes, grRes] = await Promise.all([
          supabase
            .from("supplier_invoices")
            .select("id, invoice_date, total_amount")
            .order("invoice_date", { ascending: false })
            .limit(1500),
          supabase
            .from("purchase_orders")
            .select("id, order_date, total_amount")
            .eq("is_deleted", false)
            .order("order_date", { ascending: false })
            .limit(1500),
          supabase
            .from("goods_receipts")
            .select("id, receipt_date")
            .order("receipt_date", { ascending: false })
            .limit(2000),
        ])
        if (invRes.error) throw invRes.error
        if (poRes.error) throw poRes.error
        if (grRes.error) throw grRes.error

        const receiptIds = (grRes.data ?? []).map((r) => (r as { id: string }).id)
        const [grItemsRes, poLineRes] = await Promise.all([
          receiptIds.length
            ? supabase
                .from("goods_receipt_items")
                .select("goods_receipt_id, po_line_item_id, quantity_received")
                .in("goods_receipt_id", receiptIds)
                .limit(8000)
            : Promise.resolve({ data: [], error: null }),
          supabase.from("po_line_items").select("id, unit_price").limit(8000),
        ])
        if (grItemsRes.error) throw grItemsRes.error
        if (poLineRes.error) throw poLineRes.error

        const receiptMonth = new Map<string, string>()
        for (const rec of grRes.data ?? []) {
          const row = rec as { id: string; receipt_date: string | null }
          receiptMonth.set(row.id, monthKeyFromDate(row.receipt_date))
        }
        const poLinePrice = new Map<string, number>()
        for (const line of poLineRes.data ?? []) {
          const row = line as { id: string; unit_price: number | null }
          poLinePrice.set(row.id, Number(row.unit_price) || 0)
        }

        const byMonth = new Map<string, MonthlyRow>()
        for (const inv of invRes.data ?? []) {
          const row = inv as { invoice_date: string | null; total_amount: number | null }
          const month = monthKeyFromDate(row.invoice_date)
          if (!month) continue
          sumByMonth(byMonth, month, "invoicesTotal", Number(row.total_amount) || 0)
        }
        for (const po of poRes.data ?? []) {
          const row = po as { order_date: string | null; total_amount: number | null }
          const month = monthKeyFromDate(row.order_date)
          if (!month) continue
          sumByMonth(byMonth, month, "poTotal", Number(row.total_amount) || 0)
        }
        for (const gri of grItemsRes.data ?? []) {
          const row = gri as {
            goods_receipt_id: string
            po_line_item_id: string
            quantity_received: number | null
          }
          const month = receiptMonth.get(row.goods_receipt_id) ?? ""
          if (!month) continue
          const qty = Number(row.quantity_received) || 0
          const price = poLinePrice.get(row.po_line_item_id) ?? 0
          sumByMonth(byMonth, month, "deliveryTotal", qty * price)
        }

        const list = [...byMonth.values()].sort((a, b) => b.month.localeCompare(a.month))
        if (!cancelled) {
          setRows(list)
          if (list.length > 0) setMonthFilter((m) => (m === "all" ? list[0]!.month : m))
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

  const visibleRows = React.useMemo(
    () => (monthFilter === "all" ? rows : rows.filter((r) => r.month === monthFilter)),
    [rows, monthFilter]
  )

  return (
    <div dir="rtl" className="mx-auto flex w-full max-w-6xl flex-col gap-6 pb-12">
      <Link
        href="/marker-ofek/procurement"
        className="inline-flex w-fit items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowRight className="size-4 rotate-180" aria-hidden />
        חזרה לניהול רכש
      </Link>

      <Card className="border-border/70 shadow-sm">
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2 text-lg">
              <ShieldCheck className="size-5 text-cyan-600" aria-hidden />
              טבלת התאמות וביקורת
            </CardTitle>
            <CardDescription>
              השוואת חשבוניות ספק מול הזמנות רכש וקבלות סחורה.
            </CardDescription>
          </div>
          <div className="w-full max-w-[220px] space-y-1">
            <p className="text-xs text-muted-foreground">סינון חודש</p>
            <Select value={monthFilter} onValueChange={(v) => setMonthFilter(v ?? "all")}>
              <SelectTrigger>
                <SelectValue placeholder="כל החודשים" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">כל החודשים</SelectItem>
                {rows.map((r) => (
                  <SelectItem key={r.month} value={r.month}>
                    {r.month}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" aria-hidden />
              טוען טבלת התאמות…
            </div>
          ) : error ? (
            <p className="text-sm text-destructive">{error}</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-border/60">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-start">חודש</TableHead>
                    <TableHead className="text-start">סה״כ חשבוניות</TableHead>
                    <TableHead className="text-start">סה״כ הזמנות רכש</TableHead>
                    <TableHead className="text-start">סה״כ תעודות משלוח</TableHead>
                    <TableHead className="text-start">פער חשבוניות-הזמנות רכש</TableHead>
                    <TableHead className="text-start">פער חשבוניות-משלוחים</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleRows.map((r) => {
                    const invPo = r.invoicesTotal - r.poTotal
                    const invDn = r.invoicesTotal - r.deliveryTotal
                    return (
                      <TableRow key={r.month}>
                        <TableCell className="font-mono">{r.month}</TableCell>
                        <TableCell className="tabular-nums">{currency.format(r.invoicesTotal)}</TableCell>
                        <TableCell className="tabular-nums">{currency.format(r.poTotal)}</TableCell>
                        <TableCell className="tabular-nums">{currency.format(r.deliveryTotal)}</TableCell>
                        <TableCell className="tabular-nums">{currency.format(invPo)}</TableCell>
                        <TableCell className="tabular-nums">{currency.format(invDn)}</TableCell>
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
