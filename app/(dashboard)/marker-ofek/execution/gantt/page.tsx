"use client"

import * as React from "react"
import { motion } from "framer-motion"
import { CalendarRange, ChevronDown, LayoutGrid } from "lucide-react"

import { cn } from "@/lib/utils"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Button } from "@/components/ui/button"

type ViewMode = "months" | "weeks"
type TaskStatus = "done" | "in_progress" | "planned"

type GanttTask = {
  id: string
  nameHe: string
  status: TaskStatus
  progress: number
  /** inclusive 0-based column index into the current view grid */
  colStart: number
  /** exclusive end column */
  colEnd: number
}

type ProjectDataset = {
  id: string
  label: string
  code: string
  tasks: GanttTask[]
}

const MONTHS_2026_H1 = [
  { key: "2026-01", label: "ינו׳ 26" },
  { key: "2026-02", label: "פבר׳ 26" },
  { key: "2026-03", label: "מרץ 26" },
  { key: "2026-04", label: "אפר׳ 26" },
  { key: "2026-05", label: "מאי 26" },
  { key: "2026-06", label: "יוני 26" },
]

/** 26 weeks — H1 2026 (dense week strip) */
const WEEKS_H1_LABELS = Array.from({ length: 26 }, (_, i) => String(i + 1))

const DATASETS: Record<string, ProjectDataset> = {
  ramat: {
    id: "ramat",
    label: "רמת עיר היין — אשקלון",
    code: "MOF-DEMO-RAMAT-WINE",
    tasks: [
      {
        id: "t1",
        nameHe: "התארגנות באתר",
        status: "done",
        progress: 100,
        colStart: 0,
        colEnd: 1,
      },
      {
        id: "t2",
        nameHe: "חפירות והנחת צנרת",
        status: "done",
        progress: 100,
        colStart: 1,
        colEnd: 3,
      },
      {
        id: "t3",
        nameHe: "השחלת כבלי XLPE",
        status: "in_progress",
        progress: 62,
        colStart: 2,
        colEnd: 5,
      },
      {
        id: "t4",
        nameHe: "התקנת לוחות ראשיים",
        status: "in_progress",
        progress: 38,
        colStart: 4,
        colEnd: 6,
      },
      {
        id: "t5",
        nameHe: "בדיקות בודק (הנדסה / חשמל)",
        status: "planned",
        progress: 0,
        colStart: 5,
        colEnd: 6,
      },
      {
        id: "t6",
        nameHe: "השלמת תאי טרפו ומעברי גשר",
        status: "planned",
        progress: 0,
        colStart: 3,
        colEnd: 5,
      },
    ],
  },
  gindi: {
    id: "gindi",
    label: "גינדי סביון — מתחם מסחר",
    code: "MO-GINDI-SAVION",
    tasks: [
      {
        id: "g1",
        nameHe: "התארגנות באתר",
        status: "done",
        progress: 100,
        colStart: 0,
        colEnd: 2,
      },
      {
        id: "g2",
        nameHe: "חפירות והנחת צנרת",
        status: "in_progress",
        progress: 74,
        colStart: 1,
        colEnd: 4,
      },
      {
        id: "g3",
        nameHe: "השחלת כבלי XLPE",
        status: "planned",
        progress: 12,
        colStart: 3,
        colEnd: 6,
      },
      {
        id: "g4",
        nameHe: "התקנת לוחות ראשיים",
        status: "planned",
        progress: 0,
        colStart: 4,
        colEnd: 6,
      },
      {
        id: "g5",
        nameHe: "בדיקות בודק (הנדסה / חשמל)",
        status: "planned",
        progress: 0,
        colStart: 5,
        colEnd: 6,
      },
    ],
  },
}

/** Week-based column spans (same semantic tasks, re-mapped to 26-week grid) */
function tasksForWeeks(dataset: ProjectDataset): GanttTask[] {
  const scale = 26 / 6
  return dataset.tasks.map((t) => {
    let start = Math.max(0, Math.floor(t.colStart * scale))
    let end = Math.min(26, Math.ceil(t.colEnd * scale))
    if (end <= start) end = Math.min(26, start + 1)
    return { ...t, colStart: start, colEnd: end }
  })
}

function statusLabel(s: TaskStatus): string {
  switch (s) {
    case "done":
      return "הושלם"
    case "in_progress":
      return "בביצוע"
    case "planned":
      return "מתוכנן"
    default:
      return s
  }
}

function statusBarClass(s: TaskStatus): string {
  switch (s) {
    case "done":
      return "bg-emerald-500 shadow-[inset_0_1px_0_rgba(255,255,255,0.2)]"
    case "in_progress":
      return "bg-sky-500 shadow-[inset_0_1px_0_rgba(255,255,255,0.2)]"
    case "planned":
      return "bg-slate-400 shadow-[inset_0_1px_0_rgba(255,255,255,0.15)]"
    default:
      return "bg-slate-400"
  }
}

function statusBadgeClass(s: TaskStatus): string {
  switch (s) {
    case "done":
      return "border-emerald-200 bg-emerald-50 text-emerald-900"
    case "in_progress":
      return "border-sky-200 bg-sky-50 text-sky-900"
    case "planned":
      return "border-slate-200 bg-background text-slate-700"
    default:
      return "border-slate-200 bg-background text-slate-700"
  }
}

export default function MarkerOfekExecutionGanttPlanningPage() {
  const [projectKey, setProjectKey] = React.useState<string>("ramat")
  const [view, setView] = React.useState<ViewMode>("months")

  const dataset = DATASETS[projectKey] ?? DATASETS.ramat
  const tasks =
    view === "weeks" ? tasksForWeeks(dataset) : dataset.tasks
  const colCount = view === "months" ? 6 : 26

  const monthHeaders = view === "months" ? MONTHS_2026_H1 : null

  return (
    <div
      dir="rtl"
      className="min-h-[calc(100vh-4rem)] w-full bg-card text-foreground"
    >
      <div className="border-b border-slate-200 bg-card px-3 py-2.5 md:px-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <LayoutGrid className="size-3.5 shrink-0" aria-hidden />
              גאנט תכנון · ביצוע
            </div>
            <Select
              value={projectKey}
              onValueChange={(v) => v && setProjectKey(v)}
            >
              <SelectTrigger
                size="sm"
                className="h-8 max-w-[min(100%,20rem)] border-slate-200 bg-card text-sm font-semibold text-foreground"
                aria-label="בחירת פרויקט"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ramat" className="text-sm">
                  רמת עיר היין — אשקלון
                </SelectItem>
                <SelectItem value="gindi" className="text-sm">
                  גינדי סביון — מתחם מסחר
                </SelectItem>
              </SelectContent>
            </Select>
            <span className="hidden font-mono text-[11px] text-slate-500 md:inline">
              {dataset.code}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] font-medium text-slate-500">
              תצוגה:
            </span>
            <Button
              type="button"
              variant={view === "months" ? "secondary" : "outline"}
              size="sm"
              className={cn(
                "h-8 gap-1 border-slate-200 px-2.5 text-xs font-semibold",
                view === "months" && "border-slate-300 bg-slate-100 text-foreground"
              )}
              onClick={() => setView("months")}
            >
              <CalendarRange className="size-3.5" aria-hidden />
              חודשים
            </Button>
            <Button
              type="button"
              variant={view === "weeks" ? "secondary" : "outline"}
              size="sm"
              className={cn(
                "h-8 gap-1 border-slate-200 px-2.5 text-xs font-semibold",
                view === "weeks" && "border-slate-300 bg-slate-100 text-foreground"
              )}
              onClick={() => setView("weeks")}
            >
              <ChevronDown className="size-3.5 rotate-[-90deg]" aria-hidden />
              שבועות
            </Button>
          </div>
        </div>
        <p className="mt-1.5 text-[11px] leading-snug text-slate-500">
          ציר זמן 2026 (H1) · תרשים לדוגמה — תשתיות חשמל, כבלי XLPE, לוחות ראשיים
        </p>
      </div>

      {/* Wide timeline on physical right, WBS on physical left (RTL: 1fr first = inline-start = right) */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_minmax(240px,300px)] lg:items-stretch">
        {/* Timeline panel */}
        <div className="order-2 flex min-h-0 min-w-0 flex-col border-slate-200 max-lg:border-t lg:order-1 lg:border-s">
          <div
            className="sticky top-0 z-20 border-b border-slate-200 bg-card"
            style={{
              display: "grid",
              gridTemplateColumns: `repeat(${colCount}, minmax(${view === "months" ? 56 : 28}px, 1fr))`,
            }}
          >
            {view === "months" && monthHeaders
              ? monthHeaders.map((m) => (
                  <div
                    key={m.key}
                    className="border-s border-slate-200 px-1 py-2 text-center text-[10px] font-bold leading-tight text-slate-700 first:border-s-0 md:text-xs"
                  >
                    {m.label}
                  </div>
                ))
              : WEEKS_H1_LABELS.map((lbl, i) => (
                  <div
                    key={i}
                    className="border-s border-slate-100 px-0 py-1.5 text-center text-[9px] font-bold tabular-nums text-slate-600 md:text-[10px]"
                    title={`שבוע ${i + 1} · 2026`}
                  >
                    {lbl}
                  </div>
                ))}
          </div>

          <div className="flex flex-col">
            {tasks.map((task, rowIndex) => (
              <div
                key={task.id}
                className="relative grid h-11 shrink-0 border-b border-slate-200 bg-card"
                style={{
                  gridTemplateColumns: `repeat(${colCount}, minmax(${view === "months" ? 56 : 28}px, 1fr))`,
                }}
              >
                {Array.from({ length: colCount }).map((_, ci) => (
                  <div
                    key={ci}
                    className="border-s border-slate-100 bg-background/40 first:border-s-0"
                    aria-hidden
                  />
                ))}
                <div
                  className="pointer-events-none absolute inset-y-1 flex items-stretch px-0.5"
                  style={{
                    insetInlineStart: `${(task.colStart / colCount) * 100}%`,
                    width: `${((task.colEnd - task.colStart) / colCount) * 100}%`,
                  }}
                >
                  <motion.div
                    className={cn(
                      "h-7 min-h-[1.5rem] w-full rounded-md will-change-transform",
                      statusBarClass(task.status)
                    )}
                    initial={{ scaleX: 0, opacity: 0.88 }}
                    animate={{ scaleX: 1, opacity: 1 }}
                    transition={{
                      type: "spring",
                      stiffness: 300,
                      damping: 30,
                      delay: 0.05 + rowIndex * 0.052,
                    }}
                    style={{ transformOrigin: "100% 50%" }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Task list — WBS */}
        <div className="order-1 flex min-h-0 flex-col border-slate-200 bg-card lg:order-2 lg:border-e">
          <div className="sticky top-0 z-20 flex h-[41px] shrink-0 items-end border-b border-slate-200 bg-card px-2 pb-1.5 pt-2">
            <span className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
              WBS / משימות
            </span>
          </div>
          {tasks.map((task) => (
            <div
              key={task.id}
              className="flex h-11 shrink-0 flex-col justify-center gap-0.5 border-b border-slate-200 px-2 py-1"
            >
              <p className="line-clamp-2 text-xs font-semibold leading-tight text-foreground">
                {task.nameHe}
              </p>
              <div className="flex flex-wrap items-center gap-1.5">
                <span
                  className={cn(
                    "inline-flex rounded border px-1.5 py-0 text-[10px] font-semibold",
                    statusBadgeClass(task.status)
                  )}
                >
                  {statusLabel(task.status)}
                </span>
                <span className="font-currency-mono text-[11px] font-bold tabular-nums text-slate-600">
                  {task.progress}%
                </span>
                <span className="text-[10px] text-slate-400">אחוז ביצוע</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
