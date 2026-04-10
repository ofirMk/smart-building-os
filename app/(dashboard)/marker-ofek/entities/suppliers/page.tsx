"use client"

import Link from "next/link"
import * as React from "react"
import { Loader2, Search } from "lucide-react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

import {
  ErpDataCard,
  ErpDenseHeaderRow,
  ErpDenseTable,
  ErpDenseTableBody,
  ErpDenseTableCell,
  ErpDenseTableHead,
  ErpDenseTableHeader,
  ErpDenseTableRow,
  ErpListBackLink,
  ErpListHeaderRow,
  ErpListPageRoot,
  ErpListTitleBlock,
  ErpListToolbar,
} from "@/components/marker-ofek/data-grid"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
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

type StatusFilter = "all" | "ok" | "bad"

export default function MarkerOfekSuppliersCompliancePage() {
  const router = useRouter()
  const [query, setQuery] = React.useState("")
  const [statusFilter, setStatusFilter] = React.useState<StatusFilter>("all")
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

  const displayRows = React.useMemo(() => {
    if (statusFilter === "all") return filtered
    return filtered.filter((r) => {
      const w = statusFor(r.withholding_tax_expiry)
      const b = statusFor(r.bookkeeping_auth_expiry)
      if (statusFilter === "ok") return w === "ok" && b === "ok"
      return w === "bad" || b === "bad"
    })
  }, [filtered, statusFilter])

  function goToEntity(id: string) {
    router.push(`/marker-ofek/entities/${id}`)
  }

  return (
    <ErpListPageRoot>
      <ErpListBackLink href="/marker-ofek/entities">חזרה לישויות</ErpListBackLink>

      <ErpListHeaderRow
        titleBlock={
          <ErpListTitleBlock
            title="ספקים — תאימות מס"
            description="תאריכי תוקף לניכוי ולניהול ספרים, ואחוז ניכוי ברירת מחדל."
          />
        }
        actions={
          <Button variant="outline" className="text-[13px]" render={<Link href="/marker-ofek/procurement/purchase-orders/new" />}>
            הזמנת רכש חדשה
          </Button>
        }
      />

      <ErpDataCard>
        <ErpListToolbar
          filterSlot={
            <Select
              value={statusFilter}
              onValueChange={(v) => setStatusFilter(v as StatusFilter)}
            >
              <SelectTrigger
                className="h-9 w-[min(100%,220px)] text-[13px]"
                dir="rtl"
                aria-label="סינון לפי סטטוס תוקף"
              >
                <SelectValue placeholder="סינון" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">כל הספקים</SelectItem>
                <SelectItem value="ok">תוקף תקין (שניהם)</SelectItem>
                <SelectItem value="bad">דורש טיפול (לפחות אחד)</SelectItem>
              </SelectContent>
            </Select>
          }
          searchSlot={
            <>
              <Search
                className="pointer-events-none absolute end-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <Input
                placeholder="חיפוש ספק או ח.פ…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="h-9 pe-10 text-[13px]"
                dir="rtl"
                aria-label="חיפוש ספקים"
              />
            </>
          }
        />
        <p className="border-b border-slate-100 px-4 pb-3 text-[12px] text-muted-foreground dark:border-slate-800">
          עדכון שדות בזרימת &quot;ספק חדש&quot; בהזמנת רכש או במסך ישות.
        </p>

        {loading ? (
          <div className="flex items-center gap-2 px-4 py-10 text-muted-foreground">
            <Loader2 className="size-5 animate-spin" aria-hidden />
            טוען…
          </div>
        ) : (
          <div className="overflow-x-auto">
            <ErpDenseTable>
              <ErpDenseTableHeader>
                <ErpDenseHeaderRow>
                  <ErpDenseTableHead>ספק</ErpDenseTableHead>
                  <ErpDenseTableHead>ח.פ</ErpDenseTableHead>
                  <ErpDenseTableHead>ניכוי — תוקף</ErpDenseTableHead>
                  <ErpDenseTableHead>ניהול ספרים</ErpDenseTableHead>
                  <ErpDenseTableHead>ניכוי %</ErpDenseTableHead>
                </ErpDenseHeaderRow>
              </ErpDenseTableHeader>
              <ErpDenseTableBody>
                {displayRows.length === 0 ? (
                  <ErpDenseTableRow interactive={false}>
                    <ErpDenseTableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                      אין ספקים
                    </ErpDenseTableCell>
                  </ErpDenseTableRow>
                ) : (
                  displayRows.map((r) => {
                    const w = statusFor(r.withholding_tax_expiry)
                    const b = statusFor(r.bookkeeping_auth_expiry)
                    return (
                      <ErpDenseTableRow
                        key={r.id}
                        interactive
                        tabIndex={0}
                        onClick={() => goToEntity(r.id)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault()
                            goToEntity(r.id)
                          }
                        }}
                      >
                        <ErpDenseTableCell className="font-medium">{r.name}</ErpDenseTableCell>
                        <ErpDenseTableCell className="font-mono text-[12px]" dir="ltr">
                          {r.legal_id ?? "—"}
                        </ErpDenseTableCell>
                        <ErpDenseTableCell>
                          <span
                            className={
                              w === "ok"
                                ? "text-emerald-700 dark:text-emerald-400"
                                : "text-orange-700 dark:text-orange-400"
                            }
                          >
                            {fmtDate(r.withholding_tax_expiry)}
                          </span>
                        </ErpDenseTableCell>
                        <ErpDenseTableCell>
                          <span
                            className={
                              b === "ok"
                                ? "text-emerald-700 dark:text-emerald-400"
                                : "text-orange-700 dark:text-orange-400"
                            }
                          >
                            {fmtDate(r.bookkeeping_auth_expiry)}
                          </span>
                        </ErpDenseTableCell>
                        <ErpDenseTableCell
                          className="font-currency-mono tabular-nums text-[13px]"
                          dir="ltr"
                        >
                          {r.default_withholding_tax_percent != null
                            ? `${r.default_withholding_tax_percent}%`
                            : "—"}
                        </ErpDenseTableCell>
                      </ErpDenseTableRow>
                    )
                  })
                )}
              </ErpDenseTableBody>
            </ErpDenseTable>
          </div>
        )}
      </ErpDataCard>
    </ErpListPageRoot>
  )
}
