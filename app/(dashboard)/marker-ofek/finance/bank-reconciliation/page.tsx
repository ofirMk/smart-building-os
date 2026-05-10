/**
 * Bank Reconciliation Workspace — Sprint A.1.
 *
 * Production surface (not the investor mock). Lists every bank reconciliation
 * for the active company, with KPIs (book vs bank balance, outstanding total,
 * matched/unmatched lines) and a link to the printable PDF report.
 *
 * The full 2-pane drag-match UI is the next iteration; this MVP page surfaces
 * the data and lets the operator launch the matching engine + open the PDF.
 */
import Link from "next/link"
import { Landmark, Printer, RefreshCcw } from "lucide-react"

import { cookies } from "next/headers"

import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { COMPANY_COOKIE_KEY, resolveCompanyContext } from "@/lib/company-context"
import { createSupabaseServerAuthClient } from "@/lib/supabase/server-auth"

export const dynamic = "force-dynamic"

const ILS = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 0,
})

type ReconRow = {
  id: string
  period_yyyymm: string
  status: "DRAFT" | "IN_REVIEW" | "RECONCILED"
  book_balance: number
  bank_balance: number
  outstanding_total: number
  bank_account_id: string
  statement_id: string
  reconciled_at: string | null
}

type AccountRow = {
  id: string
  account_alias: string
  bank_code: string
  branch: string
  account_number: string
}

type StatementCounts = {
  statement_id: string
  total_lines: number
  matched_lines: number
}

function fmtPeriod(yyyymm: string): string {
  const [y, m] = yyyymm.split("-")
  return `${m}/${y}`
}

function statusBadge(status: ReconRow["status"]): {
  label: string
  cls: string
} {
  switch (status) {
    case "RECONCILED":
      return {
        label: "מאושר",
        cls: "bg-emerald-50 text-emerald-800 border-emerald-200",
      }
    case "IN_REVIEW":
      return {
        label: "בבדיקה",
        cls: "bg-amber-50 text-amber-800 border-amber-200",
      }
    default:
      return { label: "טיוטה", cls: "bg-slate-50 text-slate-700 border-slate-200" }
  }
}

export default async function BankReconciliationWorkspacePage() {
  const supabase = await createSupabaseServerAuthClient()
  const cookieStore = await cookies()
  const companyId = resolveCompanyContext(
    cookieStore.get(COMPANY_COOKIE_KEY)?.value,
  )

  if (!companyId) {
    return (
      <div dir="rtl" className="p-6 text-sm text-slate-700">
        לא נמצא הקשר חברה פעיל.
      </div>
    )
  }

  const [reconRes, acctRes] = await Promise.all([
    supabase
      .from("erp_bank_reconciliations")
      .select(
        "id, period_yyyymm, status, book_balance, bank_balance, outstanding_total, bank_account_id, statement_id, reconciled_at",
      )
      .eq("company_id", companyId)
      .order("period_yyyymm", { ascending: false })
      .limit(24),
    supabase
      .from("erp_bank_accounts")
      .select("id, account_alias, bank_code, branch, account_number")
      .eq("company_id", companyId)
      .eq("is_active", true),
  ])

  const recons = (reconRes.data ?? []) as ReconRow[]
  const accounts = (acctRes.data ?? []) as AccountRow[]
  const accountMap = new Map(accounts.map((a) => [a.id, a]))

  // Compute matched/unmatched per statement
  const statementIds = recons.map((r) => r.statement_id)
  let counts: StatementCounts[] = []
  if (statementIds.length > 0) {
    const { data: lines } = await supabase
      .from("erp_bank_statement_lines")
      .select("statement_id, matched_journal_entry_id")
      .eq("company_id", companyId)
      .in("statement_id", statementIds)

    const byStmt = new Map<string, { total: number; matched: number }>()
    for (const l of (lines ?? []) as {
      statement_id: string
      matched_journal_entry_id: string | null
    }[]) {
      const cur = byStmt.get(l.statement_id) ?? { total: 0, matched: 0 }
      cur.total += 1
      if (l.matched_journal_entry_id) cur.matched += 1
      byStmt.set(l.statement_id, cur)
    }
    counts = [...byStmt.entries()].map(([statement_id, v]) => ({
      statement_id,
      total_lines: v.total,
      matched_lines: v.matched,
    }))
  }
  const countsMap = new Map(counts.map((c) => [c.statement_id, c]))

  return (
    <div dir="rtl" className="flex min-h-0 flex-1 flex-col gap-4 p-4 sm:p-6">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
        <div className="flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-xl border border-indigo-200 bg-indigo-50 text-indigo-700">
            <Landmark className="size-5" aria-hidden />
          </span>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-foreground">
              התאמת בנקים
            </h1>
            <p className="text-xs text-muted-foreground">
              Sprint A.1 · סגירה פיננסית — שורות בנק מול תנועות GL.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-2"
            render={<Link href="/marker-ofek/admin/import" />}
          >
            <RefreshCcw className="size-4" aria-hidden />
            ייבוא דף בנק (CSV)
          </Button>
        </div>
      </header>

      {recons.length === 0 ? (
        <Card className="flex flex-col items-center justify-center gap-2 p-10 text-center text-sm text-muted-foreground">
          <p className="font-semibold text-foreground">אין דוחות התאמה עדיין</p>
          <p>
            ייבא דף בנק כדי ליצור דוח התאמה אוטומטי לחודש המבוקש. עד אז ה-CFO
            לא יכול לסגור חודש פיננסי.
          </p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {recons.map((r) => {
            const acct = accountMap.get(r.bank_account_id)
            const cnt = countsMap.get(r.statement_id)
            const diff = Number(r.book_balance) - Number(r.bank_balance)
            const aligned = Math.abs(diff) < 0.01
            const badge = statusBadge(r.status)
            return (
              <Card key={r.id} className="flex flex-col gap-3 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-xs font-mono text-slate-500">
                      {acct?.account_alias ?? "חשבון לא נמצא"}
                    </p>
                    <h2 className="text-base font-bold tracking-tight">
                      {fmtPeriod(r.period_yyyymm)}
                    </h2>
                  </div>
                  <span
                    className={`rounded-full border px-2.5 py-0.5 text-[10px] font-bold ${badge.cls}`}
                  >
                    {badge.label}
                  </span>
                </div>

                <dl className="grid grid-cols-2 gap-y-1 text-xs tabular-nums">
                  <dt className="text-slate-600">יתרת ספרים</dt>
                  <dd className="text-end font-mono font-semibold">
                    {ILS.format(Number(r.book_balance))}
                  </dd>
                  <dt className="text-slate-600">יתרת בנק</dt>
                  <dd className="text-end font-mono font-semibold">
                    {ILS.format(Number(r.bank_balance))}
                  </dd>
                  <dt className="font-semibold text-slate-900">פער</dt>
                  <dd
                    className={`text-end font-mono font-bold ${
                      aligned ? "text-emerald-700" : "text-amber-700"
                    }`}
                  >
                    {ILS.format(diff)}
                  </dd>
                  {cnt ? (
                    <>
                      <dt className="text-slate-600">שורות מותאמות</dt>
                      <dd className="text-end font-mono">
                        {cnt.matched_lines} / {cnt.total_lines}
                      </dd>
                    </>
                  ) : null}
                </dl>

                <div className="mt-1 flex items-center justify-end gap-2 border-t border-slate-100 pt-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-2"
                    render={
                      <a
                        href={`/print/bank-reconciliations/${r.id}`}
                        target="_blank"
                        rel="noreferrer"
                      />
                    }
                  >
                    <Printer className="size-4" aria-hidden />
                    דוח PDF
                  </Button>
                </div>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
