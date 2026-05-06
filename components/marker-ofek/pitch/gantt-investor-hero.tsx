"use client"

/**
 * GanttInvestorHero — Kanban מדומה של משימות קבלני משנה לתצוגת המצגת.
 * Mock-only. תפקידו לתת למשקיע תחושת ביצוע חי ("מי עושה מה כרגע").
 */

import * as React from "react"
import { Hammer, Layers3, Truck, Wrench } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { cn } from "@/lib/utils"

type TaskStatus = "todo" | "in-progress" | "review" | "done"

type Task = {
  id: string
  title: string
  subcontractor: string
  due: string
  progress: number
  trade: "electrical" | "plumbing" | "concrete" | "logistics"
}

const TRADE_META: Record<
  Task["trade"],
  { label: string; icon: React.ReactNode; color: string }
> = {
  electrical: {
    label: "חשמל",
    icon: <Wrench className="size-3" />,
    color:
      "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300",
  },
  plumbing: {
    label: "אינסטלציה",
    icon: <Layers3 className="size-3" />,
    color:
      "border-sky-300 bg-sky-50 text-sky-700 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-300",
  },
  concrete: {
    label: "שלד",
    icon: <Hammer className="size-3" />,
    color:
      "border-slate-300 bg-slate-50 text-slate-700 dark:border-slate-800 dark:bg-slate-900/40 dark:text-slate-300",
  },
  logistics: {
    label: "לוגיסטיקה",
    icon: <Truck className="size-3" />,
    color:
      "border-violet-300 bg-violet-50 text-violet-700 dark:border-violet-900 dark:bg-violet-950/40 dark:text-violet-300",
  },
}

const COLUMN_TITLE: Record<TaskStatus, string> = {
  todo: "לביצוע",
  "in-progress": "בעבודה",
  review: "בבדיקה",
  done: "הושלם",
}

const COLUMN_TONE: Record<TaskStatus, string> = {
  todo: "border-slate-300 bg-slate-50 dark:border-slate-800 dark:bg-slate-900/40",
  "in-progress":
    "border-amber-300 bg-amber-50/60 dark:border-amber-900 dark:bg-amber-950/30",
  review:
    "border-sky-300 bg-sky-50/60 dark:border-sky-900 dark:bg-sky-950/30",
  done: "border-emerald-300 bg-emerald-50/60 dark:border-emerald-900 dark:bg-emerald-950/30",
}

const TASKS: Record<TaskStatus, Task[]> = {
  todo: [
    {
      id: "t-1",
      title: "התקנת תעלות חשמל קומה -1",
      subcontractor: "חשמל ישיר",
      due: "12 מאי",
      progress: 0,
      trade: "electrical",
    },
    {
      id: "t-2",
      title: "אספקת בלוקים שלד C",
      subcontractor: "אבן וגרניט",
      due: "14 מאי",
      progress: 0,
      trade: "logistics",
    },
  ],
  "in-progress": [
    {
      id: "t-3",
      title: "יציקת ריצפת מרתף 2",
      subcontractor: "שלד אורן",
      due: "10 מאי",
      progress: 65,
      trade: "concrete",
    },
    {
      id: "t-4",
      title: "פריסת קולחים אנכיים",
      subcontractor: "סנפיר אינסטלציה",
      due: "11 מאי",
      progress: 42,
      trade: "plumbing",
    },
    {
      id: "t-5",
      title: "צנרת חשמל קומה 1",
      subcontractor: "חשמל ישיר",
      due: "13 מאי",
      progress: 28,
      trade: "electrical",
    },
  ],
  review: [
    {
      id: "t-6",
      title: "בדיקת הארקות מרתף",
      subcontractor: "חשמל ישיר",
      due: "9 מאי",
      progress: 90,
      trade: "electrical",
    },
    {
      id: "t-7",
      title: "פרצוף יציקת קומה 0",
      subcontractor: "שלד אורן",
      due: "9 מאי",
      progress: 100,
      trade: "concrete",
    },
  ],
  done: [
    {
      id: "t-8",
      title: "ביסוס + עוגנים",
      subcontractor: "שלד אורן",
      due: "1 מאי",
      progress: 100,
      trade: "concrete",
    },
    {
      id: "t-9",
      title: "פתיחת אתר + תכניות סטטוטוריות",
      subcontractor: "ב.ב. תכנון",
      due: "20 אפריל",
      progress: 100,
      trade: "logistics",
    },
  ],
}

const STATUSES: TaskStatus[] = ["todo", "in-progress", "review", "done"]

export function GanttInvestorHero() {
  return (
    <section
      dir="rtl"
      className="relative mb-6 overflow-hidden rounded-3xl border border-slate-200 bg-gradient-to-br from-white via-slate-50 to-slate-100 p-6 shadow-[0_18px_60px_-30px_rgba(15,23,42,0.45)] dark:border-slate-800 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950"
      data-investor-pitch="gantt-hero"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-32 -left-32 h-72 w-72 rounded-full bg-gradient-to-tr from-violet-400/25 to-transparent blur-3xl"
      />

      <div className="relative mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1.5">
          <Badge
            variant="secondary"
            className="border border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-900 dark:bg-violet-950/50 dark:text-violet-300"
          >
            <Layers3 className="me-1 size-3" />
            Live Subcontractor Board
          </Badge>
          <h2 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-50">
            ביצוע חי — קבלני משנה
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            סטטוס משימות בזמן אמת מהשטח · עדכון אוטומטי מ-Field App
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <span className="size-2 animate-pulse rounded-full bg-emerald-500" />
          מסונכרן · עכשיו
        </div>
      </div>

      <div className="relative grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {STATUSES.map((status) => (
          <Card
            key={status}
            className={cn(
              "min-h-[420px] border p-3 shadow-sm",
              COLUMN_TONE[status],
            )}
          >
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-50">
                {COLUMN_TITLE[status]}
              </h3>
              <Badge
                variant="outline"
                className="bg-white/80 text-[11px] dark:bg-slate-950/60"
              >
                {TASKS[status].length}
              </Badge>
            </div>
            <div className="space-y-2">
              {TASKS[status].map((t) => {
                const trade = TRADE_META[t.trade]
                return (
                  <div
                    key={t.id}
                    className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm transition-shadow hover:shadow-md dark:border-slate-800 dark:bg-slate-900"
                  >
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <Badge
                        variant="outline"
                        className={cn(
                          "gap-1 text-[10px]",
                          trade.color,
                        )}
                      >
                        {trade.icon}
                        {trade.label}
                      </Badge>
                      <span className="text-[10px] text-slate-500">
                        {t.due}
                      </span>
                    </div>
                    <p className="text-sm font-medium text-slate-800 dark:text-slate-100">
                      {t.title}
                    </p>
                    <p className="mt-0.5 text-[11px] text-slate-500">
                      {t.subcontractor}
                    </p>
                    <Progress value={t.progress} className="mt-2 h-1" />
                  </div>
                )
              })}
            </div>
          </Card>
        ))}
      </div>
    </section>
  )
}
