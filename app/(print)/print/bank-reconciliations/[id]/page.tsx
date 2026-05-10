"use client"

/**
 * Bank Reconciliation Report — A4 Print Template (Sprint A.1).
 * ----------------------------------------------------------------------------
 * דוח התאמת בנק (חודשי) ב-RTL מלא, פורמט A4 לבן עם בלוקים:
 *   • Header — שם חברה (logo placeholder), כותרת, תקופת ההתאמה.
 *   • Bank account block — בנק / סניף / מספר חשבון / כינוי.
 *   • Reconciliation summary — יתרת ספרים | יתרת בנק | פער | outstanding.
 *   • טבלת שורות דף הבנק — תאריך, אסמכתא, תיאור, חובה, זכות, סטטוס התאמה.
 *   • Footer — שני אזורי חתימה: CFO + רואה חשבון חיצוני.
 * הכפתור הצף "🖨️ הדפס / הפק PDF" נסתר ב-@media print.
 */

import { useParams } from "next/navigation"
import * as React from "react"
import { Loader2, Printer } from "lucide-react"

import { createSupabaseBrowserClient } from "@/lib/supabase/browser"
import { formatError } from "@/lib/utils"

type ReconStatus = "DRAFT" | "IN_REVIEW" | "RECONCILED"

type ReconRow = {
  id: string
  company_id: string
  bank_account_id: string
  statement_id: string
  period_yyyymm: string
  status: ReconStatus
  book_balance: number
  bank_balance: number
  outstanding_total: number
  notes: string | null
  reconciled_at: string | null
  created_at: string
}

type BankAccountRow = {
  id: string
  bank_code: string
  branch: string
  account_number: string
  account_alias: string
  currency: string
}

type StatementRow = {
  id: string
  period_yyyymm: string
  statement_date: string
  opening_balance: number
  closing_balance: number
}

type StatementLineRow = {
  id: string
  line_no: number
  line_date: string
  reference: string | null
  description: string | null
  amount: number
  side: "DEBIT" | "CREDIT"
  matched_journal_entry_id: string | null
  match_confidence: number | null
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

function fmtDate(iso: string): string {
  const d = new Date(iso)
  return new Intl.DateTimeFormat("he-IL", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d)
}

function fmtPeriod(yyyymm: string): string {
  const [y, m] = yyyymm.split("-")
  return `${m}/${y}`
}

export default function BankReconciliationPrintPage() {
  const params = useParams<{ id: string }>()
  const reconId = params?.id ?? ""

  const [recon, setRecon] = React.useState<ReconRow | null>(null)
  const [account, setAccount] = React.useState<BankAccountRow | null>(null)
  const [statement, setStatement] = React.useState<StatementRow | null>(null)
  const [lines, setLines] = React.useState<StatementLineRow[]>([])
  const [company, setCompany] = React.useState<CompanyRow | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!reconId) return
    let cancelled = false

    async function load(): Promise<void> {
      setLoading(true)
      setError(null)
      try {
        const supabase = createSupabaseBrowserClient()
        const { data: r, error: rErr } = await supabase
          .from("erp_bank_reconciliations")
          .select(
            "id, company_id, bank_account_id, statement_id, period_yyyymm, status, book_balance, bank_balance, outstanding_total, notes, reconciled_at, created_at",
          )
          .eq("id", reconId)
          .maybeSingle<ReconRow>()
        if (rErr) throw rErr
        if (!r) throw new Error("דוח התאמת בנק לא נמצא")
        if (cancelled) return

        const [accRes, stmtRes, linesRes, companyRes] = await Promise.all([
          supabase
            .from("erp_bank_accounts")
            .select("id, bank_code, branch, account_number, account_alias, currency")
            .eq("id", r.bank_account_id)
            .maybeSingle<BankAccountRow>(),
          supabase
            .from("erp_bank_statements")
            .select("id, period_yyyymm, statement_date, opening_balance, closing_balance")
            .eq("id", r.statement_id)
            .maybeSingle<StatementRow>(),
          supabase
            .from("erp_bank_statement_lines")
            .select(
              "id, line_no, line_date, reference, description, amount, side, matched_journal_entry_id, match_confidence",
            )
            .eq("statement_id", r.statement_id)
            .order("line_no", { ascending: true }),
          supabase
            .from("erp_companies")
            .select("id, display_name, legal_name, tax_id")
            .eq("id", r.company_id)
            .maybeSingle<CompanyRow>(),
        ])

        if (cancelled) return
        if (accRes.error) throw accRes.error
        if (stmtRes.error) throw stmtRes.error
        if (linesRes.error) throw linesRes.error
        if (companyRes.error) throw companyRes.error

        setRecon(r)
        setAccount(accRes.data)
        setStatement(stmtRes.data)
        setLines((linesRes.data ?? []) as StatementLineRow[])
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
  }, [reconId])

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
  if (error || !recon || !account || !statement || !company) {
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

  const totalDebit = lines
    .filter((l) => l.side === "DEBIT")
    .reduce((s, l) => s + Number(l.amount), 0)
  const totalCredit = lines
    .filter((l) => l.side === "CREDIT")
    .reduce((s, l) => s + Number(l.amount), 0)
  const matchedCount = lines.filter((l) => l.matched_journal_entry_id).length
  const unmatchedCount = lines.length - matchedCount
  const diff = Number(recon.book_balance) - Number(recon.bank_balance)

  return (
    <div dir="rtl" className="min-h-screen bg-white text-slate-900 [color-scheme:light]">
      <style jsx global>{`
        @page {
          size: A4 portrait;
          margin: 12mm 14mm;
        }
        @media print {
          .no-print {
            display: none !important;
          }
          body {
            background: white !important;
          }
        }
        body {
          font-family: "Heebo", "Rubik", system-ui, -apple-system, sans-serif;
        }
      `}</style>

      <button
        type="button"
        onClick={() => window.print()}
        className="no-print fixed bottom-6 left-6 z-50 inline-flex items-center gap-2 rounded-full border border-indigo-300 bg-indigo-600 px-5 py-2.5 text-sm font-bold text-white shadow-lg transition hover:bg-indigo-700"
      >
        <Printer className="size-4" aria-hidden />
        הדפס / הפק PDF
      </button>

      <main className="mx-auto max-w-[210mm] p-8 print:p-0">
        {/* Header */}
        <header className="border-b-2 border-slate-800 pb-4">
          <div className="flex items-start justify-between gap-6">
            <div className="flex-1">
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">
                {company.display_name}
                {company.tax_id ? ` · ח.פ ${company.tax_id}` : ""}
              </p>
              <h1 className="mt-1 text-2xl font-bold tracking-tight">
                דוח התאמת בנק
              </h1>
              <p className="mt-1 text-sm text-slate-700">
                לחודש {fmtPeriod(recon.period_yyyymm)} · נוצר ב-
                {fmtDate(recon.created_at)}
              </p>
            </div>
            <div className="rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-xs">
              <p className="font-mono text-[10px] text-slate-500">סטטוס</p>
              <p className="mt-0.5 font-bold">
                {recon.status === "RECONCILED"
                  ? "מאושר ✓"
                  : recon.status === "IN_REVIEW"
                    ? "בבדיקה"
                    : "טיוטה"}
              </p>
            </div>
          </div>
        </header>

        {/* Bank account block */}
        <section className="mt-5 grid grid-cols-2 gap-4 text-sm">
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
              חשבון בנק
            </p>
            <p className="mt-1 font-bold">{account.account_alias}</p>
            <p className="mt-0.5 font-mono text-xs text-slate-700">
              בנק {account.bank_code} · סניף {account.branch} · חשבון{" "}
              {account.account_number}
            </p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
              דף בנק לתאריך
            </p>
            <p className="mt-1 font-bold">{fmtDate(statement.statement_date)}</p>
            <p className="mt-0.5 text-xs text-slate-700">
              יתרת פתיחה: {ILS.format(Number(statement.opening_balance))} ·
              יתרת סגירה: {ILS.format(Number(statement.closing_balance))}
            </p>
          </div>
        </section>

        {/* Reconciliation summary (waterfall) */}
        <section className="mt-5 rounded-lg border border-slate-300 bg-white p-4">
          <h2 className="text-sm font-bold tracking-tight">סיכום התאמה</h2>
          <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm tabular-nums">
            <div className="text-slate-700">יתרה לפי ספרי החברה (GL)</div>
            <div className="text-end font-mono font-semibold">
              {ILS.format(Number(recon.book_balance))}
            </div>
            <div className="text-slate-700">יתרה לפי דף הבנק</div>
            <div className="text-end font-mono font-semibold">
              {ILS.format(Number(recon.bank_balance))}
            </div>
            <div className="border-t border-slate-200 pt-1.5 font-semibold text-slate-900">
              פער (Δ)
            </div>
            <div
              className={`border-t border-slate-200 pt-1.5 text-end font-mono font-bold ${
                Math.abs(diff) < 0.01 ? "text-emerald-700" : "text-amber-700"
              }`}
            >
              {ILS.format(diff)}
            </div>
            <div className="text-slate-700">סכומים פתוחים (Outstanding)</div>
            <div className="text-end font-mono font-semibold">
              {ILS.format(Number(recon.outstanding_total))}
            </div>
            <div className="text-slate-700">שורות בדף הבנק</div>
            <div className="text-end font-mono">
              {lines.length} ({matchedCount} מותאמות, {unmatchedCount} פתוחות)
            </div>
          </div>
        </section>

        {/* Lines table */}
        <section className="mt-5">
          <h2 className="mb-2 text-sm font-bold tracking-tight">
            שורות דף הבנק
          </h2>
          <table className="w-full border-collapse text-[11px] tabular-nums">
            <thead>
              <tr className="border-b-2 border-slate-800 text-slate-700">
                <th className="px-2 py-1.5 text-start font-semibold">#</th>
                <th className="px-2 py-1.5 text-start font-semibold">תאריך</th>
                <th className="px-2 py-1.5 text-start font-semibold">אסמכתא</th>
                <th className="px-2 py-1.5 text-start font-semibold">תיאור</th>
                <th className="px-2 py-1.5 text-end font-semibold">חובה</th>
                <th className="px-2 py-1.5 text-end font-semibold">זכות</th>
                <th className="px-2 py-1.5 text-center font-semibold">סטטוס</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => (
                <tr key={l.id} className="border-b border-slate-200">
                  <td className="px-2 py-1.5 font-mono text-slate-500">{l.line_no}</td>
                  <td className="px-2 py-1.5">{fmtDate(l.line_date)}</td>
                  <td className="px-2 py-1.5 font-mono text-slate-600">
                    {l.reference ?? "—"}
                  </td>
                  <td className="px-2 py-1.5 text-slate-800">{l.description ?? "—"}</td>
                  <td className="px-2 py-1.5 text-end font-mono">
                    {l.side === "DEBIT" ? ILS0.format(Number(l.amount)) : ""}
                  </td>
                  <td className="px-2 py-1.5 text-end font-mono">
                    {l.side === "CREDIT" ? ILS0.format(Number(l.amount)) : ""}
                  </td>
                  <td className="px-2 py-1.5 text-center">
                    {l.matched_journal_entry_id ? (
                      <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-bold text-emerald-800">
                        מותאם
                      </span>
                    ) : (
                      <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-bold text-amber-800">
                        פתוח
                      </span>
                    )}
                  </td>
                </tr>
              ))}
              <tr className="border-t-2 border-slate-800 font-semibold">
                <td className="px-2 py-2" colSpan={4}>
                  סך הכל ({lines.length} שורות)
                </td>
                <td className="px-2 py-2 text-end font-mono">
                  {ILS0.format(totalDebit)}
                </td>
                <td className="px-2 py-2 text-end font-mono">
                  {ILS0.format(totalCredit)}
                </td>
                <td />
              </tr>
            </tbody>
          </table>
        </section>

        {/* Notes */}
        {recon.notes ? (
          <section className="mt-5 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
              הערות
            </p>
            <p className="mt-1 text-slate-800">{recon.notes}</p>
          </section>
        ) : null}

        {/* Signatures */}
        <section className="mt-12 grid grid-cols-2 gap-12 text-xs">
          <div>
            <div className="h-12 border-b border-slate-400" />
            <p className="mt-1 text-slate-600">חתימת סמנכ&quot;ל הכספים (CFO)</p>
            <p className="mt-0.5 text-[10px] text-slate-500">
              תאריך: __________________
            </p>
          </div>
          <div>
            <div className="h-12 border-b border-slate-400" />
            <p className="mt-1 text-slate-600">חתימת רואה חשבון חיצוני</p>
            <p className="mt-0.5 text-[10px] text-slate-500">
              תאריך: __________________
            </p>
          </div>
        </section>

        <footer className="mt-8 border-t border-slate-200 pt-3 text-[10px] text-slate-500">
          <p>
            הופק מתוך מערכת מרקר אופק ERP · דוח מס&apos; {recon.id.slice(0, 8)} · עמוד 1 מתוך 1
          </p>
        </footer>
      </main>
    </div>
  )
}
