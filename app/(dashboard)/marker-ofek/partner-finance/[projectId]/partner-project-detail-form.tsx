"use client"

import * as React from "react"
import { Loader2 } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  type PartnerProjectRow,
  updatePartnerProjectManualCosts,
} from "@/lib/marker-ofek/partner-metrics-actions"
import { formatError } from "@/lib/utils"

type Props = {
  projectId: string
  initialRow: PartnerProjectRow
}

export function PartnerProjectDetailForm({ projectId, initialRow }: Props) {
  const [sub, setSub] = React.useState(String(initialRow.subconCosts))
  const [petty, setPetty] = React.useState(String(initialRow.pettyCash))
  const [oh, setOh] = React.useState(String(initialRow.siteOverhead))
  const [pending, setPending] = React.useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setPending(true)
    try {
      const res = await updatePartnerProjectManualCosts({
        projectId,
        partner_cost_subcontractors: Number(sub) || 0,
        partner_cost_petty_cash: Number(petty) || 0,
        partner_cost_site_overhead: Number(oh) || 0,
      })
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      toast.success("העלויות נשמרו.")
      window.location.reload()
    } catch (err) {
      toast.error(formatError(err))
    } finally {
      setPending(false)
    }
  }

  return (
    <section className="rounded-xl border border-slate-100 bg-white p-6 shadow-sm">
      <h2 className="mb-2 text-sm font-semibold text-[#1e293b]">עדכון עלויות (ידני)</h2>
      <p className="mb-4 text-xs leading-relaxed text-slate-400">
        חברות ביצוע, קופה קטנה ועלות אתר. שכר: אם הוזן ערך חיובי ב־<code className="rounded bg-slate-100 px-1">partner_cost_employee_salaries</code>{" "}
        בפרויקט — נלקח כעקיפת גנט; אחרת נספר אוטומטית משיבוצי גנט.
      </p>
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <div className="grid gap-2">
          <Label htmlFor="pf-sub" className="text-slate-500">
            חברות ביצוע (₪)
          </Label>
          <Input
            id="pf-sub"
            type="number"
            min={0}
            step={0.01}
            dir="ltr"
            className="border-slate-200 bg-white font-currency-mono text-[#1e293b]"
            value={sub}
            onChange={(e) => setSub(e.target.value)}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="pf-petty" className="text-slate-500">
            קופה קטנה (₪)
          </Label>
          <Input
            id="pf-petty"
            type="number"
            min={0}
            step={0.01}
            dir="ltr"
            className="border-slate-200 bg-white font-currency-mono text-[#1e293b]"
            value={petty}
            onChange={(e) => setPetty(e.target.value)}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="pf-oh" className="text-slate-500">
            עלות אתר / עומס (₪)
          </Label>
          <Input
            id="pf-oh"
            type="number"
            min={0}
            step={0.01}
            dir="ltr"
            className="border-slate-200 bg-white font-currency-mono text-[#1e293b]"
            value={oh}
            onChange={(e) => setOh(e.target.value)}
          />
        </div>
        <Button
          type="submit"
          disabled={pending}
          className="mt-2 w-full border border-indigo-500/35 bg-indigo-600 font-semibold text-white hover:bg-indigo-500 sm:w-auto"
        >
          {pending ? (
            <>
              <Loader2 className="size-4 animate-spin" aria-hidden />
              שומר…
            </>
          ) : (
            "שמירה"
          )}
        </Button>
      </form>
    </section>
  )
}
