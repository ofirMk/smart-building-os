import type { Metadata } from "next"
import Link from "next/link"

import { getMoVatSummaryByProject } from "@/lib/marker-ofek/finance-reporting-actions"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

export const metadata: Metadata = {
  title: "מע״מ — דוח פלט לפי פרויקט",
}

const ils = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  minimumFractionDigits: 2,
})

export default async function FinanceVatReportPage() {
  const res = await getMoVatSummaryByProject()
  if (!res.ok) {
    return (
      <div className="p-8 rtl" dir="rtl">
        <p className="text-sm text-red-600">{res.error}</p>
      </div>
    )
  }

  const d = res.data

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-8 md:px-6 rtl" dir="rtl">
      <header>
        <Link
          href="/marker-ofek/finance"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← חזרה לחשבוניות
        </Link>
        <h1 className="mt-4 text-2xl font-bold tracking-tight text-[#1e293b]">
          מע״מ — פלט לפי פרויקט
        </h1>
        <p className="mt-2 text-sm text-slate-500">
          אגרגציה מ־<code className="rounded bg-slate-100 px-1 text-xs">mo_invoices</code> בסטטוס
          מאושר/שולם. {d.inputVatNote}
        </p>
      </header>

      <section className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm">
          <p className="text-[11px] font-semibold uppercase text-slate-400">בסיס חייב</p>
          <p className="mt-1 font-currency-mono text-lg font-semibold tabular-nums">
            {ils.format(d.outputSubtotalNis)}
          </p>
        </div>
        <div className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm">
          <p className="text-[11px] font-semibold uppercase text-slate-400">מע״מ פלט</p>
          <p className="mt-1 font-currency-mono text-lg font-semibold tabular-nums">
            {ils.format(d.outputVatNis)}
          </p>
        </div>
        <div className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm">
          <p className="text-[11px] font-semibold uppercase text-slate-400">סה״כ כולל מע״מ</p>
          <p className="mt-1 font-currency-mono text-lg font-semibold tabular-nums">
            {ils.format(d.outputGrandNis)}
          </p>
        </div>
      </section>

      <div className="overflow-x-auto rounded-xl border border-slate-100 bg-white shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>פרויקט</TableHead>
              <TableHead className="text-end">בסיס</TableHead>
              <TableHead className="text-end">מע״מ</TableHead>
              <TableHead className="text-end">סה״כ</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {d.byProject.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-sm text-slate-500">
                  אין חשבוניות מאושרות/שולם עם פרויקט.
                </TableCell>
              </TableRow>
            ) : (
              d.byProject.map((r) => (
                <TableRow key={r.projectId}>
                  <TableCell>
                    <span className="font-mono text-[11px] text-slate-400">{r.projectCode || "—"}</span>
                    <span className="block font-medium">{r.projectName}</span>
                  </TableCell>
                  <TableCell className="text-end font-currency-mono tabular-nums">
                    {ils.format(r.outputSubtotalNis)}
                  </TableCell>
                  <TableCell className="text-end font-currency-mono tabular-nums">
                    {ils.format(r.outputVatNis)}
                  </TableCell>
                  <TableCell className="text-end font-currency-mono tabular-nums">
                    {ils.format(r.outputGrandNis)}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <section className="rounded-xl border border-amber-100 bg-amber-50/50 p-4 text-sm text-amber-950">
        <strong className="font-semibold">ניכוי במקור:</strong> אחוז ברירת מחדל בישות ספק (
        <code className="text-xs">entities.default_withholding_tax_percent</code>) ופרופיל מס (
        <code className="text-xs">supplier_finance_profile</code>
        ). חישוב תשלום: פונקציית{" "}
        <code className="text-xs">computeWithholdingOnPayment</code> ב־
        <code className="text-xs">lib/marker-ofek/israeli-tax-helpers.ts</code>.
      </section>
    </div>
  )
}
