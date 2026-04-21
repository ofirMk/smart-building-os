"use client"

import Link from "next/link"
import * as React from "react"
import { ArrowRight, Calculator, Loader2 } from "lucide-react"
import { toast } from "sonner"

import { TendersSubnav } from "@/components/marker-ofek/tenders/tenders-subnav"
import { TenderNum } from "@/components/marker-ofek/tenders/tender-numeric"
import { ProcurementPageHeader } from "@/components/marker-ofek/procurement/procurement-page-header"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { applyRiskAndOverheadOnBase } from "@/lib/marker-ofek/tenders/calc"
import {
  getDirectCostForVersion,
  getTenderProject,
  updateTenderProjectPercents,
} from "@/lib/marker-ofek/tenders/tender-actions"
import { TENDERS_ROUTES } from "@/lib/marker-ofek/tenders/nav"
import type { MarkerOfekTenderProjectRow } from "@/types/marker-ofek"

const ils = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 0,
})

export function TendersPricingClient({ projectId }: { projectId: string | null }) {
  const [row, setRow] = React.useState<MarkerOfekTenderProjectRow | null>(null)
  const [direct, setDirect] = React.useState(0)
  const [risk, setRisk] = React.useState(0)
  const [oh, setOh] = React.useState(0)
  const [loading, setLoading] = React.useState(true)
  const [saving, setSaving] = React.useState(false)

  const load = React.useCallback(async () => {
    if (!projectId) {
      setRow(null)
      setLoading(false)
      return
    }
    setLoading(true)
    const [p, d] = await Promise.all([
      getTenderProject(projectId),
      getDirectCostForVersion({ tenderProjectId: projectId, version: "final" }),
    ])
    if (!p.ok) {
      toast.error(p.error)
      setRow(null)
      setLoading(false)
      return
    }
    setRow(p.row)
    setRisk(Number(p.row.risk_percent) || 0)
    setOh(Number(p.row.overhead_percent) || 0)
    if (d.ok) setDirect(d.directCost)
    else setDirect(0)
    setLoading(false)
  }, [projectId])

  React.useEffect(() => {
    void load()
  }, [load])

  async function savePercents() {
    if (!projectId || !row) return
    setSaving(true)
    const res = await updateTenderProjectPercents({
      id: projectId,
      riskPercent: risk,
      overheadPercent: oh,
    })
    setSaving(false)
    if (!res.ok) toast.error(res.error)
    else {
      toast.success("נשמר")
      void load()
    }
  }

  const adj = applyRiskAndOverheadOnBase(direct, risk, oh)

  if (!projectId) {
    return (
      <div className="bg-card px-2 py-10 text-center text-sm text-slate-500">
        בחרו מכרז ב
        <Link className="text-indigo-600 underline" href={TENDERS_ROUTES.hub}>
          מרכז המכרזים
        </Link>
      </div>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-8 bg-card pb-10">
      <Link
        href="/marker-ofek"
        className="inline-flex w-fit items-center gap-2 text-sm text-slate-500 transition-colors hover:text-indigo-700"
      >
        <ArrowRight className="size-4 rotate-180" aria-hidden />
        חזרה ללוח הבקרה
      </Link>

      <TendersSubnav />

      <ProcurementPageHeader
        icon={Calculator}
        kicker="תמחור"
        title="תמחור פרויקטים"
        subtitle="עלות ישירה מכתב כמויות (גרסה סופית), סיכון ועומסים כאחוזים על הבסיס."
        primaryAction={
          <Button
            type="button"
            className="bg-indigo-600 hover:bg-indigo-500"
            disabled={saving || loading}
            onClick={() => void savePercents()}
          >
            {saving ? "שומר…" : "שמירת אחוזים"}
          </Button>
        }
      />

      {loading ? (
        <div className="flex items-center gap-2 text-slate-500">
          <Loader2 className="size-5 animate-spin" aria-hidden />
          טוען…
        </div>
      ) : (
        <>
          <section className="grid gap-6 rounded-xl border border-slate-100 bg-card p-6 md:grid-cols-2">
            <div className="space-y-4">
              <h2 className="text-sm font-semibold text-[#1e293b]">מחשבון סיכון ועומס</h2>
              <div className="grid gap-2">
                <Label className="text-slate-500">סיכון % (על עלות ישירה)</Label>
                <input
                  type="number"
                  className="h-10 rounded-md border border-slate-100 bg-card px-3 font-mono tabular-nums"
                  value={risk}
                  onChange={(e) => setRisk(Number(e.target.value))}
                />
              </div>
              <div className="grid gap-2">
                <Label className="text-slate-500">עומס כללי % (על עלות ישירה)</Label>
                <input
                  type="number"
                  className="h-10 rounded-md border border-slate-100 bg-card px-3 font-mono tabular-nums"
                  value={oh}
                  onChange={(e) => setOh(Number(e.target.value))}
                />
              </div>
            </div>
            <div className="space-y-3 rounded-lg border border-slate-100 p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                סיכום
              </p>
              <div className="flex justify-between text-sm">
                <span className="text-slate-600">עלות ישירה (BoQ סופי)</span>
                <TenderNum>{ils.format(direct)}</TenderNum>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-600">סיכון</span>
                <TenderNum className="text-amber-700">{ils.format(adj.riskAmount)}</TenderNum>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-600">עומס</span>
                <TenderNum className="text-slate-700">{ils.format(adj.overheadAmount)}</TenderNum>
              </div>
              <div className="flex justify-between border-t border-slate-100 pt-3 text-base font-semibold">
                <span className="text-[#1e293b]">סה״כ כולל</span>
                <TenderNum>{ils.format(adj.grandTotal)}</TenderNum>
              </div>
            </div>
          </section>
        </>
      )}
    </div>
  )
}
