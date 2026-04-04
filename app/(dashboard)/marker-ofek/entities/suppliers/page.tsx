"use client"

import Link from "next/link"
import * as React from "react"
import { ArrowRight, Loader2, Search } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
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
import { createSupabaseBrowserClient } from "@/lib/supabase/browser"
import { formatError } from "@/lib/utils"

type Row = {
  id: string
  name: string
  legal_id: string | null
  withholding_tax_expiry: string | null
  bookkeeping_auth_expiry: string | null
  default_withholding_tax_percent: number | null
}

function fmtDate(d: string | null): string {
  if (!d) return "—"
  const t = Date.parse(d.slice(0, 10) + "T12:00:00.000Z")
  if (!Number.isFinite(t)) return "—"
  return new Date(t).toLocaleDateString("he-IL")
}

function statusFor(expiry: string | null): "ok" | "bad" {
  if (!expiry) return "bad"
  const t = Date.parse(expiry.slice(0, 10) + "T12:00:00.000Z")
  if (!Number.isFinite(t)) return "bad"
  const end = new Date(t)
  end.setUTCHours(23, 59, 59, 999)
  return end >= new Date() ? "ok" : "bad"
}

export default function MarkerOfekSuppliersCompliancePage() {
  const [query, setQuery] = React.useState("")
  const [rows, setRows] = React.useState<Row[]>([])
  const [loading, setLoading] = React.useState(true)

  React.useEffect(() => {
    let cancelled = false
    void (async () => {
      setLoading(true)
      try {
        const supabase = createSupabaseBrowserClient()
        const { data, error } = await supabase
          .from("entities")
          .select(
            "id,name,legal_id,withholding_tax_expiry,bookkeeping_auth_expiry,default_withholding_tax_percent"
          )
          .eq("type", "supplier")
          .eq("is_deleted", false)
          .order("name", { ascending: true })
          .limit(1000)
        if (error) throw error
        if (!cancelled) setRows((data ?? []) as Row[])
      } catch (e) {
        if (!cancelled) {
          setRows([])
          toast.error(formatError(e))
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return rows
    return rows.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        (r.legal_id ?? "").toLowerCase().includes(q)
    )
  }, [rows, query])

  return (
    <div
      dir="rtl"
      lang="he"
      className="mx-auto flex w-full max-w-6xl flex-col gap-6 pb-12 pt-2"
    >
      <div className="flex flex-wrap items-center gap-3">
        <Link
          href="/marker-ofek/entities"
          className="inline-flex w-fit items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowRight className="size-4 rotate-180" aria-hidden />
          חזרה לישויות
        </Link>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">ספקים — תאימות מס</h1>
          <p className="text-sm text-muted-foreground">
            תאריכי תוקף לניכוי ולניהול ספרים, ואחוז ניכוי ברירת מחדל.
          </p>
        </div>
        <Button variant="outline" render={<Link href="/marker-ofek/procurement/purchase-orders/new" />}>
          הזמנת רכש חדשה
        </Button>
      </div>

      <Card>
        <CardHeader className="space-y-4">
          <div className="relative max-w-md">
            <Search className="pointer-events-none absolute end-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="חיפוש ספק או ח.פ…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pe-10"
              dir="rtl"
            />
          </div>
          <CardDescription>
            עדכון שדות בזרימת &quot;ספק חדש&quot; בהזמנת רכש או דרך מסכי MDM עתידיים.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center gap-2 py-10 text-muted-foreground">
              <Loader2 className="size-5 animate-spin" aria-hidden />
              טוען…
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-border/60">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-start">ספק</TableHead>
                    <TableHead className="text-start">ח.פ</TableHead>
                    <TableHead className="text-start">ניכוי — תוקף</TableHead>
                    <TableHead className="text-start">ניהול ספרים</TableHead>
                    <TableHead className="text-start">ניכוי %</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground">
                        אין ספקים
                      </TableCell>
                    </TableRow>
                  ) : (
                    filtered.map((r) => {
                      const w = statusFor(r.withholding_tax_expiry)
                      const b = statusFor(r.bookkeeping_auth_expiry)
                      return (
                        <TableRow key={r.id}>
                          <TableCell className="font-medium">{r.name}</TableCell>
                          <TableCell className="font-mono text-xs" dir="ltr">
                            {r.legal_id ?? "—"}
                          </TableCell>
                          <TableCell>
                            <span
                              className={
                                w === "ok"
                                  ? "text-emerald-700 dark:text-emerald-400"
                                  : "text-orange-700 dark:text-orange-400"
                              }
                            >
                              {fmtDate(r.withholding_tax_expiry)}
                            </span>
                          </TableCell>
                          <TableCell>
                            <span
                              className={
                                b === "ok"
                                  ? "text-emerald-700 dark:text-emerald-400"
                                  : "text-orange-700 dark:text-orange-400"
                              }
                            >
                              {fmtDate(r.bookkeeping_auth_expiry)}
                            </span>
                          </TableCell>
                          <TableCell
                            className="font-currency-mono tabular-nums text-sm"
                            dir="ltr"
                          >
                            {r.default_withholding_tax_percent != null
                              ? `${r.default_withholding_tax_percent}%`
                              : "—"}
                          </TableCell>
                        </TableRow>
                      )
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
