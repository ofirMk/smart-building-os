"use client"

import * as React from "react"
import Link from "next/link"

import { DiamondWbsNavigationPane } from "@/components/marker-ofek/workspace/diamond-wbs-navigation-pane"
import { DiamondWorkspaceLayout } from "@/components/marker-ofek/workspace/diamond-workspace-layout"
import { MarkerGantt } from "@/components/marker-ofek/visual/marker-gantt"
import type { GanttTaskRow, WbsNodeBrief } from "@/lib/marker-ofek/gantt-actions"
import { useDiamondNavigation } from "@/hooks/use-diamond-navigation"
import type { DiamondWorkspaceLayoutState } from "@/lib/marker-ofek/workspace-types"
import { cn } from "@/lib/utils"

type VarianceMini = {
  plannedCost: number
  actualCost: number
  variance: number
  variancePercent: number
  status: string
}

export function DiamondWorkspacePageClient({
  projectId,
  projectName,
  projectCode,
  initialLayout,
  initialTasks,
  wbsNodes,
  plannedDeadlineIso,
  variance,
}: {
  projectId: string
  projectName: string
  projectCode: string
  initialLayout: DiamondWorkspaceLayoutState
  initialTasks: GanttTaskRow[]
  wbsNodes: WbsNodeBrief[]
  plannedDeadlineIso: string | null
  variance: VarianceMini
}) {
  useDiamondNavigation("projects")

  const rootTasks = React.useMemo(
    () =>
      initialTasks
        .filter((t) => t.parent_id == null)
        .slice(0, 12)
        .map((t) => ({ id: t.id, name: t.name })),
    [initialTasks]
  )

  const fmt = React.useCallback((n: number) => {
    try {
      return new Intl.NumberFormat("he-IL", {
        style: "currency",
        currency: "ILS",
        maximumFractionDigits: 0,
      }).format(n)
    } catch {
      return String(Math.round(n))
    }
  }, [])

  return (
    <DiamondWorkspaceLayout
      initialLayout={initialLayout}
      navigationPane={
        <DiamondWbsNavigationPane
          projectId={projectId}
          projectName={projectName}
          wbsNodes={wbsNodes}
          rootTasks={rootTasks}
        />
      }
      workArea={
        <div className="flex h-full min-h-0 flex-col bg-white">
          <div className="shrink-0 border-b border-slate-100 px-4 py-4 lg:px-6">
            <p className="text-[10px] font-semibold tracking-[0.22em] text-slate-400">
              שולחן עבודה יהלום
            </p>
            <h1 className="mt-1 text-xl font-extralight text-slate-900">
              {projectName}
            </h1>
            {projectCode ? (
              <p className="mt-1 font-mono text-xs text-slate-500">{projectCode}</p>
            ) : null}
          </div>
          <div className="min-h-0 flex-1">
            <MarkerGantt
              projectId={projectId}
              initialTasks={initialTasks}
              wbsNodes={wbsNodes}
              plannedDeadlineIso={plannedDeadlineIso}
              className="h-full"
            />
          </div>
        </div>
      }
      silentGuard={
        <div
          className="flex h-full min-h-0 flex-col gap-6 overflow-auto p-5"
          dir="rtl"
        >
          <div>
            <h2 className="text-xs font-semibold tracking-[0.18em] text-slate-400">
              משמר שקט
            </h2>
            <p className="mt-2 text-sm font-light leading-relaxed text-slate-600">
              תוצאות ניתוח סיכונים מחוזים יוצגו כאן לאחר שילוב עם דפי חוזה.
              כרגע זהו אזור שמור לריכוז ממצאים ללא רעש.
            </p>
          </div>
          <ul className="space-y-3 text-xs font-light text-slate-500">
            <li className="rounded-xl border border-slate-100 bg-white/80 px-4 py-3">
              אין התראות פעילות — המערכת במצב יציב.
            </li>
            <li className="rounded-xl border border-slate-100 bg-white/80 px-4 py-3">
              F2 — הקמה מהירה של ישות (למשל פרויקט) כשאין מיקוד בשדה טקסט.
            </li>
            <li className="flex flex-col gap-2 rounded-xl border border-slate-100 bg-white/80 px-4 py-3">
              <span className="font-medium text-slate-600">שטח</span>
              <Link
                href={`/marker-ofek/execution/field/floor-handover/${projectId}`}
                className="text-indigo-600 underline-offset-2 hover:underline"
              >
                מסירת קומה
              </Link>
              <Link
                href={`/marker-ofek/execution/field/snags/${projectId}`}
                className="text-indigo-600 underline-offset-2 hover:underline"
              >
                ליקויים וקיזוזים
              </Link>
            </li>
          </ul>
        </div>
      }
      dataConsole={
        <div className="space-y-4 text-sm font-light text-slate-700" dir="rtl">
          <p className="text-xs font-semibold tracking-wide text-slate-400">
            סיכום כספי (משימות)
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-slate-100 bg-slate-50/80 px-4 py-3">
              <p className="text-[10px] text-slate-400">תכנון</p>
              <p className="mt-1 font-mono text-base tabular-nums text-slate-800">
                {fmt(variance.plannedCost)}
              </p>
            </div>
            <div className="rounded-xl border border-slate-100 bg-slate-50/80 px-4 py-3">
              <p className="text-[10px] text-slate-400">ביצוע</p>
              <p className="mt-1 font-mono text-base tabular-nums text-slate-800">
                {fmt(variance.actualCost)}
              </p>
            </div>
            <div
              className={cn(
                "rounded-xl border px-4 py-3",
                variance.variance > 0
                  ? "border-rose-100 bg-rose-50/50"
                  : variance.variance < 0
                    ? "border-emerald-100 bg-emerald-50/50"
                    : "border-slate-100 bg-slate-50/80"
              )}
            >
              <p className="text-[10px] text-slate-400">סטייה</p>
              <p className="mt-1 font-mono text-base tabular-nums text-slate-900">
                {fmt(variance.variance)}{" "}
                <span className="text-xs font-normal text-slate-500">
                  (
                  {variance.variancePercent.toFixed(1)}
                  %)
                </span>
              </p>
            </div>
          </div>
          <p className="text-[11px] text-slate-400">
            יומן: עדכון אחרון לפי טעינת העמוד. לפרטים מלאים — דוחות הפרויקט.
          </p>
        </div>
      }
    />
  )
}
