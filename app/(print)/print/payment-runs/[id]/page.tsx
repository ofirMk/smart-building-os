"use client"

/**
 * AP Payment Run — A4 Print Template (Sprint A.2).
 * ----------------------------------------------------------------------------
 * דוח הרצת תשלומים יוקרתי בעברית RTL לפורמט A4. כולל:
 *   • Header — לוגו/חברה, מספר הרצה, סה"כ, סטטוס, תאריך, אסמכתא מס"ב.
 *   • Bank account block — בנק / סניף / חשבון תפעולי.
 *   • טבלת תשלומים — ספק, מס' חשבונית, סכום, חשבון בנק יעד.
 *   • Summary — סך הרצה + מספר רשומות.
 *   • שני בלוקי חתימה: CFO + מורשה חתימה שני.
 * הכפתור הצף "🖨️ הדפס / הפק PDF" נסתר ב-@media print.
 */

import { useParams } from "next/navigation"
import * as React from "react"
import { Loader2, Printer } from "lucide-react"

import { createSupabaseBrowserClient } from "@/lib/supabase/browser"
import { formatError } from "@/lib/utils"

type RunRow = {
  id: string
  company_id: string
  run_number: string
  run_date: string
  payment_method: string
  status: string
  total_amount: number
  bank_account_id: string
  reference_number: string | null
  masav_file_path: string | null
  notes: string | null
  approved_at: string | null
  executed_at: string | null
}

type BankAccountRow = {
  bank_code: string
  branch: string
  account_number: string
  account_alias: string
}

type PaymentRow = {
  id: string
  amount: number
  payment_date: string
  masav_record_seq: number | null
  reference: string | null
  status: string
  vendor_invoice_id: string
  supplier_id: string
}

type SupplierRow = {
  id: string
  supplier_number: string
  name: string
  bank_code: string | null
  bank_branch: string | null
  bank_account_number: string | null
}

type InvoiceRow = {
  id: string
  invoice_number: string
}

type CompanyRow = {
  id: string
  display_name: string
  legal_name: string | null
  tax_id: string | null
}

const ILS = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 2,
})

const ILS0 = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 0,
})

function fmtDate(iso: string | null): string {
  if (!iso) return "—"
  return new Intl.DateTimeFormat("he-IL", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso))
}

const STATUS_LABEL: Record<string, string> = {
  DRAFT: "טיוטה",
  APPROVED: "אושר",
  EXECUTED: "בוצע",
  RECONCILED: "הותאם בנק",
  CANCELLED: "בוטל",
}

const METHOD_LABEL: Record<string, string> = {
  MASAV: "מס\"ב",
  CHECK: "צ'ק",
  WIRE: "העברה בנקאית",
  CREDIT_CARD: "כרטיס אשראי",
}

export default function PaymentRunPrintPage() {
  const params = useParams<{ id: string }>()
  const runId = params?.id ?? ""

  const [run, setRun] = React.useState<RunRow | null>(null)
  const [bank, setBank] = React.useState<BankAccountRow | null>(null)
  const [payments, setPayments] = React.useState<PaymentRow[]>([])
  const [suppliers, setSuppliers] = React.useState<Map<string, SupplierRow>>(
    new Map(),
  )
  const [invoices, setInvoices] = React.useState<Map<string, InvoiceRow>>(
    new Map(),
  )
  const [company, setCompany] = React.useState<CompanyRow | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!runId) return
    let cancelled = false

    async function load(): Promise<void> {
      setLoading(true)
      setError(null)
      try {
        const supabase = createSupabaseBrowserClient()
        const { data: r, error: rErr } = await supabase
          .from("erp_ap_payment_runs")
          .select(
            "id, company_id, run_number, run_date, payment_method, status, total_amount, bank_account_id, reference_number, masav_file_path, notes, approved_at, executed_at",
          )
          .eq("id", runId)
          .maybeSingle<RunRow>()
        if (rErr) throw rErr
        if (!r) throw new Error("הרצת תשלומים לא נמצאה")
        if (cancelled) return

        const [bankRes, paymentsRes, companyRes] = await Promise.all([
          supabase
            .from("erp_bank_accounts")
            .select("bank_code, branch, account_number, account_alias")
            .eq("id", r.bank_account_id)
            .maybeSingle<BankAccountRow>(),
          supabase
            .from("erp_ap_payments")
            .select(
              "id, amount, payment_date, masav_record_seq, reference, status, vendor_invoice_id, supplier_id",
            )
            .eq("run_id", r.id)
            .order("masav_record_seq", { ascending: true, nullsFirst: false }),
          supabase
            .from("erp_companies")
            .select("id, display_name, legal_name, tax_id")
            .eq("id", r.company_id)
            .maybeSingle<CompanyRow>(),
        ])
        if (cancelled) return
        if (bankRes.error) throw bankRes.error
        if (paymentsRes.error) throw paymentsRes.error
        if (companyRes.error) throw companyRes.error

        const ps = (paymentsRes.data ?? []) as PaymentRow[]
        const supplierIds = [...new Set(ps.map((p) => p.supplier_id))]
        const invoiceIds = [...new Set(ps.map((p) => p.vendor_invoice_id))]

        const [supRes, invRes] = await Promise.all([
          supplierIds.length === 0
            ? Promise.resolve({ data: [] as SupplierRow[], error: null })
            : supabase
                .from("erp_md_suppliers")
                .select(
                  "id, supplier_number, name, bank_code, bank_branch, bank_account_number",
                )
                .in("id", supplierIds),
          invoiceIds.length === 0
            ? Promise.resolve({ data: [] as InvoiceRow[], error: null })
            : supabase
                .from("erp_vendor_invoices")
                .select("id, invoice_number")
                .in("id", invoiceIds),
        ])
        if (cancelled) return
        if (supRes.error) throw supRes.error
        if (invRes.error) throw invRes.error

        const supMap = new Map<string, SupplierRow>()
        for (const s of (supRes.data ?? []) as SupplierRow[]) supMap.set(s.id, s)
        const invMap = new Map<string, InvoiceRow>()
        for (const i of (invRes.data ?? []) as InvoiceRow[]) invMap.set(i.id, i)

        setRun(r)
        setBank(bankRes.data)
        setPayments(ps)
        setSuppliers(supMap)
        setInvoices(invMap)
        setCompany(companyRes.data)
      } catch (err) {
        if (!cancelled) setError(formatError(err))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [runId])

  if (loading) {
    return (
      <div
        dir="rtl"
        className="flex min-h-screen items-center justify-center bg-white text-slate-900"
      >
        <Loader2 className="size-6 animate-spin text-slate-400" aria-hidden />
      </div>
    )
  }
  if (error || !run || !bank || !company) {
    return (
      <div
        dir="rtl"
        className="flex min-h-screen items-center justify-center bg-white p-8 text-center text-slate-900"
      >
        <div>
          <h1 className="text-lg font-bold">לא ניתן להפיק את הדוח</h1>
          <p className="mt-2 text-sm text-slate-600">
            {error ?? "מסמך לא נמצא או חסרים נתונים."}
          </p>
        </div>
      </div>
    )
  }

  const totalSum = payments.reduce((s, p) => s + Number(p.amount), 0)
  const isExecuted = run.status === "EXECUTED" || run.status === "RECONCILED"

  return (
    <div dir="rtl" className="min-h-screen bg-white text-slate-900 [color-scheme:light]">
      <style jsx global>{`
        @page {
          size: A4 portrait;
          margin: 12mm 14mm;
        }
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; }
        }
        body {
          font-family: "Heebo", "Rubik", system-ui, -apple-system, sans-serif;
        }
      `}</style>

      <button
        type="button"
        onClick={() => window.print()}
        className="no-print fixed bottom-6 left-6 z-50 inline-flex items-center gap-2 rounded-full border border-emerald-300 bg-emerald-600 px-5 py-2.5 text-sm font-bold text-white shadow-lg transition hover:bg-emerald-700"
      >
        <Printer className="size-4" aria-hidden />
        הדפס / הפק PDF
      </button>

      <main className="mx-auto max-w-[210mm] p-8 print:p-0">
        {/* Header */}
        <header className="border-b-2 border-emerald-700 pb-4">
          <div className="flex items-start justify-between gap-6">
            <div className="flex-1">
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-emerald-700">
                {company.display_name}
                {company.tax_id ? ` · ח.פ ${company.tax_id}` : ""}
              </p>
              <h1 className="mt-1 text-2xl font-bold tracking-tight">
                דוח הרצת תשלומים — {run.run_number}
              </h1>
              <p className="mt-1 text-sm text-slate-700">
                שיטת תשלום: {METHOD_LABEL[run.payment_method] ?? run.payment_method} ·
                תאריך הרצה: {fmtDate(run.run_date)}
              </p>
            </div>
            <div className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs">
              <p className="font-mono text-[10px] text-emerald-700">סטטוס</p>
              <p className="mt-0.5 font-bold text-emerald-900">
                {STATUS_LABEL[run.status] ?? run.status}
                {isExecuted ? " ✓" : ""}
              </p>
            </div>
          </div>
        </header>

        {/* Source bank account + Run meta */}
        <section className="mt-5 grid grid-cols-2 gap-4 text-sm">
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
              חשבון מקור (חברה)
            </p>
            <p className="mt-1 font-bold">{bank.account_alias}</p>
            <p className="mt-0.5 font-mono text-xs text-slate-700">
              בנק {bank.bank_code} · סניף {bank.branch} · חשבון{" "}
              {bank.account_number}
            </p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
              מס&quot;ב / אסמכתא
            </p>
            <p className="mt-1 font-bold">
              {run.reference_number ?? "—"}
            </p>
            {run.masav_file_path ? (
              <p className="mt-0.5 font-mono text-[11px] text-slate-700">
                קובץ: {run.masav_file_path}
              </p>
            ) : null}
            <p className="mt-0.5 text-[11px] text-slate-700">
              אושר: {fmtDate(run.approved_at)} · בוצע: {fmtDate(run.executed_at)}
            </p>
          </div>
        </section>

        {/* Payments table */}
        <section className="mt-5">
          <h2 className="mb-2 text-sm font-bold tracking-tight">
            תשלומים ({payments.length})
          </h2>
          <table className="w-full border-collapse text-[11px] tabular-nums">
            <thead>
              <tr className="border-b-2 border-emerald-700 text-slate-700">
                <th className="px-2 py-1.5 text-start font-semibold">#</th>
                <th className="px-2 py-1.5 text-start font-semibold">ספק</th>
                <th className="px-2 py-1.5 text-start font-semibold">חשבונית</th>
                <th className="px-2 py-1.5 text-start font-semibold">בנק יעד</th>
                <th className="px-2 py-1.5 text-end font-semibold">סכום</th>
                <th className="px-2 py-1.5 text-center font-semibold">סטטוס</th>
              </tr>
            </thead>
            <tbody>
              {payments.map((p, idx) => {
                const sup = suppliers.get(p.supplier_id)
                const inv = invoices.get(p.vendor_invoice_id)
                return (
                  <tr key={p.id} className="border-b border-slate-200">
                    <td className="px-2 py-1.5 font-mono text-slate-500">
                      {p.masav_record_seq ?? idx + 1}
                    </td>
                    <td className="px-2 py-1.5">
                      <div className="font-semibold">{sup?.name ?? "—"}</div>
                      <div className="font-mono text-[10px] text-slate-500">
                        {sup?.supplier_number ?? "—"}
                      </div>
                    </td>
                    <td className="px-2 py-1.5 font-mono text-slate-700">
                      {inv?.invoice_number ?? "—"}
                    </td>
                    <td className="px-2 py-1.5 font-mono text-slate-700">
                      {sup?.bank_code && sup?.bank_branch && sup?.bank_account_number
                        ? `${sup.bank_code}-${sup.bank_branch}-${sup.bank_account_number}`
                        : "—"}
                    </td>
                    <td className="px-2 py-1.5 text-end font-mono">
                      {ILS0.format(Number(p.amount))}
                    </td>
                    <td className="px-2 py-1.5 text-center">
                      <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-bold text-emerald-800">
                        {STATUS_LABEL[p.status] ?? p.status}
                      </span>
                    </td>
                  </tr>
                )
              })}
              <tr className="border-t-2 border-emerald-700 font-semibold">
                <td className="px-2 py-2" colSpan={4}>
                  סך הכל ({payments.length} תשלומים)
                </td>
                <td className="px-2 py-2 text-end font-mono text-base">
                  {ILS.format(totalSum)}
                </td>
                <td />
              </tr>
            </tbody>
          </table>
        </section>

        {/* Notes */}
        {run.notes ? (
          <section className="mt-5 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
              הערות
            </p>
            <p className="mt-1 text-slate-800">{run.notes}</p>
          </section>
        ) : null}

        {/* Signatures */}
        <section className="mt-12 grid grid-cols-2 gap-12 text-xs">
          <div>
            <div className="h-12 border-b border-slate-400" />
            <p className="mt-1 text-slate-600">חתימת סמנכ&quot;ל הכספים (CFO)</p>
            <p className="mt-0.5 text-[10px] text-slate-500">תאריך: __________________</p>
          </div>
          <div>
            <div className="h-12 border-b border-slate-400" />
            <p className="mt-1 text-slate-600">חתימת מורשה חתימה שני</p>
            <p className="mt-0.5 text-[10px] text-slate-500">תאריך: __________________</p>
          </div>
        </section>

        <footer className="mt-8 border-t border-slate-200 pt-3 text-[10px] text-slate-500">
          <p>
            הופק מתוך מערכת מרקר אופק ERP · הרצה {run.run_number} (#{run.id.slice(0, 8)}) · עמוד 1 מתוך 1
          </p>
        </footer>
      </main>
    </div>
  )
}
