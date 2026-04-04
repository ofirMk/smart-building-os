"use client"

import * as React from "react"
import { Loader2 } from "lucide-react"
import { toast } from "sonner"

import {
  getVatReadinessForMonth,
  type VatReadinessPayload,
} from "@/lib/marker-ofek/vat-readiness-actions"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { formatError } from "@/lib/utils"

const ils = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 0,
})

export function VatReadinessClient({ initialMonth }: { initialMonth: string }) {
  const [month, setMonth] = React.useState(initialMonth)
  const [data, setData] = React.useState<VatReadinessPayload | null>(null)
  const [loading, setLoading] = React.useState(false)

  async function load(m: string) {
    setLoading(true)
    try {
      const res = await getVatReadinessForMonth(m)
      if (!res.ok) {
        toast.error(res.error)
        setData(null)
        return
      }
      setData(res.data)
    } catch (e) {
      toast.error(formatError(e))
    } finally {
      setLoading(false)
    }
  }

  React.useEffect(() => {
    void load(month)
  }, [month])

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-8 pb-16" dir="rtl">
      <header className="pharmacy-hero-card border-slate-100 p-6 md:p-8">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-indigo-700">
          ציות מס — ישראל
        </p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-indigo-950">
          מוכנות מע״מ חודשית (עסקאות ותשומות)
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-slate-500">
          עסקאות: <code className="text-xs">mo_invoices</code> לפי תאריך הנפקה. תשומות:{" "}
          <code className="text-xs">supplier_invoices</code> — מע״מ מפורש או הערכה לפי מע״מ
          ברירת מחדל מהפרופיל. ניכוי במקור: פרוקסי מ-PO שנוצרו בחודש.
        </p>
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <div className="grid gap-2">
            <Label htmlFor="vat-month">חודש</Label>
            <Input
              id="vat-month"
              type="month"
              className="w-44 font-currency-mono"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
            />
          </div>
          <Button
            type="button"
            variant="outline"
            className="border-slate-200"
            disabled={loading}
            onClick={() => void load(month)}
          >
            {loading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
            רענון
          </Button>
        </div>
      </header>

      {data ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <section className="rounded-xl border border-emerald-100 bg-emerald-50/30 p-5">
            <h2 className="text-sm font-semibold text-emerald-950">עסקאות (פלט)</h2>
            <p className="mt-1 text-xs text-emerald-800/80">
              {data.outputInvoiceCount} חשבוניות · מע״מ ברירת מחדל לתשומות:{" "}
              {data.defaultVatRatePercent}%
            </p>
            <p className="mt-3 font-currency-mono text-lg font-semibold tabular-nums text-emerald-950">
              בסיס: {ils.format(data.outputNetNis)}
            </p>
            <p className="mt-1 font-currency-mono text-lg font-semibold tabular-nums text-emerald-900">
              מע״מ: {ils.format(data.outputVatNis)}
            </p>
          </section>
          <section className="rounded-xl border border-sky-100 bg-sky-50/30 p-5">
            <h2 className="text-sm font-semibold text-sky-950">תשומות (קלט)</h2>
            <p className="mt-1 text-xs text-sky-800/80">{data.inputInvoiceCount} חשבוניות ספק</p>
            <p className="mt-3 font-currency-mono text-lg font-semibold tabular-nums text-sky-950">
              בסיס משוער: {ils.format(data.inputNetNis)}
            </p>
            <p className="mt-1 font-currency-mono text-lg font-semibold tabular-nums text-sky-900">
              מע״מ: {ils.format(data.inputVatNis)}
            </p>
          </section>
          <section className="rounded-xl border border-amber-100 bg-amber-50/30 p-5 sm:col-span-2">
            <h2 className="text-sm font-semibold text-amber-950">ניכוי במקור (פרוקסי מ-PO)</h2>
            <p className="mt-1 text-xs text-amber-900/80">
              {data.poWithholdingRows} הזמנות עם אחוז ניכוי &gt; 0 שנוצרו בחודש {data.monthKey}
            </p>
            <p className="mt-3 font-currency-mono text-xl font-semibold tabular-nums text-amber-950">
              {ils.format(data.withholdingFromPosNis)}
            </p>
          </section>
        </div>
      ) : loading ? (
        <p className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="size-4 animate-spin" aria-hidden />
          טוען…
        </p>
      ) : null}
    </div>
  )
}
