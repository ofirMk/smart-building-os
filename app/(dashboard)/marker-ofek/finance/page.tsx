"use client"

import Link from "next/link"
import * as React from "react"
import {
  ArrowRight,
  ExternalLink,
  FileStack,
  Loader2,
  Printer,
  Wallet,
} from "lucide-react"

import { buttonVariants } from "@/components/ui/button-variants"
import { createSupabaseBrowserClient } from "@/lib/supabase/browser"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import type {
  MoInvoiceDocumentType,
  MoInvoiceFinancialStatus,
} from "@/types/marker-ofek"
import { cn, formatError } from "@/lib/utils"

const DOC_LABELS: Record<MoInvoiceDocumentType, string> = {
  tax_invoice: "חשבונית מס",
  receipt: "קבלה",
  tax_invoice_receipt: "חשבונית מס קבלה",
}

const STATUS_LABELS: Record<MoInvoiceFinancialStatus, string> = {
  issued: "הופקה",
  approved: "מאושרת",
  paid: "שולמה",
  cancelled: "בוטלה",
}

type Row = {
  id: string
  invoice_number: number
  issue_date: string
  document_type: MoInvoiceDocumentType
  subtotal: number
  vat_amount: number
  grand_total: number
  status: MoInvoiceFinancialStatus
  entities: { name: string } | { name: string }[] | null
  projects:
    | { name: string; internal_project_code: string }
    | { name: string; internal_project_code: string }[]
    | null
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

const dateFormatter = new Intl.DateTimeFormat("he-IL", {
  dateStyle: "short",
})

export default function MarkerOfekFinancePage() {
  const [rows, setRows] = React.useState<Row[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const supabase = createSupabaseBrowserClient()
        const { data, error: qErr } = await supabase
          .from("mo_invoices")
          .select(
            `
            id,
            invoice_number,
            issue_date,
            document_type,
            subtotal,
            vat_amount,
            grand_total,
            status,
            entities ( name ),
            projects ( name, internal_project_code )
          `
          )
          .order("created_at", { ascending: false })
          .limit(100)

        if (qErr) {
          if (
            qErr.message.includes("relation") ||
            qErr.message.includes("does not exist")
          ) {
            throw new Error(
              "הריצו marker_ofek_finance.sql ב-Supabase ליצירת mo_invoices."
            )
          }
          throw qErr
        }
        if (!cancelled) setRows((data as Row[]) ?? [])
      } catch (e) {
        if (!cancelled) {
          setRows([])
          setError(formatError(e))
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6 pb-12">
      <Link
        href="/marker-ofek"
        className="inline-flex w-fit items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowRight className="size-4 rotate-180" aria-hidden />
        חזרה ללוח הבקרה
      </Link>

      <header className="pharmacy-hero-card p-6 sm:p-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-4">
            <div className="flex size-12 shrink-0 items-center justify-center rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-600">
              <Wallet className="size-6" aria-hidden />
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-emerald-600/90">
                מרקר אופק
              </p>
              <h1 className="text-2xl font-bold tracking-tight text-[#1e293b] sm:text-3xl">
                כספים — חשבוניות וקבלות
              </h1>
              <p className="mt-1 max-w-2xl text-sm text-slate-500">
                מסמכים ממוספרים לפי מע״מ, כולל חשבונית מס וחשבונית מס קבלה.
              </p>
            </div>
          </div>
        </div>
      </header>

      <section className="rounded-2xl border border-border/60 bg-card/90 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 px-4 py-4 sm:px-6">
          <h2 className="text-lg font-semibold">מסמכים כספיים שהופקו</h2>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/marker-ofek/finance/billing"
              className={cn(
                buttonVariants({ size: "sm", variant: "outline" }),
                "gap-2 border-indigo-200 text-indigo-800 hover:bg-indigo-500/10"
              )}
            >
              מרכז חוזים וחיוב
            </Link>
            <Link
              href="/marker-ofek/contracts"
              className={cn(
                buttonVariants({ size: "sm", variant: "outline" }),
                "gap-2 border-slate-200 text-slate-800 hover:bg-slate-50"
              )}
            >
              כרטיסי חוזה
            </Link>
            <Link
              href="/marker-ofek/finance/centralized"
              className={cn(
                buttonVariants({ size: "sm", variant: "outline" }),
                "gap-2 border-emerald-500/40 text-emerald-800 hover:bg-emerald-500/10 dark:text-emerald-200"
              )}
            >
              <FileStack className="size-4" aria-hidden />
              חשבונית מרכזת
            </Link>
            <Link
              href="/marker-ofek/finance/invoices/new"
              className={cn(
                buttonVariants({ size: "sm", variant: "default" }),
                "gap-2 bg-slate-900 text-white hover:bg-slate-800"
              )}
            >
              מחולל חשבוניות
            </Link>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
            <Loader2 className="size-5 animate-spin" aria-hidden />
            טוען…
          </div>
        ) : error ? (
          <p className="px-4 py-10 text-center text-sm text-destructive sm:px-6">
            {error}
          </p>
        ) : rows.length === 0 ? (
          <p className="px-4 py-14 text-center text-sm text-muted-foreground sm:px-6">
            אין עדיין חשבוניות. הפיקו ממסך חוזה — כפתור &quot;הפק חשבונית מס ללקוח&quot;.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead className="whitespace-nowrap">מספר</TableHead>
                  <TableHead>סוג</TableHead>
                  <TableHead>לקוח</TableHead>
                  <TableHead>פרויקט</TableHead>
                  <TableHead className="whitespace-nowrap">תאריך</TableHead>
                  <TableHead className="text-end">סה״כ</TableHead>
                  <TableHead>סטטוס</TableHead>
                  <TableHead className="w-[1%] print:hidden">הדפסה</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => {
                  const ent = embedOne(r.entities)
                  const proj = embedOne(r.projects)
                  return (
                    <TableRow key={r.id}>
                      <TableCell className="font-mono font-medium">
                        {r.invoice_number}
                      </TableCell>
                      <TableCell className="text-sm">
                        {DOC_LABELS[r.document_type] ?? r.document_type}
                      </TableCell>
                      <TableCell className="max-w-[140px] truncate sm:max-w-[200px]">
                        {ent?.name ?? "—"}
                      </TableCell>
                      <TableCell className="max-w-[140px] truncate sm:max-w-[200px]">
                        {proj?.name ?? "הכנסה כללית"}
                      </TableCell>
                      <TableCell className="whitespace-nowrap tabular-nums text-sm">
                        {r.issue_date
                          ? dateFormatter.format(new Date(r.issue_date))
                          : "—"}
                      </TableCell>
                      <TableCell className="text-end font-semibold tabular-nums">
                        {currencyFormatter.format(Number(r.grand_total) || 0)}
                      </TableCell>
                      <TableCell className="text-sm">
                        {STATUS_LABELS[r.status] ?? r.status}
                      </TableCell>
                      <TableCell className="print:hidden">
                        <Link
                          href={`/marker-ofek/finance/invoices/${r.id}/print`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={cn(
                            buttonVariants({ size: "sm", variant: "outline" }),
                            "gap-1 whitespace-nowrap"
                          )}
                        >
                          <Printer className="size-3.5" aria-hidden />
                          הדפסה
                          <ExternalLink className="size-3 opacity-60" aria-hidden />
                        </Link>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </section>
    </div>
  )
}
