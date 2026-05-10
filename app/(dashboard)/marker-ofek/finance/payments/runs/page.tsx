/**
 * AP Payment Runs Workspace — Sprint A.2.
 *
 * Lists every payment run with its status, total, and link to the printable
 * payment-run report. The "New Payment Run" wizard is rendered as a client
 * component (PaymentRunCreator) below.
 *
 * Production surface; not a mock.
 */
import { cookies } from "next/headers"
import Link from "next/link"
import { ListChecks, Plus, Printer, Wallet } from "lucide-react"

import { PaymentRunCreator } from "@/components/marker-ofek/finance/payments/payment-run-creator"
import { Badge } from "@/components/ui/badge"
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

const dateFmt = new Intl.DateTimeFormat("he-IL", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
})

type RunRow = {
  id: string
  run_number: string
  run_date: string
  payment_method: string
  status: string
  total_amount: number
  bank_account_id: string
  masav_file_path: string | null
}

type BankAccountRow = {
  id: string
  account_alias: string
}

type InvoiceRow = {
  id: string
  invoice_number: string
  total_amount: number
  invoice_date: string | null
  supplier_id: string
  status: string
}

type SupplierRow = {
  id: string
  name: string
  supplier_number: string
}

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  DRAFT: { label: "טיוטה", cls: "bg-slate-100 text-slate-800" },
  APPROVED: { label: "אושר", cls: "bg-amber-100 text-amber-900" },
  EXECUTED: { label: "בוצע", cls: "bg-emerald-100 text-emerald-900" },
  RECONCILED: { label: "הותאם בנק", cls: "bg-indigo-100 text-indigo-900" },
  CANCELLED: { label: "בוטל", cls: "bg-rose-100 text-rose-900" },
}

export default async function PaymentRunsPage() {
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

  const supabase = await createSupabaseServerAuthClient()
  const [runsRes, accountsRes, invoicesRes, suppliersRes] = await Promise.all([
    supabase
      .from("erp_ap_payment_runs")
      .select(
        "id, run_number, run_date, payment_method, status, total_amount, bank_account_id, masav_file_path",
      )
      .eq("company_id", companyId)
      .order("run_date", { ascending: false })
      .limit(50),
    supabase
      .from("erp_bank_accounts")
      .select("id, account_alias")
      .eq("company_id", companyId)
      .eq("is_active", true)
      .order("account_alias", { ascending: true }),
    supabase
      .from("erp_vendor_invoices")
      .select("id, invoice_number, total_amount, invoice_date, supplier_id, status")
      .eq("company_id", companyId)
      .in("status", ["APPROVED", "READY_FOR_PAYMENT", "MATCHED"])
      .order("invoice_date", { ascending: true })
      .limit(200),
    supabase
      .from("erp_md_suppliers")
      .select("id, name, supplier_number")
      .eq("company_id", companyId)
      .limit(500),
  ])

  const runs = (runsRes.data ?? []) as RunRow[]
  const accounts = (accountsRes.data ?? []) as BankAccountRow[]
  const invoices = (invoicesRes.data ?? []) as InvoiceRow[]
  const suppliers = (suppliersRes.data ?? []) as SupplierRow[]
  const supplierMap = new Map(suppliers.map((s) => [s.id, s]))
  const accountMap = new Map(accounts.map((a) => [a.id, a]))

  const eligibleInvoices = invoices.map((i) => ({
    id: i.id,
    invoiceNumber: i.invoice_number,
    invoiceDate: i.invoice_date,
    totalAmount: Number(i.total_amount),
    supplierId: i.supplier_id,
    supplierName: supplierMap.get(i.supplier_id)?.name ?? "—",
    supplierNumber: supplierMap.get(i.supplier_id)?.supplier_number ?? "—",
  }))

  return (
    <div dir="rtl" className="flex min-h-0 flex-1 flex-col gap-4 p-4 sm:p-6">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
        <div className="flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-700">
            <Wallet className="size-5" aria-hidden />
          </span>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-foreground">
              הרצות תשלום (AP Payment Runs)
            </h1>
            <p className="text-xs text-muted-foreground">
              Sprint A.2 · מס&quot;ב + תשלומי ספקים. סוגרים את הלולאה מ-AP ל-bank.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <PaymentRunCreator
            bankAccounts={accounts.map((a) => ({
              id: a.id,
              alias: a.account_alias,
            }))}
            invoices={eligibleInvoices}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-2"
            render={<Link href="/marker-ofek/finance/bank-reconciliation" />}
          >
            <ListChecks className="size-4" aria-hidden />
            התאמת בנקים
          </Button>
        </div>
      </header>

      {runs.length === 0 ? (
        <Card className="flex flex-col items-center justify-center gap-2 p-10 text-center text-sm text-muted-foreground">
          <Plus className="size-6 text-slate-400" aria-hidden />
          <p className="font-semibold text-foreground">אין הרצות תשלום עדיין</p>
          <p>
            צרו הרצה חדשה כדי לאחד חשבוניות מאושרות לקובץ מס&quot;ב יחיד.
          </p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {runs.map((r) => {
            const badge = STATUS_BADGE[r.status] ?? {
              label: r.status,
              cls: "bg-slate-100 text-slate-800",
            }
            const acct = accountMap.get(r.bank_account_id)
            return (
              <Card key={r.id} className="flex flex-col gap-3 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-xs font-mono text-slate-500">
                      {r.payment_method} · {acct?.account_alias ?? "—"}
                    </p>
                    <h2 className="text-base font-bold tracking-tight">
                      {r.run_number}
                    </h2>
                    <p className="text-xs text-slate-600">
                      תאריך: {dateFmt.format(new Date(r.run_date))}
                    </p>
                  </div>
                  <Badge className={badge.cls}>{badge.label}</Badge>
                </div>
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                    סכום הרצה
                  </p>
                  <p className="font-mono text-lg font-bold tabular-nums">
                    {ILS.format(Number(r.total_amount))}
                  </p>
                </div>
                {r.masav_file_path ? (
                  <p className="font-mono text-[10px] text-slate-500">
                    קובץ מס&quot;ב: {r.masav_file_path}
                  </p>
                ) : null}
                <div className="mt-1 flex items-center justify-end gap-2 border-t border-slate-100 pt-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-2"
                    render={
                      <a
                        href={`/print/payment-runs/${r.id}`}
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
