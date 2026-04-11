"use client"

import Link from "next/link"
import { useParams } from "next/navigation"
import * as React from "react"
import { ArrowRight, Loader2, Printer } from "lucide-react"

import { Button } from "@/components/ui/button"
import { COMPANY_PROFILE_COLUMNS } from "@/lib/marker-ofek/supabase-fields"
import { createSupabaseBrowserClient } from "@/lib/supabase/browser"
import { formatError } from "@/lib/utils"
import type {
  CompanyProfile,
  MoInvoiceDocumentType,
  MoReceiptPaymentMethod,
} from "@/types/marker-ofek"

const VAT_PCT = 17

const DOC_TITLE: Record<MoInvoiceDocumentType, string> = {
  tax_invoice: "חשבונית מס",
  receipt: "קבלה",
  tax_invoice_receipt: "חשבונית מס קבלה",
}

const PAY_HE: Record<MoReceiptPaymentMethod, string> = {
  bank_transfer: "העברה בנקאית",
  check: "צ׳ק",
  credit_card: "כרטיס אשראי",
  cash: "מזומן",
}

type LineRow = {
  sort_order: number
  description: string
  quantity: number
  unit_price: number
  line_total: number
}

type InvoiceRow = {
  id: string
  invoice_number: number
  issue_date: string
  document_type: MoInvoiceDocumentType
  subtotal: number
  vat_amount: number
  grand_total: number
  is_printed_original: boolean
  digital_signature_sha256?: string | null
  mo_invoice_line_items?: LineRow[] | null
  entities:
    | { name: string; legal_id: string | null; address: string | null }
    | null
    | unknown
  projects:
    | { name: string; internal_project_code: string }
    | null
    | unknown
  mo_receipt_payments:
    | {
        id: string
        payment_method: MoReceiptPaymentMethod
        reference_number: string | null
        amount: number
        payment_date: string
      }[]
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
  dateStyle: "long",
})

export default function MoInvoicePrintPage() {
  const params = useParams()
  const id = typeof params.id === "string" ? params.id : ""

  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [invoice, setInvoice] = React.useState<InvoiceRow | null>(null)
  const [company, setCompany] = React.useState<CompanyProfile | null>(null)
  const markedAfterPrintRef = React.useRef(false)

  React.useEffect(() => {
    const el = document.createElement("style")
    el.setAttribute("data-mo-invoice-print", "1")
    el.textContent = `@media print {
      @page { size: A4; margin: 14mm; }
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
    .mo-print-he {
      direction: rtl;
      unicode-bidi: plaintext;
      font-family: "Rubik", "Noto Sans Hebrew", "Segoe UI", Arial, sans-serif;
    }`
    document.head.appendChild(el)
    return () => {
      document.head.removeChild(el)
    }
  }, [])

  React.useEffect(() => {
    if (!id) {
      setLoading(false)
      setError("מזהה חסר")
      return
    }

    let cancelled = false
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const supabase = createSupabaseBrowserClient()
        const [invRes, cpRes] = await Promise.all([
          supabase
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
              is_printed_original,
              digital_signature_sha256,
              mo_invoice_line_items ( sort_order, description, quantity, unit_price, line_total ),
              entities ( name, legal_id, address ),
              projects ( name, internal_project_code ),
              mo_receipt_payments ( id, payment_method, reference_number, amount, payment_date )
            `
            )
            .eq("id", id)
            .maybeSingle(),
          supabase
            .from("company_profile")
            .select(COMPANY_PROFILE_COLUMNS)
            .order("created_at", { ascending: true })
            .limit(1)
            .maybeSingle(),
        ])

        if (invRes.error) throw invRes.error
        if (!invRes.data) {
          if (!cancelled) setError("החשבונית לא נמצאה")
          return
        }
        if (!cancelled) {
          setInvoice(invRes.data as InvoiceRow)
          setCompany((cpRes.data as CompanyProfile) ?? null)
        }
      } catch (e) {
        if (!cancelled) {
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
  }, [id])

  React.useEffect(() => {
    async function afterPrint() {
      if (!id || markedAfterPrintRef.current) return
      if (!invoice || invoice.is_printed_original) return
      markedAfterPrintRef.current = true
      const supabase = createSupabaseBrowserClient()
      const { error: uErr } = await supabase
        .from("mo_invoices")
        .update({ is_printed_original: true })
        .eq("id", id)
      if (uErr) {
        console.error("[mo_invoices] afterprint mark", uErr)
        markedAfterPrintRef.current = false
        return
      }
      setInvoice((prev) =>
        prev ? { ...prev, is_printed_original: true } : prev
      )
    }

    function onAfterPrint() {
      void afterPrint()
    }

    window.addEventListener("afterprint", onAfterPrint)
    return () => window.removeEventListener("afterprint", onAfterPrint)
  }, [id, invoice])

  if (loading) {
    return (
      <div className="flex min-h-[40vh] flex-col items-center justify-center gap-2 text-muted-foreground">
        <Loader2 className="size-8 animate-spin" aria-hidden />
        <p className="text-sm">טוען מסמך…</p>
      </div>
    )
  }

  if (error || !invoice) {
    return (
      <div className="mx-auto max-w-md p-8 text-center">
        <p className="text-destructive">{error ?? "שגיאה"}</p>
        <Button className="mt-4" render={<Link href="/marker-ofek/finance" />}>
          חזרה לכספים
        </Button>
      </div>
    )
  }

  const client = embedOne(
    invoice.entities as
      | { name: string; legal_id: string | null; address: string | null }
      | { name: string; legal_id: string | null; address: string | null }[]
      | null
  )
  const project = embedOne(
    invoice.projects as
      | { name: string; internal_project_code: string }
      | { name: string; internal_project_code: string }[]
      | null
  )
  const payments = Array.isArray(invoice.mo_receipt_payments)
    ? invoice.mo_receipt_payments
    : []

  const lineItems = Array.isArray(invoice.mo_invoice_line_items)
    ? [...invoice.mo_invoice_line_items].sort(
        (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)
      )
    : []

  const subtotalN = Number(invoice.subtotal) || 0
  const vatN = Number(invoice.vat_amount) || 0
  const vatPercentDisplay =
    subtotalN > 0.0001
      ? Math.round((vatN / subtotalN) * 10000) / 100
      : VAT_PCT

  const originalLabel = invoice.is_printed_original
    ? "העתק נאמן למקור"
    : "מקור"

  return (
    <div
      dir="rtl"
      lang="he"
      className="bg-slate-50 text-slate-900 print:bg-white print:p-0"
    >
      <div className="mx-auto max-w-3xl px-4 py-6 print:max-w-none print:px-8 print:py-6 print:shadow-none">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 print:hidden">
          <Link
            href="/marker-ofek/finance"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowRight className="size-4 rotate-180" aria-hidden />
            חזרה לכספים
          </Link>
          <Button
            type="button"
            className="gap-2 bg-slate-900 text-white hover:bg-slate-800"
            onClick={() => window.print()}
          >
            <Printer className="size-4" aria-hidden />
            הדפסה
          </Button>
        </div>

        <article
          className="mo-print-he rounded-lg border-2 border-slate-800 bg-white p-6 shadow-sm print:rounded-none print:border-0 print:p-0 print:shadow-none"
          aria-label="מסמך להדפסה"
        >
          <header className="border-b-2 border-slate-800 pb-4 print:border-black">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="space-y-1 text-sm leading-relaxed">
                <div className="mb-2">
                  {/* לוגו חברה - יישור לימין עליון למסמך RTL */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src="/marker-ofek-logo.png"
                    alt="לוגו מרקר אופק"
                    className="h-12 w-auto object-contain"
                    loading="eager"
                    decoding="async"
                  />
                </div>
                <p className="text-lg font-bold tracking-tight">
                  {company?.company_name ?? "Marker Ofek"}
                </p>
                {company?.legal_id ? (
                  <p>
                    <span className="font-semibold">ח.פ / ע.מ: </span>
                    {company.legal_id}
                  </p>
                ) : null}
                {company?.address ? <p>{company.address}</p> : null}
                <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-slate-600">
                  {company?.phone ? <span>טל׳ {company.phone}</span> : null}
                  {company?.email ? <span>{company.email}</span> : null}
                </div>
                {company?.deductions_file_number ? (
                  <p className="text-xs">
                    תיק ניכויים: {company.deductions_file_number}
                  </p>
                ) : null}
              </div>
              <div className="text-center sm:text-start">
                <p
                  className="inline-block min-w-[8rem] rounded border-2 border-slate-900 px-4 py-2 text-lg font-black tracking-wide print:border-black"
                  aria-live="polite"
                >
                  {originalLabel}
                </p>
              </div>
            </div>

            <div className="mt-6 space-y-1 border-t border-slate-200 pt-4 print:border-slate-300">
              <h1 className="text-xl font-bold print:text-2xl">
                {DOC_TITLE[invoice.document_type] ?? invoice.document_type}
              </h1>
              <p className="font-mono text-lg font-semibold tabular-nums">
                מספר מסמך: {invoice.invoice_number}
              </p>
              <p className="text-sm text-slate-600">
                תאריך:{" "}
                {invoice.issue_date
                  ? dateFormatter.format(new Date(invoice.issue_date))
                  : "—"}
              </p>
            </div>
          </header>

          <section className="mt-6 space-y-4 text-sm">
            <div className="rounded-md border border-slate-200 bg-slate-50/80 p-4 print:border-black print:bg-white">
              <p className="text-xs font-bold tracking-wide text-slate-500 print:text-black">
                לכבוד
              </p>
              <p className="mt-1 text-base font-semibold">{client?.name ?? "—"}</p>
              {client?.legal_id ? (
                <p className="text-sm">ח.פ / ע.מ: {client.legal_id}</p>
              ) : null}
              {client?.address ? <p className="text-sm">{client.address}</p> : null}
            </div>

            {project ? (
              <p className="text-sm text-slate-700">
                <span className="font-semibold">פרויקט: </span>
                {project.name}
                {project.internal_project_code
                  ? ` · ${project.internal_project_code}`
                  : ""}
              </p>
            ) : (
              <p className="text-sm text-slate-600">סיווג: הכנסה כללית (ללא שיוך פרויקט)</p>
            )}

            {lineItems.length > 0 ? (
              <table
                className="w-full border-collapse border-2 border-slate-800 text-sm print:border-black"
                aria-label="שורות חשבונית"
              >
                <thead>
                  <tr className="border-b-2 border-slate-800 bg-slate-100 print:border-black print:bg-white">
                    <th scope="col" className="px-2 py-2 text-start font-semibold">
                      תיאור
                    </th>
                    <th scope="col" className="px-2 py-2 text-end font-semibold">
                      כמות
                    </th>
                    <th scope="col" className="px-2 py-2 text-end font-semibold">
                      מחיר יחידה
                    </th>
                    <th scope="col" className="px-2 py-2 text-end font-semibold">
                      סה״כ שורה
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {lineItems.map((row, idx) => (
                    <tr
                      key={`${row.sort_order}-${idx}`}
                      className="border-b border-slate-200 print:border-black"
                    >
                      <td className="px-2 py-2 text-start">{row.description}</td>
                      <td className="px-2 py-2 text-end font-mono tabular-nums">
                        {row.quantity}
                      </td>
                      <td className="px-2 py-2 text-end font-mono tabular-nums">
                        {currencyFormatter.format(Number(row.unit_price) || 0)}
                      </td>
                      <td className="px-2 py-2 text-end font-mono tabular-nums">
                        {currencyFormatter.format(Number(row.line_total) || 0)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : null}

            <table
              className="w-full border-collapse border-2 border-slate-800 text-sm print:border-black"
              aria-label="סיכום מע״מ"
            >
              <tbody>
                <tr className="border-b border-slate-300 print:border-black">
                  <th
                    scope="row"
                    className="bg-slate-100 px-3 py-2 text-start font-semibold print:bg-white"
                  >
                    סכום לפני מע״מ
                  </th>
                  <td className="px-3 py-2 text-end font-mono tabular-nums">
                    {currencyFormatter.format(Number(invoice.subtotal) || 0)}
                  </td>
                </tr>
                <tr className="border-b border-slate-300 print:border-black">
                  <th
                    scope="row"
                    className="bg-slate-100 px-3 py-2 text-start font-semibold print:bg-white"
                  >
                    מע״מ ({vatPercentDisplay}%)
                  </th>
                  <td className="px-3 py-2 text-end font-mono tabular-nums">
                    {currencyFormatter.format(Number(invoice.vat_amount) || 0)}
                  </td>
                </tr>
                <tr>
                  <th
                    scope="row"
                    className="bg-slate-200 px-3 py-3 text-start text-base font-bold print:bg-white"
                  >
                    סה״כ לתשלום כולל מע״מ
                  </th>
                  <td className="px-3 py-3 text-end text-base font-bold font-mono tabular-nums">
                    {currencyFormatter.format(Number(invoice.grand_total) || 0)}
                  </td>
                </tr>
              </tbody>
            </table>

            {payments.length > 0 ? (
              <div className="space-y-2 rounded-md border border-slate-200 p-4 print:border-black">
                <p className="text-sm font-bold">פירוט תשלום</p>
                <ul className="list-disc space-y-1 pe-5 text-sm">
                  {payments.map((p) => (
                    <li key={p.id}>
                      שולם ב{PAY_HE[p.payment_method] ?? p.payment_method}
                      {p.reference_number
                        ? ` — אסמכתא: ${p.reference_number}`
                        : ""}
                      {" · "}
                      {currencyFormatter.format(Number(p.amount) || 0)}
                      {p.payment_date
                        ? ` · תאריך ${dateFormatter.format(new Date(p.payment_date))}`
                        : ""}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </section>

          <footer className="mt-10 border-t border-slate-200 pt-4 text-center text-xs text-slate-500 print:mt-8 print:border-black print:text-black">
            <p>מסמך ממוחשב — חתימה אלקטרונית (גיבוב SHA-256) לפי נהלי החברה.</p>
            {invoice.digital_signature_sha256 ? (
              <p className="mt-2 break-all font-mono text-[10px] text-slate-600 print:text-black">
                {invoice.digital_signature_sha256}
              </p>
            ) : null}
          </footer>
        </article>
      </div>
    </div>
  )
}
