"use client"

import Link from "next/link"
import * as React from "react"
import {
  ArrowRight,
  FileStack,
  Loader2,
  Wallet,
} from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
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

const VAT_RATE = 0.17

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100
}

function monthRangeUtc(y: number, m: number): { start: string; end: string } {
  const start = new Date(Date.UTC(y, m - 1, 1, 0, 0, 0, 0))
  const end = new Date(Date.UTC(y, m, 1, 0, 0, 0, 0))
  return { start: start.toISOString(), end: end.toISOString() }
}

type ProjectOption = { id: string; name: string; internal_project_code: string }

type MoInvoiceRow = {
  id: string
  invoice_number: number
  issue_date: string
  subtotal: number
  vat_amount: number
  grand_total: number
  status: string
  entities: { name: string } | { name: string }[] | null
}

type PartialRow = {
  id: string
  account_number: number
  payment_due: number
  created_at: string
  status: string
}

type SummaryLine =
  | {
      kind: "mo_invoice"
      id: string
      label: string
      subtotal: number
      vat_amount: number
      grand_total: number
    }
  | {
      kind: "partial_account"
      id: string
      label: string
      subtotal: number
      vat_amount: number
      grand_total: number
    }

function embedOne<T>(x: T | T[] | null | undefined): T | null {
  if (x == null) return null
  return Array.isArray(x) ? (x[0] ?? null) : x
}

const currencyFormatter = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  minimumFractionDigits: 2,
})

/** תצוגת דוגמה — עד חיבור מלא לדוחות אישור בפועל */
const MOCK_APPROVED_ACCOUNTS_THIS_MONTH = [
  {
    id: "mock-1",
    reference: "חשבון חלקי #18",
    detail: "שלב שלד — אישור מהנדס",
    approvedOn: "2026-03-02",
    amount: 412_800,
  },
  {
    id: "mock-2",
    reference: "חשבון חלקי #19",
    detail: "חשמול תת-תחנה",
    approvedOn: "2026-03-08",
    amount: 128_450,
  },
  {
    id: "mock-3",
    reference: "חשבונית מס #10042",
    detail: "יועץ חיצוני — מע״מ כלול",
    approvedOn: "2026-03-14",
    amount: 33_040,
  },
  {
    id: "mock-4",
    reference: "חשבון חלקי #20",
    detail: "גמרים — סבב א׳",
    approvedOn: "2026-03-21",
    amount: 256_000,
  },
] as const

/** חלוקה גסה של סכום כולל למע״מ (לחשבונות חלקיים ללא פירוט נפרד) */
function splitVatFromGross(gross: number): {
  subtotal: number
  vat_amount: number
} {
  const subtotal = roundMoney(gross / (1 + VAT_RATE))
  const vat_amount = roundMoney(gross - subtotal)
  return { subtotal, vat_amount }
}

export default function MarkerOfekCentralizedInvoicePage() {
  const [projects, setProjects] = React.useState<ProjectOption[]>([])
  const [projectId, setProjectId] = React.useState("")
  const [monthValue, setMonthValue] = React.useState(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
  })
  const [loadingProjects, setLoadingProjects] = React.useState(true)
  const [loadingData, setLoadingData] = React.useState(false)
  const [generating, setGenerating] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [lines, setLines] = React.useState<SummaryLine[]>([])
  const [totals, setTotals] = React.useState({
    subtotal: 0,
    vat_amount: 0,
    grand_total: 0,
  })

  React.useEffect(() => {
    let cancelled = false
    async function loadProjects() {
      setLoadingProjects(true)
      setError(null)
      try {
        const supabase = createSupabaseBrowserClient()
        const { data, error: qErr } = await supabase
          .from("projects")
          .select("id, name, internal_project_code")
          .eq("is_deleted", false)
          .order("name", { ascending: true })
        if (qErr) throw qErr
        if (!cancelled) {
          setProjects((data as ProjectOption[]) ?? [])
          setProjectId((prev) => {
            if (prev && (data as ProjectOption[])?.some((p) => p.id === prev))
              return prev
            return (data as ProjectOption[])?.[0]?.id ?? ""
          })
        }
      } catch (e) {
        if (!cancelled) {
          setProjects([])
          setError(formatError(e))
        }
      } finally {
        if (!cancelled) setLoadingProjects(false)
      }
    }
    void loadProjects()
    return () => {
      cancelled = true
    }
  }, [])

  const [yStr, mStr] = monthValue.split("-")
  const year = parseInt(yStr || "0", 10)
  const month = parseInt(mStr || "0", 10)

  React.useEffect(() => {
    if (!projectId || !year || !month) {
      setLoadingData(false)
      setLines([])
      setTotals({ subtotal: 0, vat_amount: 0, grand_total: 0 })
      return
    }
    let cancelled = false
    async function loadMonth() {
      setLoadingData(true)
      setError(null)
      const { start, end } = monthRangeUtc(year, month)
      try {
        const supabase = createSupabaseBrowserClient()
        const { data: contractRows, error: cErr } = await supabase
          .from("contracts")
          .select("id")
          .eq("project_id", projectId)
          .eq("is_deleted", false)

        if (cErr) throw cErr
        const contractIds = ((contractRows as { id: string }[]) ?? []).map(
          (r) => r.id
        )

        const partQuery =
          contractIds.length === 0
            ? Promise.resolve({ data: [] as PartialRow[], error: null })
            : supabase
                .from("partial_accounts")
                .select(
                  "id, account_number, payment_due, created_at, status"
                )
                .eq("is_deleted", false)
                .eq("status", "approved")
                .in("contract_id", contractIds)
                .gte("created_at", start)
                .lt("created_at", end)
                .order("created_at", { ascending: true })

        const [invRes, partRes] = await Promise.all([
          supabase
            .from("mo_invoices")
            .select(
              `
              id,
              invoice_number,
              issue_date,
              subtotal,
              vat_amount,
              grand_total,
              status,
              entities ( name )
            `
            )
            .eq("project_id", projectId)
            .gte("issue_date", start.slice(0, 10))
            .lt("issue_date", end.slice(0, 10))
            .in("status", ["issued", "paid"])
            .order("issue_date", { ascending: true }),
          partQuery,
        ])

        if (invRes.error) throw invRes.error
        if (partRes.error) throw partRes.error

        const invList = (invRes.data as MoInvoiceRow[]) ?? []
        const partList = (partRes.data as PartialRow[]) ?? []

        const builtLines: SummaryLine[] = [
          ...invList.map((r) => {
            const ent = embedOne(r.entities)
            return {
              kind: "mo_invoice" as const,
              id: r.id,
              label: `חשבונית מס #${r.invoice_number}${ent?.name ? ` · ${ent.name}` : ""}`,
              subtotal: Number(r.subtotal) || 0,
              vat_amount: Number(r.vat_amount) || 0,
              grand_total: Number(r.grand_total) || 0,
            }
          }),
          ...partList.map((p) => {
            const gross = Number(p.payment_due) || 0
            const { subtotal, vat_amount } = splitVatFromGross(gross)
            return {
              kind: "partial_account" as const,
              id: p.id,
              label: `חשבון חלקי #${p.account_number}`,
              subtotal,
              vat_amount,
              grand_total: gross,
            }
          }),
        ]

        const subtotal = roundMoney(
          builtLines.reduce((s, l) => s + l.subtotal, 0)
        )
        const vat_amount = roundMoney(
          builtLines.reduce((s, l) => s + l.vat_amount, 0)
        )
        const grand_total = roundMoney(subtotal + vat_amount)

        if (!cancelled) {
          setLines(builtLines)
          setTotals({ subtotal, vat_amount, grand_total })
        }
      } catch (e) {
        if (!cancelled) {
          setLines([])
          setTotals({ subtotal: 0, vat_amount: 0, grand_total: 0 })
          const msg = formatError(e)
          if (
            msg.includes("centralized_invoices") ||
            msg.includes("does not exist")
          ) {
            setError(
              "חסרה טבלת centralized_invoices — הריצו marker_ofek_ai_invoices.sql ב-Supabase."
            )
          } else if (
            msg.includes("partial_accounts") ||
            msg.includes("contracts")
          ) {
            setError(msg)
          } else {
            setError(msg)
          }
        }
      } finally {
        if (!cancelled) setLoadingData(false)
      }
    }
    void loadMonth()
    return () => {
      cancelled = true
    }
  }, [projectId, year, month])

  async function handleGenerate() {
    if (!projectId || !year || !month) {
      toast.error("נא לבחור פרויקט וחודש.")
      return
    }
    if (lines.length === 0) {
      toast.error("אין פעילות מאושרת בחודש הנבחר.")
      return
    }

    setGenerating(true)
    const supabase = createSupabaseBrowserClient()
    try {
      const { data, error: insErr } = await supabase
        .from("centralized_invoices")
        .insert({
          project_id: projectId,
          billing_year: year,
          billing_month: month,
          total_amount: totals.grand_total,
          status: "finalized",
        })
        .select("id, invoice_number")
        .single()

      if (insErr) throw insErr
      const row = data as { id: string; invoice_number: number }
      toast.success(`נוצרה חשבונית מרכזת מס׳ ${row.invoice_number}`)
    } catch (e) {
      const msg = formatError(e)
      if (
        msg.includes("centralized_invoices_invoice_number_key") ||
        msg.includes("duplicate key")
      ) {
        toast.error("מספר חשבונית כפול — בדקו את הרצף או נסו שוב.")
      } else if (
        msg.includes("relation") &&
        msg.includes("centralized_invoices")
      ) {
        toast.error("הריצו marker_ofek_ai_invoices.sql ב-Supabase.")
      } else {
        toast.error(msg)
      }
    } finally {
      setGenerating(false)
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-8 pb-12">
      <Link
        href="/marker-ofek/finance"
        className="inline-flex w-fit items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowRight className="size-4 rotate-180" aria-hidden />
        חזרה לכספים
      </Link>

      <header className="pharmacy-hero-card p-6 sm:p-8">
        <div className="flex items-start gap-4">
          <div className="flex size-12 shrink-0 items-center justify-center rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-600">
            <FileStack className="size-6" aria-hidden />
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-emerald-600/90">
              מרקר אופק
            </p>
            <h1 className="text-2xl font-bold tracking-tight text-[#1e293b] sm:text-3xl">
              חשבונית מרכזת
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-slate-500">
              איסוף חשבוניות מס (הופקה / שולמה) וחשבונות חלקיים מאושרים לפי פרויקט וחודש,
              והפקת מסמך אחד עם מספור מ־
              <code className="rounded bg-slate-100 px-1 text-[#1e293b]">invoice_seq</code>.
            </p>
          </div>
        </div>
      </header>

      <section className="rounded-2xl border border-border/60 bg-card/90 p-4 shadow-sm sm:p-6">
        <div className="grid gap-6 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="project">פרויקט</Label>
            {loadingProjects ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" aria-hidden />
                טוען פרויקטים…
              </div>
            ) : (
              <Select
                value={projectId}
                onValueChange={(v) => setProjectId(v ?? "")}
              >
                <SelectTrigger id="project" className="w-full">
                  <SelectValue placeholder="בחרו פרויקט" />
                </SelectTrigger>
                <SelectContent>
                  {projects.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}{" "}
                      <span className="font-mono text-muted-foreground">
                        ({p.internal_project_code})
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="billing-month">חודש חיוב</Label>
            <input
              id="billing-month"
              type="month"
              value={monthValue}
              onChange={(e) => setMonthValue(e.target.value)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
        </div>
      </section>

      {error ? (
        <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <section className="rounded-2xl border border-border/60 bg-card/90 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 px-4 py-4 sm:px-6">
          <div>
            <h2 className="text-lg font-semibold">חשבונות שאושרו החודש</h2>
            <p className="text-sm text-muted-foreground">
              תצוגת סיכום לדוגמה (מוק) — לפי פרויקט וחודש נבחרים במסננים למעלה
            </p>
          </div>
          <span className="rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-xs font-medium text-amber-900 dark:text-amber-100">
            דמו
          </span>
        </div>
        <div className="overflow-x-auto px-2 pb-4 pt-2 sm:px-4">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead>אסמכתא</TableHead>
                <TableHead>תיאור</TableHead>
                <TableHead className="whitespace-nowrap">תאריך אישור</TableHead>
                <TableHead className="text-end">סכום</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {MOCK_APPROVED_ACCOUNTS_THIS_MONTH.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-medium">{row.reference}</TableCell>
                  <TableCell className="max-w-[240px] text-sm text-muted-foreground">
                    {row.detail}
                  </TableCell>
                  <TableCell className="whitespace-nowrap tabular-nums text-sm">
                    {row.approvedOn}
                  </TableCell>
                  <TableCell className="text-end font-medium tabular-nums">
                    {currencyFormatter.format(row.amount)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </section>

      <section className="rounded-2xl border border-border/60 bg-card/90 shadow-sm">
        <div className="flex flex-wrap items-center gap-2 border-b border-border/60 px-4 py-4 sm:px-6">
          <Wallet className="size-5 text-muted-foreground" aria-hidden />
          <h2 className="text-lg font-semibold">אגרגציה מהמסד (חשבוניות מס + חשבונות חלקיים)</h2>
        </div>
        {loadingData ? (
          <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
            <Loader2 className="size-5 animate-spin" aria-hidden />
            טוען נתונים…
          </div>
        ) : lines.length === 0 ? (
          <p className="px-4 py-12 text-center text-sm text-muted-foreground sm:px-6">
            לא נמצאו חשבוניות מס (סטטוס הופקה/שולמה) או חשבונות חלקיים מאושרים בטווח התאריכים.
          </p>
        ) : (
          <div className="overflow-x-auto px-2 pb-4 pt-2 sm:px-4">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead>מקור</TableHead>
                  <TableHead className="text-end">לפני מע״מ</TableHead>
                  <TableHead className="text-end">מע״מ</TableHead>
                  <TableHead className="text-end">סה״כ</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lines.map((l) => (
                  <TableRow key={`${l.kind}-${l.id}`}>
                    <TableCell className="max-w-[280px] text-sm">{l.label}</TableCell>
                    <TableCell className="text-end tabular-nums">
                      {currencyFormatter.format(l.subtotal)}
                    </TableCell>
                    <TableCell className="text-end tabular-nums">
                      {currencyFormatter.format(l.vat_amount)}
                    </TableCell>
                    <TableCell className="text-end font-medium tabular-nums">
                      {currencyFormatter.format(l.grand_total)}
                    </TableCell>
                  </TableRow>
                ))}
                <TableRow className="bg-muted/25 font-semibold">
                  <TableCell>סיכום</TableCell>
                  <TableCell className="text-end tabular-nums">
                    {currencyFormatter.format(totals.subtotal)}
                  </TableCell>
                  <TableCell className="text-end tabular-nums">
                    {currencyFormatter.format(totals.vat_amount)}
                  </TableCell>
                  <TableCell className="text-end tabular-nums">
                    {currencyFormatter.format(totals.grand_total)}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        )}

        <div className="flex flex-wrap justify-end gap-3 border-t border-border/60 px-4 py-4 sm:px-6">
          <Button
            type="button"
            disabled={
              generating ||
              loadingData ||
              lines.length === 0 ||
              !projectId
            }
            onClick={() => void handleGenerate()}
            className="gap-2 bg-emerald-600 text-white hover:bg-emerald-500"
          >
            {generating ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : null}
            הפק חשבונית מרכזת
          </Button>
        </div>
      </section>

      <p className="text-center text-xs text-muted-foreground">
        דורש הרצת{" "}
        <code className="rounded bg-muted px-1">marker_ofek_ai_invoices.sql</code>{" "}
        ו־<code className="rounded bg-muted px-1">marker_ofek_finance.sql</code>{" "}
        (רצף <code className="rounded bg-muted px-1">invoice_seq</code>).
      </p>
    </div>
  )
}
