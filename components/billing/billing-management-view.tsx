"use client"

import { CreditCard, Landmark } from "lucide-react"

import type {
  BillingInvoiceRow,
  BillingSummaryMock,
  InvoiceStatusUi,
} from "@/components/billing/billing-mock-data"
import { Button } from "@/components/ui/button"
import { formatNisHe } from "@/lib/format-nis"
import { cn } from "@/lib/utils"

const STATUS_LABEL: Record<InvoiceStatusUi, string> = {
  unpaid: "לא שולם",
  overdue: "בפיגור",
  paid: "שולם",
}

const STATUS_BADGE_CLASS: Record<InvoiceStatusUi, string> = {
  unpaid: "border-amber-500/45 bg-amber-500/15 text-amber-200",
  overdue: "border-red-500/45 bg-red-500/15 text-red-300",
  paid: "border-emerald-500/40 bg-emerald-500/15 text-emerald-300",
}

type BillingManagementViewProps = {
  summary: BillingSummaryMock
  invoices: BillingInvoiceRow[]
}

export function BillingManagementView({
  summary,
  invoices,
}: BillingManagementViewProps) {
  return (
    <div
      className="-mx-4 min-h-[calc(100vh-3.5rem)] bg-[#0a0a0a] px-4 py-6 font-sans text-gray-100 md:-mx-6 md:px-6 md:py-10"
      dir="rtl"
    >
      <header className="mb-8 border-b border-gray-800 pb-8">
        <h1 className="bg-gradient-to-l from-cyan-400 to-blue-600 bg-clip-text text-2xl font-bold text-transparent md:text-3xl">
          ניהול גבייה ותשלומים
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-gray-400">
          סיכום חובות, תשלומים שהתקבלו והוראות קבע פעילות — פרויקט מגורים מרקר
          אופק.
        </p>
      </header>

      <div className="mb-8 grid grid-cols-1 gap-6 md:grid-cols-3">
        <SummaryCard
          title="סה״כ חובות פתוחים"
          value={formatNisHe(summary.totalOutstandingNis)}
          subtitle="סכום ממתין לגבייה בשקלים"
          accent="bg-amber-500"
        />
        <SummaryCard
          title="גבייה החודש"
          value={formatNisHe(summary.collectedThisMonthNis)}
          subtitle="סכום שהתקבל מתחילת החודש"
          accent="bg-emerald-500"
        />
        <SummaryCard
          title="הוראות קבע פעילות"
          value={String(summary.activeDirectDebits)}
          subtitle="דיירים עם הוראת קבע בנקאית פעילה"
          accent="bg-cyan-500"
        />
      </div>

      <div className="overflow-hidden rounded-2xl border border-gray-800 bg-[#111111] shadow-lg">
        <div className="border-b border-gray-800 px-4 py-4 md:px-6">
          <h2 className="text-lg font-semibold text-gray-100">
            חשבוניות ודרישות תשלום
          </h2>
          <p className="mt-1 text-xs text-gray-500">
            נתוני הדגמה — חיבור ל־Supabase יתווסף בהמשך
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[960px] border-collapse text-start text-sm">
            <thead>
              <tr className="border-b border-gray-800 bg-[#141414]">
                <th className="px-3 py-3.5 font-medium text-gray-400 md:px-4">
                  מספר חשבונית / דרישה
                </th>
                <th className="px-3 py-3.5 font-medium text-gray-400 md:px-4">
                  דייר ודירה
                </th>
                <th className="px-3 py-3.5 font-medium text-gray-400 md:px-4">
                  סוג חיוב
                </th>
                <th className="px-3 py-3.5 font-medium text-gray-400 md:px-4">
                  סכום
                </th>
                <th className="px-3 py-3.5 font-medium text-gray-400 md:px-4">
                  תאריך יעד
                </th>
                <th className="px-3 py-3.5 font-medium text-gray-400 md:px-4">
                  סטטוס
                </th>
                <th className="px-3 py-3.5 font-medium text-gray-400 md:px-4">
                  פעולות
                </th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv) => (
                <tr
                  key={inv.sourceId}
                  className="border-b border-gray-800/80 transition-colors hover:bg-[#161616]"
                >
                  <td className="px-3 py-3.5 font-mono text-xs text-gray-200 md:px-4">
                    {inv.invoiceNumber}
                  </td>
                  <td className="max-w-[220px] px-3 py-3.5 text-gray-200 md:px-4">
                    {inv.tenantAndUnit}
                  </td>
                  <td className="px-3 py-3.5 text-gray-300 md:px-4">
                    {inv.chargeTypeHe}
                  </td>
                  <td className="px-3 py-3.5 font-medium tabular-nums text-gray-100 md:px-4">
                    {formatNisHe(inv.amountNis)}
                  </td>
                  <td className="px-3 py-3.5 tabular-nums text-gray-400 md:px-4">
                    {inv.dueDateLabel}
                  </td>
                  <td className="px-3 py-3.5 md:px-4">
                    <span
                      className={cn(
                        "inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium",
                        STATUS_BADGE_CLASS[inv.status]
                      )}
                    >
                      {STATUS_LABEL[inv.status]}
                    </span>
                  </td>
                  <td className="px-3 py-3.5 md:px-4">
                    <InvoiceActions status={inv.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function SummaryCard({
  title,
  value,
  subtitle,
  accent,
}: {
  title: string
  value: string
  subtitle: string
  accent: string
}) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-gray-800 bg-[#111111] p-6 shadow-lg transition-colors hover:border-gray-700">
      <div className={`absolute end-0 top-0 h-full w-1 ${accent}`} />
      <h3 className="mb-2 text-sm font-medium text-gray-400">{title}</h3>
      <div className="mb-2 text-2xl font-bold tabular-nums text-white md:text-3xl">
        {value}
      </div>
      <p className="text-xs text-gray-500">{subtitle}</p>
    </div>
  )
}

function InvoiceActions({ status }: { status: InvoiceStatusUi }) {
  if (status === "paid") {
    return (
      <span className="text-xs text-gray-500" aria-label="אין פעולה">
        —
      </span>
    )
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        type="button"
        size="sm"
        className="gap-1.5 border-0 bg-gradient-to-l from-cyan-500 to-blue-600 text-white shadow-none hover:from-cyan-400 hover:to-blue-500"
      >
        <CreditCard className="size-3.5" aria-hidden />
        לתשלום
      </Button>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="gap-1.5 border-gray-600 bg-transparent text-gray-200 hover:bg-gray-800"
      >
        <Landmark className="size-3.5" aria-hidden />
        הוראת קבע
      </Button>
    </div>
  )
}
