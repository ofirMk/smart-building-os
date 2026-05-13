"use client"

/**
 * Client Progress Bill — A4 Print Template (חשבון חלקי למזמין)
 * ----------------------------------------------------------------------------
 * Pixel-faithful reproduction of the contractor-to-owner partial bill:
 *   • Header: issuer (company) ↔ buyer (client), contract #, bill # + period.
 *   • Line table: contract-line BOQ, submitted qty/amount, approved qty/amount,
 *     delta, cumulative % vs contract.
 *   • Financial summary (indexation → retention → advance-repayment → VAT).
 *   • Signatory block (owner / project manager / contractor).
 *
 * Data source: erp_client_progress_bills (+ erp_client_progress_bill_lines +
 * erp_client_contract_lines + erp_client_contracts + erp_proj_projects +
 * erp_companies). All queries are client-side via the authenticated Supabase
 * browser client — matches the existing subcontractor-bill template.
 */

import { useParams } from "next/navigation"
import * as React from "react"
import { Loader2, Printer } from "lucide-react"

import { createSupabaseBrowserClient } from "@/lib/supabase/browser"
import { formatError } from "@/lib/utils"

// ---------------------------------------------------------------------------
// Types (mirror DB schema)
// ---------------------------------------------------------------------------

type BillStatus = "DRAFT" | "SUBMITTED" | "PARTIALLY_APPROVED" | "APPROVED"

type BillRow = {
  id: string
  company_id: string
  client_contract_id: string
  bill_number: string
  period_start: string | null
  period_end: string | null
  status: BillStatus
  submitted_total_amount: number
  approved_total_amount: number
  indexed_submitted_amount: number
  indexed_approved_amount: number
  retention_deducted_amount: number
  advance_repayment_amount: number
  net_approved_payable: number
  created_at: string
}

type BillLineRow = {
  id: string
  contract_line_id: string
  submitted_qty: number
  submitted_amount: number
  approved_qty: number
  approved_amount: number
  approved_manual_override: boolean
}

type ContractLineRow = {
  id: string
  line_number: number
  boq_ref: string | null
  description: string
  quantity: number
  unit_price: number
  is_advance_line: boolean
  retainage_exempt: boolean
}

type ContractRow = {
  id: string
  contract_number: string
  title: string
  client_name: string
  total_amount: number
  indexation_pct: number
  retention_pct: number
  advance_payment_amount: number
  advance_repayment_pct: number
  project_id: string | null
}

type ProjectRow = {
  name: string
  project_number: string | null
}

type CompanyRow = {
  id: string
  name_he: string
  name_en: string
}

const STATUS_HE: Record<BillStatus, string> = {
  DRAFT: "טיוטא",
  SUBMITTED: "הוגש לאישור",
  PARTIALLY_APPROVED: "אושר חלקית",
  APPROVED: "אושר במלואו",
}

// ---------------------------------------------------------------------------
// Formatters
// ---------------------------------------------------------------------------

const ils = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  minimumFractionDigits: 2,
})

const num3 = new Intl.NumberFormat("he-IL", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 3,
})

const pct = new Intl.NumberFormat("he-IL", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 2,
})

const dateFmt = new Intl.DateTimeFormat("he-IL", { dateStyle: "short" })

// Default VAT — should come from company_profile.default_vat_rate_percent but
// kept local to avoid coupling the print template to async config lookups.
const DEFAULT_VAT_PCT = 18

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

export default function ClientProgressBillPrintPage() {
  const params = useParams<{ id: string }>()
  const id = typeof params?.id === "string" ? params.id : ""

  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [bill, setBill] = React.useState<BillRow | null>(null)
  const [billLines, setBillLines] = React.useState<BillLineRow[]>([])
  const [contractLines, setContractLines] = React.useState<Map<string, ContractLineRow>>(new Map())
  const [contract, setContract] = React.useState<ContractRow | null>(null)
  const [project, setProject] = React.useState<ProjectRow | null>(null)
  const [company, setCompany] = React.useState<CompanyRow | null>(null)

  React.useEffect(() => {
    if (!id) {
      setError("מזהה חשבון חסר")
      setLoading(false)
      return
    }

    let cancelled = false
    void (async () => {
      try {
        setLoading(true)
        setError(null)
        const supabase = createSupabaseBrowserClient()

        const bRes = await supabase
          .from("erp_client_progress_bills")
          .select(
            "id, company_id, client_contract_id, bill_number, period_start, period_end, status, submitted_total_amount, approved_total_amount, indexed_submitted_amount, indexed_approved_amount, retention_deducted_amount, advance_repayment_amount, net_approved_payable, created_at",
          )
          .eq("id", id)
          .maybeSingle()

        if (bRes.error) throw bRes.error
        if (!bRes.data) {
          if (!cancelled) setError("החשבון לא נמצא")
          return
        }

        const b = bRes.data as BillRow
        if (!cancelled) setBill(b)

        const cRes = await supabase
          .from("erp_client_contracts")
          .select(
            "id, contract_number, title, client_name, total_amount, indexation_pct, retention_pct, advance_payment_amount, advance_repayment_pct, project_id",
          )
          .eq("id", b.client_contract_id)
          .maybeSingle()

        if (cRes.error) throw cRes.error
        const c = (cRes.data ?? null) as ContractRow | null
        if (!cancelled) setContract(c)

        const [linesRes, ctrlRes, projRes, compRes] = await Promise.all([
          supabase
            .from("erp_client_progress_bill_lines")
            .select(
              "id, contract_line_id, submitted_qty, submitted_amount, approved_qty, approved_amount, approved_manual_override",
            )
            .eq("progress_bill_id", b.id),
          supabase
            .from("erp_client_contract_lines")
            .select("id, line_number, boq_ref, description, quantity, unit_price, is_advance_line, retainage_exempt")
            .eq("client_contract_id", b.client_contract_id)
            .order("line_number", { ascending: true }),
          c?.project_id
            ? supabase
                .from("erp_proj_projects")
                .select("name, project_number")
                .eq("id", c.project_id)
                .maybeSingle()
            : Promise.resolve({ data: null, error: null } as const),
          supabase
            .from("erp_companies")
            .select("id, name_he, name_en")
            .eq("id", b.company_id)
            .maybeSingle(),
        ])

        if (linesRes.error) throw linesRes.error
        if (ctrlRes.error) throw ctrlRes.error
        if (projRes.error) throw projRes.error
        if (compRes.error) throw compRes.error

        if (!cancelled) {
          setBillLines((linesRes.data ?? []) as BillLineRow[])
          const m = new Map<string, ContractLineRow>()
          for (const r of (ctrlRes.data ?? []) as ContractLineRow[]) m.set(r.id, r)
          setContractLines(m)
          setProject((projRes.data ?? null) as ProjectRow | null)
          setCompany((compRes.data ?? null) as CompanyRow | null)
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
  }, [id])

  if (loading) {
    return (
      <div className="flex min-h-[40vh] flex-col items-center justify-center gap-2 text-slate-600">
        <Loader2 className="size-8 animate-spin" aria-hidden />
        <p className="text-sm">טוען חשבון חלקי למזמין…</p>
      </div>
    )
  }

  if (error || !bill) {
    return (
      <div className="mx-auto max-w-md p-8 text-center text-slate-700">
        <p className="text-base font-semibold text-red-700">
          {error ?? "שגיאה בטעינת החשבון"}
        </p>
      </div>
    )
  }

  // ---- Sorted joined rows ----
  const rows = billLines
    .map((bl) => ({ bl, cl: contractLines.get(bl.contract_line_id) ?? null }))
    .filter((r): r is { bl: BillLineRow; cl: ContractLineRow } => r.cl != null)
    .sort((a, b) => a.cl.line_number - b.cl.line_number)

  // ---- Financial summary (waterfall) ----
  const indexationPct = Number(contract?.indexation_pct ?? 0)
  const retentionPct = Number(contract?.retention_pct ?? 0)
  const advanceRepaymentPct = Number(contract?.advance_repayment_pct ?? 0)
  const advancePaymentTotal = Number(contract?.advance_payment_amount ?? 0)

  const approvedGross = Number(bill.approved_total_amount) || 0
  const indexedApproved = Number(bill.indexed_approved_amount) || approvedGross
  const indexationDelta = Math.round((indexedApproved - approvedGross) * 100) / 100
  const retentionDeducted = Number(bill.retention_deducted_amount) || 0
  const advanceRepayment = Number(bill.advance_repayment_amount) || 0
  const netPayable = Number(bill.net_approved_payable) || 0
  const vatAmount = Math.round(netPayable * DEFAULT_VAT_PCT) / 100
  const grandTotal = Math.round((netPayable + vatAmount) * 100) / 100

  // ---- Period display ----
  const periodLabel = (() => {
    if (bill.period_start && bill.period_end) {
      return `${dateFmt.format(new Date(bill.period_start))} — ${dateFmt.format(new Date(bill.period_end))}`
    }
    if (bill.period_end) return dateFmt.format(new Date(bill.period_end))
    return dateFmt.format(new Date(bill.created_at))
  })()

  const printDate = dateFmt.format(new Date())

  return (
    <div className="mx-auto w-full max-w-[210mm] bg-white px-6 py-8 text-black print:px-0 print:py-0">
      {/* Floating print button — hidden when printing */}
      <div
        data-print-control="1"
        className="fixed bottom-6 left-6 z-50 print:hidden"
      >
        <button
          type="button"
          onClick={() => window.print()}
          className="group inline-flex items-center gap-2 rounded-full bg-slate-900 px-5 py-3 text-sm font-semibold text-white shadow-lg ring-1 ring-slate-900/20 transition hover:bg-slate-800 hover:shadow-xl active:scale-[0.98]"
          aria-label="הדפס / הפק PDF"
        >
          <Printer className="size-4" aria-hidden />
          <span>הדפס / הפק PDF</span>
        </button>
      </div>

      <article
        dir="rtl"
        lang="he"
        className="text-[12px] leading-[1.5] text-black"
        aria-label="חשבון חלקי למזמין"
      >
        {/* ============================ Header ============================ */}
        <header className="border-b-2 border-black pb-3">
          <div className="flex items-start justify-between gap-6">
            {/* Issuer (the company / contractor issuing the bill) */}
            <div className="flex items-start gap-3">
              <div
                aria-hidden
                className="flex size-14 shrink-0 items-center justify-center rounded-md border-2 border-black bg-white text-[10px] font-bold tracking-wider text-black"
              >
                לוגו
              </div>
              <div className="space-y-0.5">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-black/60">
                  המבצע (הקבלן הראשי)
                </p>
                <p className="text-[14px] font-bold leading-tight">
                  {company?.name_he ?? "—"}
                </p>
                {company?.name_en ? (
                  <p className="text-[10px] font-mono text-black/70">
                    {company.name_en}
                  </p>
                ) : null}
              </div>
            </div>

            {/* Document title */}
            <div className="text-end">
              <h1 className="border-2 border-black px-5 py-2 text-[18px] font-black tracking-tight">
                חשבון חלקי למזמין
              </h1>
              <p className="mt-1 text-[11px] text-black">
                מסמך מקור · A4 · תאריך הדפסה{" "}
                <span className="font-mono">{printDate}</span>
              </p>
            </div>
          </div>

          {/* Bill classification block */}
          <div className="mt-3 grid grid-cols-4 gap-0 border-2 border-black">
            <DetailCell
              label="חשבון חלקי מס׳"
              value={
                <span className="font-mono text-[14px] font-bold">
                  {bill.bill_number}
                </span>
              }
            />
            <DetailCell
              label="לתקופה"
              value={<span className="font-mono text-[12px]">{periodLabel}</span>}
            />
            <DetailCell
              label="תאריך חשבון"
              value={
                <span className="font-mono">
                  {dateFmt.format(new Date(bill.created_at))}
                </span>
              }
            />
            <DetailCell
              label="סטטוס"
              value={STATUS_HE[bill.status] ?? bill.status}
            />
          </div>

          {/* Buyer / project / contract block */}
          <div className="mt-2 grid grid-cols-3 gap-0 border-2 border-black">
            <DetailCell label="לכבוד המזמין" value={contract?.client_name ?? "—"} />
            <DetailCell label="פרויקט" value={project?.name ?? "—"} />
            <DetailCell
              label="מספר חוזה"
              value={
                <span className="font-mono">
                  {contract?.contract_number ?? "—"}
                </span>
              }
            />
          </div>

          {contract?.title ? (
            <p className="mt-2 text-[11px] text-black/70">
              <span className="font-bold">נושא החוזה:</span> {contract.title}
            </p>
          ) : null}
        </header>

        {/* ============================ Lines table ============================ */}
        <section aria-label="שורות חשבון חלקי" className="mt-4">
          <table className="w-full border-collapse border-2 border-black text-[10.5px]">
            <thead>
              <tr className="bg-slate-100 print:bg-white">
                <Th className="w-[6%]">#</Th>
                <Th className="w-[10%]">BOQ</Th>
                <Th className="w-[28%] text-start">תאור סעיף</Th>
                <Th className="w-[8%]">כמות חוזה</Th>
                <Th className="w-[10%]">מחיר יחידה</Th>
                <Th className="w-[9%]">כמות שהוגשה</Th>
                <Th className="w-[9%]">כמות שאושרה</Th>
                <Th className="w-[10%]">סה״כ שהוגש</Th>
                <Th className="w-[10%]">סה״כ שאושר</Th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={9}
                    className="border border-black px-3 py-3 text-center text-black/70"
                  >
                    לא הוזנו שורות לחשבון
                  </td>
                </tr>
              ) : (
                rows.map(({ bl, cl }) => {
                  const hasDelta = Number(bl.submitted_amount) !== Number(bl.approved_amount)
                  return (
                    <tr key={bl.id} className="break-inside-avoid">
                      <Td className="font-mono tabular-nums">{cl.line_number}</Td>
                      <Td className="font-mono">{cl.boq_ref ?? "—"}</Td>
                      <Td className="text-start">
                        {cl.description}
                        {cl.is_advance_line ? (
                          <span className="ms-2 inline-block rounded border border-amber-400 bg-amber-50 px-1 text-[9px] font-bold text-amber-800 print:bg-white">
                            מקדמה
                          </span>
                        ) : null}
                        {cl.retainage_exempt ? (
                          <span className="ms-2 inline-block rounded border border-slate-400 bg-slate-50 px-1 text-[9px] font-bold text-slate-700 print:bg-white">
                            פטור מעכבון
                          </span>
                        ) : null}
                      </Td>
                      <Td className="font-mono tabular-nums">
                        {num3.format(Number(cl.quantity) || 0)}
                      </Td>
                      <Td className="font-mono tabular-nums">
                        {ils.format(Number(cl.unit_price) || 0)}
                      </Td>
                      <Td className="font-mono tabular-nums">
                        {num3.format(Number(bl.submitted_qty) || 0)}
                      </Td>
                      <Td
                        className={`font-mono tabular-nums ${
                          bl.approved_manual_override ? "bg-amber-50 font-bold print:bg-white" : ""
                        }`}
                      >
                        {num3.format(Number(bl.approved_qty) || 0)}
                      </Td>
                      <Td className="font-mono tabular-nums">
                        {ils.format(Number(bl.submitted_amount) || 0)}
                      </Td>
                      <Td
                        className={`font-mono tabular-nums font-semibold ${
                          hasDelta ? "text-amber-800" : ""
                        }`}
                      >
                        {ils.format(Number(bl.approved_amount) || 0)}
                      </Td>
                    </tr>
                  )
                })
              )}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-black bg-slate-100 print:bg-white">
                <Th colSpan={7} className="text-end">
                  סך ביצוע לתקופה זו
                </Th>
                <Td className="font-mono tabular-nums font-bold">
                  {ils.format(approvedGross > 0 ? Number(bill.submitted_total_amount) || 0 : 0)}
                </Td>
                <Td className="font-mono tabular-nums font-black">
                  {ils.format(approvedGross)}
                </Td>
              </tr>
            </tfoot>
          </table>
        </section>

        {/* ====================== Financial summary ====================== */}
        <section
          aria-label="סיכום פיננסי"
          className="mt-4 break-inside-avoid"
        >
          <div className="border-2 border-black">
            <div className="border-b-2 border-black bg-slate-100 px-3 py-2 text-[12px] font-black print:bg-white">
              סיכום פיננסי — חשבון חלקי למזמין (נטו לתשלום)
            </div>

            <table className="w-full border-collapse text-[12px]">
              <tbody>
                <WaterfallRow
                  label="סה״כ ביצוע מאושר לתקופה"
                  value={approvedGross}
                  bold
                />
                {indexationPct > 0 ? (
                  <WaterfallRow
                    label={`הצמדה (${pct.format(indexationPct)}%)`}
                    value={indexationDelta}
                  />
                ) : null}
                <WaterfallRow
                  label="סה״כ לפני ניכויים"
                  value={indexedApproved}
                  emphasized
                />
                <WaterfallRow
                  label={`פחות עכבון (${pct.format(retentionPct)}%)`}
                  value={-retentionDeducted}
                  negative
                />
                {advancePaymentTotal > 0 ? (
                  <WaterfallRow
                    label={`החזר מקדמה (${pct.format(advanceRepaymentPct)}%)`}
                    value={-advanceRepayment}
                    negative
                    highlight
                  />
                ) : null}
                <WaterfallRow
                  label="נטו לתשלום (לפני מע״מ)"
                  value={netPayable}
                  emphasized
                />
                <WaterfallRow
                  label={`מע״מ (${pct.format(DEFAULT_VAT_PCT)}%)`}
                  value={vatAmount}
                />
                <WaterfallRow
                  label="סה״כ לתשלום (כולל מע״מ)"
                  value={grandTotal}
                  grand
                />
              </tbody>
            </table>
          </div>

          {/* Signature block */}
          <div className="mt-6 grid grid-cols-3 gap-6 print:mt-8">
            <SignatureBox
              label="הקבלן הראשי"
              subLabel={company?.name_he ?? ""}
            />
            <SignatureBox label="מפקח / מנהל פרויקט" subLabel="" />
            <SignatureBox
              label="מטעם המזמין"
              subLabel={contract?.client_name ?? ""}
            />
          </div>
        </section>

        <footer className="mt-6 border-t border-black/30 pt-2 text-center text-[10px] text-black/60">
          חשבון חלקי למזמין · הופק על-ידי מערכת מרקר אופק · {printDate}
        </footer>
      </article>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Sub-components (same primitives as /print/bills/[id] for visual consistency)
// ---------------------------------------------------------------------------

function DetailCell({
  label,
  value,
}: {
  label: string
  value: React.ReactNode
}) {
  return (
    <div className="flex flex-col border border-black px-3 py-2">
      <span className="text-[10px] font-semibold uppercase tracking-wide text-black/60">
        {label}
      </span>
      <span className="mt-0.5 text-[12px] font-medium text-black">{value}</span>
    </div>
  )
}

function Th({
  children,
  className = "",
  colSpan,
}: {
  children: React.ReactNode
  className?: string
  colSpan?: number
}) {
  return (
    <th
      colSpan={colSpan}
      className={`border border-black bg-slate-100 px-2 py-1.5 text-center text-[11px] font-bold print:bg-white ${className}`}
    >
      {children}
    </th>
  )
}

function Td({
  children,
  className = "",
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <td className={`border border-black px-2 py-1.5 text-center ${className}`}>
      {children}
    </td>
  )
}

function WaterfallRow({
  label,
  value,
  bold = false,
  emphasized = false,
  negative = false,
  highlight = false,
  grand = false,
}: {
  label: string
  value: number
  bold?: boolean
  emphasized?: boolean
  negative?: boolean
  highlight?: boolean
  grand?: boolean
}) {
  const rowClass = grand
    ? "border-t-[3px] border-black bg-slate-200 print:bg-white"
    : emphasized
      ? "border-t-2 border-black bg-slate-50 print:bg-white"
      : highlight
        ? "bg-amber-50/60 print:bg-white"
        : ""

  const labelClass = grand
    ? "text-[14px] font-black"
    : emphasized || bold
      ? "text-[12px] font-bold"
      : "text-[12px] font-medium"

  const valueClass = grand
    ? "text-[14px] font-black"
    : emphasized || bold
      ? "text-[12px] font-bold"
      : "text-[12px]"

  return (
    <tr className={`border-b border-black/30 ${rowClass}`}>
      <th scope="row" className={`px-3 py-1.5 text-end ${labelClass}`}>
        {label}
      </th>
      <td
        className={`w-[35%] px-3 py-1.5 text-end font-mono tabular-nums ${valueClass} ${
          negative ? "text-red-700 print:text-black" : ""
        }`}
      >
        {ils.format(value)}
      </td>
    </tr>
  )
}

function SignatureBox({
  label,
  subLabel,
}: {
  label: string
  subLabel: string
}) {
  return (
    <div className="flex flex-col">
      <div
        className="h-16 border-b-2 border-black"
        aria-label={`אזור חתימה — ${label}`}
      />
      <div className="mt-1 flex items-baseline justify-between">
        <span className="text-[11px] font-bold text-black">{label}</span>
        {subLabel ? (
          <span className="text-[10px] text-black/70">{subLabel}</span>
        ) : null}
      </div>
    </div>
  )
}
