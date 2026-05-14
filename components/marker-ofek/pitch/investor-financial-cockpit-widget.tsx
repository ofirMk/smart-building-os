"use client"

/**
 * InvestorFinancialCockpitWidget — Sprint T8 add-on for the pitch lobby.
 *
 * Mounts the compact `FinancialCockpitClient` inside a collapsible "tab"
 * inside the investor command-center, lazily loading the four cockpit
 * server actions only after the user opens the widget.
 *
 * Strictly additive — does not alter `InvestorCommandCenter`'s structure.
 */

import * as React from "react"
import { Loader2, Sparkles, Target } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { FinancialCockpitClient } from "@/components/marker-ofek/finance/financial-cockpit-client"
import { readActiveCompanyIdFromCookie } from "@/lib/company-context"
import {
  getCashFlowSeriesAction,
  getCockpitKpisAction,
  type CashFlowPoint,
  type CockpitKpis,
} from "@/lib/marker-ofek/finance/t8-cockpit-actions"

export function InvestorFinancialCockpitWidget() {
  const [open, setOpen] = React.useState(false)
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [kpis, setKpis] = React.useState<CockpitKpis | null>(null)
  const [series, setSeries] = React.useState<CashFlowPoint[]>([])
  const [companyId, setCompanyId] = React.useState<string | null>(null)
  const [loadedOnce, setLoadedOnce] = React.useState(false)

  function handleOpen() {
    const next = !open
    setOpen(next)
    if (!next || loadedOnce) return
    const cid = readActiveCompanyIdFromCookie()
    if (!cid) {
      setError("אין הקשר חברה פעיל — בחר חברה דרך מתג ה-Workspace.")
      return
    }
    setCompanyId(cid)
    setLoading(true)
    setError(null)
    Promise.all([
      getCockpitKpisAction({ companyId: cid }),
      getCashFlowSeriesAction({ companyId: cid, days: 90 }),
    ])
      .then(([k, s]) => {
        if (k.ok) setKpis(k.data)
        else setError(k.error)
        if (s.ok) setSeries(s.data)
        setLoadedOnce(true)
      })
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : "שגיאה בטעינת נתונים")
      })
      .finally(() => setLoading(false))
  }

  return (
    <section
      dir="rtl"
      className="relative overflow-hidden rounded-3xl border border-fuchsia-200/60 bg-gradient-to-br from-fuchsia-50/50 via-indigo-50/40 to-card p-5 shadow-[0_18px_60px_-30px_rgba(99,102,241,0.35)]"
      data-investor-tab="financial-cockpit"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -top-20 -left-20 h-56 w-56 rounded-full bg-gradient-to-br from-fuchsia-400/20 to-transparent blur-3xl"
      />
      <div className="relative flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <Badge
            variant="secondary"
            className="border border-fuchsia-200 bg-fuchsia-50 text-fuchsia-700"
          >
            <Sparkles className="me-1 size-3" aria-hidden />
            Sprint T8 · Live Financial Cockpit
          </Badge>
          <h2 className="flex items-center gap-2 text-xl font-semibold tracking-tight text-foreground">
            <Target className="size-5 text-fuchsia-600" aria-hidden />
            שליטה פיננסית — מבט-על למשקיע
          </h2>
          <p className="text-xs text-muted-foreground">
            תזרים מזומנים, חובות לקוחות ויתרות זכאים — נתוני אמת מ-Supabase.
          </p>
        </div>
        <Button
          type="button"
          variant={open ? "default" : "outline"}
          size="sm"
          onClick={handleOpen}
          className="gap-2"
          aria-expanded={open}
          aria-controls="investor-financial-cockpit-panel"
        >
          {loading ? (
            <Loader2 className="size-3.5 animate-spin" aria-hidden />
          ) : null}
          {open ? "סגור" : "פתח דשבורד"}
        </Button>
      </div>

      {open ? (
        <div
          id="investor-financial-cockpit-panel"
          className="relative mt-5"
        >
          {error ? (
            <Card className="border-rose-300 bg-rose-50 p-4 text-sm text-rose-800">
              {error}
            </Card>
          ) : null}
          {loading && !loadedOnce ? (
            <Card className="flex items-center justify-center gap-2 p-10 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" aria-hidden />
              טוען נתונים…
            </Card>
          ) : null}
          {loadedOnce && companyId ? (
            <FinancialCockpitClient
              companyId={companyId}
              initialKpis={kpis}
              initialSeries={series}
              debtors={[]}
              aging={{
                current: 0,
                d1_30: 0,
                d31_60: 0,
                d61_90: 0,
                d90plus: 0,
              }}
              compact
            />
          ) : null}
        </div>
      ) : null}
    </section>
  )
}
