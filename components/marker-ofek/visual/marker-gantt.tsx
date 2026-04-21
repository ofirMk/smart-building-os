"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import {
  addDays,
  differenceInCalendarDays,
  format,
  parseISO,
  startOfDay,
} from "date-fns"
import { he } from "date-fns/locale"
import { toast } from "sonner"

import { DIAMOND_LAST_PATH_KEY } from "@/hooks/use-diamond-navigation"
import type { GanttTaskRow, WbsNodeBrief } from "@/lib/marker-ofek/gantt-actions"
import {
  playDiamondErrorThud,
  playDiamondSuccessChime,
} from "@/lib/marker-ofek/diamond-ui-audio"
import { patchMarkerGanttTaskAction } from "@/lib/marker-ofek/marker-gantt-actions"
import { canonicalWbsFlatIds, type WbsScheduleTask } from "@/lib/marker-ofek/wbs-schedule"
import { cn, formatError } from "@/lib/utils"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"

export type MarkerGanttProps = {
  projectId: string
  initialTasks: GanttTaskRow[]
  wbsNodes?: WbsNodeBrief[]
  /** קו אנכי ליעד חוזי / פרויקט (אופציונלי) */
  plannedDeadlineIso?: string | null
  className?: string
}

function toSchedule(row: GanttTaskRow): WbsScheduleTask {
  return {
    id: row.id,
    parent_id: row.parent_id,
    name: row.name,
    start_date: row.start_date,
    end_date: row.end_date,
    wbs_order: row.wbs_order,
    level: row.level,
    predecessor_index: row.predecessor_index,
    predecessor_task_id: row.predecessor_task_id,
    dependency_ids: row.dependency_ids ?? [],
    dependency_lags: row.dependency_lags,
    is_derivative: row.is_derivative,
  }
}

function safeDay(iso: string | null | undefined, fb: Date): Date {
  const raw = String(iso ?? "").trim()
  if (!raw) return fb
  const d = parseISO(raw)
  return Number.isNaN(d.getTime()) ? fb : startOfDay(d)
}

function computeRange(
  tasks: GanttTaskRow[],
  deadlineIso: string | null | undefined
): { min: Date; max: Date; totalDays: number } {
  const anchor = startOfDay(new Date())
  let min = addDays(anchor, -14)
  let max = addDays(anchor, 70)
  for (const t of tasks) {
    const s = t.start_date ? safeDay(t.start_date, min) : null
    const e = t.end_date ? safeDay(t.end_date, max) : null
    if (s && s < min) min = s
    if (e && e > max) max = e
    const as = t.actual_start_date?.trim()
      ? safeDay(t.actual_start_date, min)
      : null
    const ae = t.actual_end_date?.trim()
      ? safeDay(t.actual_end_date, max)
      : null
    if (as && as < min) min = as
    if (ae && ae > max) max = ae
  }
  if (deadlineIso?.trim()) {
    const d = safeDay(deadlineIso, max)
    if (d > max) max = d
  }
  if (differenceInCalendarDays(max, min) < 14) {
    max = addDays(min, 42)
  }
  const totalDays = Math.max(1, differenceInCalendarDays(max, min) + 1)
  return { min, max, totalDays }
}

function positionPct(
  day: Date,
  rangeMin: Date,
  totalDays: number
): number {
  const idx = differenceInCalendarDays(startOfDay(day), rangeMin)
  return (idx / totalDays) * 100
}

function barPct(
  start: Date,
  end: Date,
  rangeMin: Date,
  totalDays: number
): { left: number; width: number } {
  const s = startOfDay(start)
  const e = startOfDay(end)
  if (e < s) return { left: 0, width: 0 }
  const left = positionPct(s, rangeMin, totalDays)
  const span = differenceInCalendarDays(e, s) + 1
  const width = (span / totalDays) * 100
  return { left, width: Math.max(width, 0.8) }
}

export function MarkerGantt({
  projectId,
  initialTasks,
  wbsNodes = [],
  plannedDeadlineIso = null,
  className,
}: MarkerGanttProps) {
  const router = useRouter()
  const pathname = usePathname() ?? ""
  const [tasks, setTasks] = React.useState<GanttTaskRow[]>(initialTasks)
  React.useEffect(() => {
    setTasks(initialTasks)
  }, [initialTasks])

  const wbsLabelById = React.useMemo(() => {
    const m = new Map<string, string>()
    for (const n of wbsNodes) m.set(n.id, n.label)
    return m
  }, [wbsNodes])

  const hasChildren = React.useMemo(() => {
    const s = new Set<string>()
    for (const t of tasks) {
      if (t.parent_id) s.add(t.parent_id)
    }
    return s
  }, [tasks])

  const { min: rangeMin, max: rangeMax, totalDays } = React.useMemo(
    () => computeRange(tasks, plannedDeadlineIso),
    [tasks, plannedDeadlineIso]
  )

  const flatIds = React.useMemo(
    () => canonicalWbsFlatIds(tasks.map(toSchedule)),
    [tasks]
  )

  const byId = React.useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks])

  const [selectedId, setSelectedId] = React.useState<string | null>(null)
  const [sheetOpen, setSheetOpen] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const [formStart, setFormStart] = React.useState("")
  const [formEnd, setFormEnd] = React.useState("")
  const [formProgress, setFormProgress] = React.useState("0")

  const openEdit = React.useCallback(
    (taskId: string) => {
      const row = byId.get(taskId)
      if (!row) return
      if (hasChildren.has(taskId)) {
        toast.message("שורת סיכום", {
          description: "בחרו משימת עלה לעריכת תאריכים.",
        })
        return
      }
      setSelectedId(taskId)
      setFormStart(
        row.start_date?.trim() ||
          format(startOfDay(new Date()), "yyyy-MM-dd")
      )
      setFormEnd(
        row.end_date?.trim() ||
          format(addDays(startOfDay(new Date()), 7), "yyyy-MM-dd")
      )
      setFormProgress(String(Math.round(Number(row.progress) || 0)))
      setSheetOpen(true)
    },
    [byId, hasChildren]
  )

  const drillF2 = React.useCallback(
    (taskId: string) => {
      const row = byId.get(taskId)
      if (!row) return
      if (hasChildren.has(taskId)) {
        toast.message("שורת סיכום", {
          description: "בחרו משימת עלה לעריכת צומת (F2).",
        })
        return
      }
      try {
        sessionStorage.setItem(DIAMOND_LAST_PATH_KEY, pathname)
      } catch {
        /* ignore */
      }
      const wbs = row.source_wbs_node_id?.trim()
      if (wbs) {
        router.push(`/marker-ofek/execution/wbs/node/${wbs}`)
      } else {
        router.push(`/marker-ofek/execution/wbs/task/${taskId}`)
      }
    },
    [byId, hasChildren, pathname, router]
  )

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return
      if (sheetOpen) return
      if (e.key === "F2" && selectedId) {
        e.preventDefault()
        drillF2(selectedId)
        return
      }
      if (e.key === "Enter" && selectedId) {
        e.preventDefault()
        openEdit(selectedId)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [selectedId, sheetOpen, drillF2, openEdit])

  const today = startOfDay(new Date())
  const todayPct = positionPct(today, rangeMin, totalDays)
  const deadlinePct = plannedDeadlineIso?.trim()
    ? positionPct(safeDay(plannedDeadlineIso, today), rangeMin, totalDays)
    : null

  const monthTicks = React.useMemo(() => {
    const ticks: { d: Date; pct: number }[] = []
    let cur = rangeMin
    const end = rangeMax
    while (cur <= end) {
      ticks.push({ d: cur, pct: positionPct(cur, rangeMin, totalDays) })
      cur = addDays(cur, 7)
    }
    return ticks
  }, [rangeMin, rangeMax, totalDays])

  async function onSaveSheet() {
    if (!selectedId) return
    setSaving(true)
    try {
      const res = await patchMarkerGanttTaskAction({
        projectId,
        taskId: selectedId,
        startDate: formStart.trim(),
        endDate: formEnd.trim(),
        progress: formProgress.trim(),
      })
      if (!res.ok) {
        playDiamondErrorThud()
        toast.error(res.error)
        return
      }
      playDiamondSuccessChime()
      toast.success("המשימה עודכנה")
      setSheetOpen(false)
      router.refresh()
    } catch (e) {
      playDiamondErrorThud()
      toast.error(formatError(e))
    } finally {
      setSaving(false)
    }
  }

  const editingRow = selectedId ? byId.get(selectedId) : undefined

  return (
    <div
      className={cn(
        "flex h-full min-h-0 flex-col gap-4 bg-card p-4 lg:p-6",
        className
      )}
      dir="rtl"
    >
      <header className="shrink-0 space-y-1">
        <p className="text-[10px] font-semibold tracking-[0.2em] text-slate-400">
          לוח זמנים חזותי
        </p>
        <h2 className="text-lg font-light text-foreground">תרשים גאנט</h2>
        <p className="text-xs font-light leading-relaxed text-slate-500">
          לחיצה על שורה לבחירה. לחיצה כפולה על הפס — עריכת אחוז התקדמות (לוח צד).
          F2 — עריכת צומת WBS (יהלום). Enter — עריכה מהירה. תוויות בניין/קומה מוצגות
          כשמולאו בשדות המשימה.
        </p>
      </header>

      <div className="min-h-0 flex-1 overflow-auto rounded-2xl border border-slate-100 bg-background/40">
        <div className="flex min-h-[320px] min-w-[720px] flex-col">
          <div className="sticky top-0 z-20 flex border-b border-slate-100 bg-card/95 backdrop-blur-sm">
            <div className="w-[min(32%,240px)] shrink-0 px-4 py-3 text-xs font-medium text-slate-400">
              משימה / WBS
            </div>
            <div
              className="relative min-w-0 flex-1 py-3 pe-4 ps-2"
              dir="ltr"
            >
              <div className="relative h-8 w-full">
                {monthTicks.map((t, i) => (
                  <span
                    key={i}
                    className="absolute top-0 whitespace-nowrap text-[10px] font-medium text-slate-400"
                    style={{ left: `${t.pct}%`, transform: "translateX(-50%)" }}
                  >
                    {format(t.d, "d MMM", { locale: he })}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {flatIds.map((id) => {
            const row = byId.get(id)
            if (!row) return null
            const isSub =
              row.is_derivative === true ||
              (row.subcontractor_id != null &&
                String(row.subcontractor_id).trim() !== "")
            const start = safeDay(
              row.start_date,
              addDays(rangeMin, 1)
            )
            let end = safeDay(row.end_date, addDays(start, 1))
            if (end < start) end = addDays(start, 1)
            const { left, width } = barPct(start, end, rangeMin, totalDays)
            const hasActual =
              Boolean(row.actual_start_date?.trim()) &&
              Boolean(row.actual_end_date?.trim())
            let aStart = start
            let aEnd = end
            let aLeft = left
            let aWidth = width
            if (hasActual) {
              aStart = safeDay(row.actual_start_date, start)
              aEnd = safeDay(row.actual_end_date, addDays(aStart, 1))
              if (aEnd < aStart) aEnd = addDays(aStart, 1)
              const a = barPct(aStart, aEnd, rangeMin, totalDays)
              aLeft = a.left
              aWidth = a.width
            }
            const siteHint = [row.building_label, row.floor_label]
              .filter(Boolean)
              .join(" · ")
            const wbsHint = row.source_wbs_node_id
              ? wbsLabelById.get(row.source_wbs_node_id)
              : null
            const indent = Math.min(6, Math.max(0, row.level)) * 12

            return (
              <div
                key={id}
                className={cn(
                  "flex border-b border-slate-100/80 transition-colors",
                  selectedId === id && "bg-indigo-50/50"
                )}
              >
                <button
                  type="button"
                  className="w-[min(32%,240px)] shrink-0 px-4 py-2.5 text-start text-sm font-light text-slate-800 hover:bg-background/80"
                  style={{ paddingInlineStart: 16 + indent }}
                  onClick={() => setSelectedId(id)}
                >
                  <span className="line-clamp-2">{row.name}</span>
                  {siteHint ? (
                    <span className="mt-0.5 block text-[10px] font-medium text-slate-500">
                      {siteHint}
                    </span>
                  ) : null}
                  {wbsHint ? (
                    <span className="mt-0.5 block text-[10px] text-slate-400">
                      מבנה: {wbsHint}
                    </span>
                  ) : null}
                </button>
                <div
                  className="relative min-h-[44px] min-w-0 flex-1 py-2 pe-3 ps-1"
                  dir="ltr"
                >
                  <div className="relative h-9 w-full rounded-lg bg-card/60">
                    <div
                      className="pointer-events-none absolute inset-y-1 z-10 w-px bg-amber-400/90"
                      style={{ left: `${todayPct}%` }}
                      title="היום"
                    />
                    {deadlinePct != null &&
                    deadlinePct >= 0 &&
                    deadlinePct <= 100 ? (
                      <div
                        className="pointer-events-none absolute inset-y-1 z-10 w-px bg-rose-400/90"
                        style={{ left: `${deadlinePct}%` }}
                        title="יעד חוזי"
                      />
                    ) : null}
                    {hasActual ? (
                      <div
                        className="pointer-events-none absolute inset-y-1 z-[4] rounded-[12px] bg-slate-300/60"
                        style={{
                          left: `${left}%`,
                          width: `${width}%`,
                          minWidth: 8,
                        }}
                        title="מתוכנן (בסיס)"
                      />
                    ) : null}
                    <button
                      type="button"
                      title="לחיצה כפולה — אחוז התקדמות ותאריכים"
                      className={cn(
                        "absolute inset-y-1 z-[5] rounded-[12px] shadow-sm transition hover:ring-2 hover:ring-indigo-200/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400",
                        hasActual
                          ? "bg-amber-500/90 hover:bg-amber-500"
                          : isSub
                            ? "bg-emerald-500/90 hover:bg-emerald-500"
                            : "bg-sky-500/90 hover:bg-sky-500"
                      )}
                      style={{
                        left: `${hasActual ? aLeft : left}%`,
                        width: `${hasActual ? aWidth : width}%`,
                        minWidth: 8,
                      }}
                      onDoubleClick={(e) => {
                        e.preventDefault()
                        openEdit(id)
                      }}
                    />
                  </div>
                </div>
              </div>
            )
          })}

          {flatIds.length === 0 ? (
            <p className="p-8 text-center text-sm font-light text-slate-500">
              אין משימות לפרויקט. הוסיפו משימות ממסך הגאנט המלא או ייבאו WBS.
            </p>
          ) : null}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-4 text-[11px] text-slate-500">
        <span className="inline-flex items-center gap-2">
          <span className="size-3 rounded-md bg-sky-500" aria-hidden />
          צד מזמין / ראשי
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="size-3 rounded-md bg-emerald-500" aria-hidden />
          צד קבלן משנה
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="h-3 w-px bg-amber-400" aria-hidden />
          היום
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="h-3 w-px bg-rose-400" aria-hidden />
          יעד חוזי
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="size-3 rounded-md bg-slate-300" aria-hidden />
          בסיס (מתוכנן)
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="size-3 rounded-md bg-amber-500" aria-hidden />
          ביצוע (בפועל)
        </span>
      </div>

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="right" className="sm:max-w-md">
          <SheetHeader>
            <SheetTitle>עריכת משימה</SheetTitle>
            <SheetDescription>
              תאריכים ואחוז התקדמות — נשמרים לאחר אימות בשרת.
            </SheetDescription>
          </SheetHeader>
          <div className="grid gap-4 px-4">
            <div className="grid gap-2">
              <Label htmlFor="mg-start" className="text-slate-600">
                תאריך התחלה
              </Label>
              <Input
                id="mg-start"
                type="date"
                value={formStart}
                onChange={(e) => setFormStart(e.target.value)}
                dir="ltr"
                className="font-mono"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="mg-end" className="text-slate-600">
                תאריך סיום
              </Label>
              <Input
                id="mg-end"
                type="date"
                value={formEnd}
                onChange={(e) => setFormEnd(e.target.value)}
                dir="ltr"
                className="font-mono"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="mg-pct" className="text-slate-600">
                התקדמות (%)
              </Label>
              <Input
                id="mg-pct"
                type="number"
                min={0}
                max={100}
                value={formProgress}
                onChange={(e) => setFormProgress(e.target.value)}
                dir="ltr"
                className="font-mono"
              />
            </div>
            {editingRow ? (
              <Link
                href={`/marker-ofek/execution/gantt/${projectId}`}
                className="inline-flex h-9 w-full items-center justify-center rounded-lg border border-slate-200 bg-card text-sm font-medium text-slate-700 transition hover:bg-background"
              >
                מעבר לגאנט מלא
              </Link>
            ) : null}
          </div>
          <SheetFooter className="flex-row gap-2 sm:flex-row">
            <Button
              type="button"
              variant="outline"
              onClick={() => setSheetOpen(false)}
            >
              ביטול
            </Button>
            <Button
              type="button"
              className="bg-slate-900 text-white hover:bg-slate-800"
              disabled={saving}
              onClick={() => void onSaveSheet()}
            >
              {saving ? "שומר…" : "שמירה"}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  )
}
