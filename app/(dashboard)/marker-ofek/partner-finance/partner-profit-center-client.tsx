"use client"

import * as React from "react"
import Link from "next/link"
import { animate, motion } from "framer-motion"

import { PartnerFinanceExpandableDashboard } from "@/components/marker-ofek/partner-finance-expandable-dashboard"
import type { PartnerMetricsPayload } from "@/lib/marker-ofek/partner-metrics-actions"
import { cn } from "@/lib/utils"

const ils = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 0,
})

function useAnimatedCurrency(target: number) {
  const [display, setDisplay] = React.useState(0)
  React.useEffect(() => {
    const ctrl = animate(0, target, {
      duration: 0.9,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (v) => setDisplay(v),
    })
    return () => ctrl.stop()
  }, [target])
  return display
}

function KpiCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string
  value: number
  sub?: string
  accent?: "profit" | "fee" | "income"
}) {
  const v = useAnimatedCurrency(value)
  const accentClass =
    accent === "fee"
      ? "text-indigo-600"
      : accent === "profit"
        ? "text-[#0f172a]"
        : "text-[#0f172a]"

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      className="rounded-xl border border-slate-100 bg-card p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]"
    >
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">{label}</p>
      <p className={cn("mt-2 font-currency-mono text-2xl font-semibold tabular-nums tracking-tight", accentClass)}>
        {ils.format(v)}
      </p>
      {sub ? <p className="mt-1 text-xs text-slate-500">{sub}</p> : null}
    </motion.div>
  )
}

export function PartnerProfitCenterClient({ payload }: { payload: PartnerMetricsPayload }) {
  const totalRevenue = React.useMemo(
    () => payload.projects.reduce((s, p) => s + p.totalClientInvoices, 0),
    [payload.projects]
  )

  return (
    <div className="flex flex-col gap-10">
      <div className="grid gap-4 sm:grid-cols-3">
        <KpiCard
          label="הכנסות מוכרות (מאושר / שולם)"
          value={totalRevenue}
          sub="חשבוניות לקוח בלבד"
        />
        <KpiCard
          label="סה״כ רווח נקי (Portfolio)"
          value={payload.totalManagedProfit}
          accent="profit"
          sub="לאחר כל סלי עלות"
        />
        <KpiCard
          label="דמי ניהול (25%)"
          value={payload.managementBonus}
          accent="fee"
          sub="מסלול שותפים"
        />
      </div>

      <section className="space-y-4">
        <h2 className="text-sm font-semibold text-[#0f172a]">פרויקטים</h2>
        {payload.projects.length === 0 ? (
          <p className="text-sm text-slate-500">אין פרויקטים להצגה לפי ההרשאה שלך.</p>
        ) : (
          <ul className="grid gap-3">
            {payload.projects.map((row, i) => (
              <motion.li
                key={row.projectId}
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.04, duration: 0.3 }}
                className="flex flex-col justify-between gap-4 rounded-xl border border-slate-100 bg-card p-4 shadow-sm sm:flex-row sm:items-center"
              >
                <div className="min-w-0">
                  <span className="block font-mono text-[11px] text-slate-400">{row.code}</span>
                  <span className="font-semibold text-[#0f172a]">{row.name}</span>
                </div>
                <div className="flex flex-wrap items-center gap-6 text-sm">
                  <span className="text-slate-500">
                    רווח:{" "}
                    <span className="font-currency-mono font-medium tabular-nums text-[#0f172a]">
                      {ils.format(row.profit)}
                    </span>
                  </span>
                  <span className="text-indigo-600">
                    דמי ניהול:{" "}
                    <span className="font-currency-mono tabular-nums">{ils.format(row.managementFeeDue)}</span>
                  </span>
                  <Link
                    href={`/marker-ofek/partner-finance/${row.projectId}`}
                    className="text-sm font-semibold text-indigo-600 underline-offset-4 hover:underline"
                  >
                    פירוט
                  </Link>
                </div>
              </motion.li>
            ))}
          </ul>
        )}
      </section>

      <PartnerFinanceExpandableDashboard initialPayload={payload} />
    </div>
  )
}
