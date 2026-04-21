"use client"

import * as React from "react"
import { AlertTriangle, ClipboardList, FileCheck2, Users } from "lucide-react"

import { cn } from "@/lib/utils"

const ils = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 0,
})

const MOCK_KPIS = {
  workersOnSite: 124,
  criticalOpenDefects: 3,
  pendingDeliveryNotes: 5,
  approvedClientBillingTotal: 1_250_000,
} as const

const MOCK_RECENT_DEFECTS = [
  { id: "1", title: "אי-התאמה בלוח ראשי — קומה 12", severity: "קריטי", project: "גינדי TLV" },
  { id: "2", title: "תקשורת חלשה — ארון תקשורת B2", severity: "בינוני", project: "נמל חיפה" },
  { id: "3", title: "חוסר תיעוד בדיקות מתח", severity: "קל", project: "באר שבע סולארי" },
] as const

const MOCK_RECENT_LOGS = [
  { id: "a", date: "2026-04-10", summary: "השלמת משיכות ראשיות — אגף מזרחי", workers: 18 },
  { id: "b", date: "2026-04-09", summary: "בדיקות אטימות גג + תיעוד צילומים", workers: 12 },
  { id: "c", date: "2026-04-08", summary: "קורות חשמל — שלב הכנה ללוחות", workers: 22 },
] as const

export function ProjectControlRoom() {
  return (
    <div
      dir="rtl"
      lang="he"
      className="flex min-h-0 min-w-0 flex-1 flex-col gap-4 bg-card p-3 text-foreground md:p-4 [color-scheme:light]"
    >
      {/* Ribbon */}
      <header className="border-b border-slate-200 pb-3">
        <h1 className="text-base font-bold tracking-tight text-foreground md:text-lg">
          קוקפיט ניהול פרויקטים
        </h1>
        <p className="mt-1 text-xs text-slate-500">
          מבט תפעולי — דמה (Phase 5.1)
        </p>
      </header>

      {/* KPI row */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard
          icon={Users}
          label="פועלים בשטח"
          value={String(MOCK_KPIS.workersOnSite)}
          valueClassName="text-foreground"
        />
        <KpiCard
          icon={AlertTriangle}
          label="ליקויים קריטיים פתוחים"
          value={String(MOCK_KPIS.criticalOpenDefects)}
          valueClassName="font-semibold text-red-600"
        />
        <KpiCard
          icon={FileCheck2}
          label="תעודות משלוח ממתינות לאישור"
          value={String(MOCK_KPIS.pendingDeliveryNotes)}
          valueClassName="text-foreground"
        />
        <KpiCard
          icon={ClipboardList}
          label='סה״כ חשבונות יזם שאושרו'
          value={ils.format(MOCK_KPIS.approvedClientBillingTotal)}
          valueClassName="text-foreground"
        />
      </div>

      {/* Split */}
      <div className="grid min-h-0 flex-1 gap-4 md:grid-cols-2">
        <section className="flex min-h-[220px] flex-col rounded-lg border border-slate-200 bg-card p-4 shadow-sm">
          <h2 className="mb-3 flex items-center gap-2 border-b border-slate-100 pb-2 text-sm font-bold text-slate-800">
            <AlertTriangle className="size-4 text-amber-600" aria-hidden />
            ליקויים אחרונים
          </h2>
          <ul className="flex flex-1 flex-col gap-2 overflow-auto text-sm">
            {MOCK_RECENT_DEFECTS.map((d) => (
              <li
                key={d.id}
                className="rounded-md border border-slate-100 bg-background/80 px-3 py-2"
              >
                <p className="font-medium text-foreground">{d.title}</p>
                <p className="mt-0.5 text-xs text-slate-500">
                  {d.project} · <span className="font-medium">{d.severity}</span>
                </p>
              </li>
            ))}
          </ul>
        </section>

        <section className="flex min-h-[220px] flex-col rounded-lg border border-slate-200 bg-card p-4 shadow-sm">
          <h2 className="mb-3 flex items-center gap-2 border-b border-slate-100 pb-2 text-sm font-bold text-slate-800">
            <ClipboardList className="size-4 text-sky-600" aria-hidden />
            פעילות אחרונה בשטח
          </h2>
          <ul className="flex flex-1 flex-col gap-2 overflow-auto text-sm">
            {MOCK_RECENT_LOGS.map((log) => (
              <li
                key={log.id}
                className="rounded-md border border-slate-100 bg-background/80 px-3 py-2"
              >
                <p className="text-xs font-semibold text-slate-500">{log.date}</p>
                <p className="mt-0.5 font-medium text-foreground">{log.summary}</p>
                <p className="mt-0.5 text-xs text-slate-600">
                  כוח אדם בשטח: {log.workers}
                </p>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  )
}

function KpiCard({
  icon: Icon,
  label,
  value,
  valueClassName,
}: {
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>
  label: string
  value: string
  valueClassName?: string
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-card p-4 shadow-sm">
      <div className="mb-2 flex items-center gap-2 text-slate-500">
        <Icon className="size-4 shrink-0 opacity-80" aria-hidden />
        <span className="text-[11px] font-semibold leading-tight">{label}</span>
      </div>
      <p
        className={cn(
          "font-currency-mono text-2xl font-bold tabular-nums tracking-tight md:text-xl",
          valueClassName
        )}
      >
        {value}
      </p>
    </div>
  )
}
