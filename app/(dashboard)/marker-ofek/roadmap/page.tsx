"use client"

import * as React from "react"
import { motion, useReducedMotion } from "framer-motion"
import {
  ArrowLeft,
  CheckCircle2,
  CircleDot,
  GitBranch,
  Hammer,
  Layers,
  Map,
  Package,
  Sparkles,
  Truck,
  Wallet,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

type PhaseStatus = "done" | "in_progress" | "todo"

type SubTask = {
  id: string
  code: string
  title: string
  detail: string
  status: PhaseStatus
  highlight?: "next"
}

type Phase = {
  id: string
  index: number
  title: string
  subtitle: string
  status: PhaseStatus
  /** 0–1 — אחוז התקדמות לפס התרשים */
  progress: number
  icon: React.ComponentType<{ className?: string }>
  dependsOn: number | null
  tasks: SubTask[]
}

const PHASES: Phase[] = [
  {
    id: "p1",
    index: 1,
    title: "יסודות נתוני מאסטר",
    subtitle: "Master Data Foundations",
    status: "in_progress",
    progress: 0.6,
    icon: Layers,
    dependsOn: null,
    tasks: [
      {
        id: "1.1",
        code: "1.1",
        title: "Business Partner מאוחד",
        detail: "ממשק BP + סכמת Zod — UI הושלם, סכמה הושלמה.",
        status: "done",
      },
      {
        id: "1.2",
        code: "1.2",
        title: "קטלוג פריטים טכני",
        detail: "מק״ט מאסטר, יחידות ומחירוני בסיס — המשימה הבאה בתור.",
        status: "todo",
        highlight: "next",
      },
    ],
  },
  {
    id: "p2",
    index: 2,
    title: "רכש ושרשרת אספקה",
    subtitle: "Procurement & Supply Chain",
    status: "todo",
    progress: 0,
    icon: Truck,
    dependsOn: 1,
    tasks: [
      {
        id: "2.1",
        code: "2.1",
        title: "מנוע הזמנות נעול תקציב",
        detail: "PO עם בקרת תקציב WBS ואישורים.",
        status: "todo",
      },
      {
        id: "2.2",
        code: "2.2",
        title: "התאמה תלת-צדדית וקליטת סחורה",
        detail: "Three-way match + GR מול PO.",
        status: "todo",
      },
    ],
  },
  {
    id: "p3",
    index: 3,
    title: "ביצוע תפעולי",
    subtitle: "Operational Execution",
    status: "todo",
    progress: 0,
    icon: Hammer,
    dependsOn: 2,
    tasks: [
      {
        id: "3.1",
        code: "3.1",
        title: "ניהול אתר ויומני עבודה",
        detail: "שילוב יומני שטח למסלול הביצוע.",
        status: "todo",
      },
      {
        id: "3.2",
        code: "3.2",
        title: "גאנט ביצוע חי (לוגיקת פרויקט)",
        detail: "Gantt פרויקטלי מחובר ל-WBS ומשאבים.",
        status: "todo",
      },
    ],
  },
  {
    id: "p4",
    index: 4,
    title: "בקרה כספית וסגירת V1",
    subtitle: "Financial Control & V1 Closure",
    status: "todo",
    progress: 0,
    icon: Wallet,
    dependsOn: 3,
    tasks: [
      {
        id: "4.1",
        code: "4.1",
        title: "חיוב קבלני משנה ועכבון",
        detail: "חשבונות חלקיים, retention, אינטגרציה לכספים.",
        status: "todo",
      },
      {
        id: "4.2",
        code: "4.2",
        title: "מרכז פיקוד פרויקט 360",
        detail: "ליטוש אחרון — Hub תפעולי לפרויקט.",
        status: "todo",
      },
    ],
  },
]

function statusBadgeHe(s: PhaseStatus): { label: string; className: string } {
  switch (s) {
    case "done":
      return {
        label: "הושלם",
        className:
          "border-emerald-200 bg-emerald-50 text-emerald-900 shadow-none",
      }
    case "in_progress":
      return {
        label: "בביצוע",
        className: "border-sky-200 bg-sky-50 text-sky-950 shadow-none",
      }
    case "todo":
    default:
      return {
        label: "מתוכנן",
        className: "border-slate-200 bg-slate-50 text-slate-800 shadow-none",
      }
  }
}

function subStatusBadge(s: PhaseStatus): { label: string; className: string } {
  if (s === "done")
    return {
      label: "הושלם",
      className: "bg-emerald-100 text-emerald-900",
    }
  if (s === "in_progress")
    return {
      label: "בביצוע",
      className: "bg-sky-100 text-sky-900",
    }
  return {
    label: "מתוכנן",
    className: "bg-slate-100 text-slate-700",
  }
}

const listVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.06, delayChildren: 0.05 },
  },
}

const rowVariants = {
  hidden: { opacity: 0, y: 10 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.35, ease: [0.22, 1, 0.36, 1] as const },
  },
}

export default function LightmanRoadmapPage() {
  const reduce = useReducedMotion()

  return (
    <div
      dir="rtl"
      className="mx-auto w-full max-w-6xl space-y-8 px-3 pb-16 pt-2 md:px-6"
    >
      <header className="space-y-2 border-b border-slate-200 pb-6">
        <div className="flex flex-wrap items-center gap-2">
          <span className="flex size-9 items-center justify-center rounded-lg bg-slate-900 text-white shadow-sm">
            <Map className="size-4" aria-hidden />
          </span>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
              Lightman · פיתוח המערכת
            </p>
            <h1 className="text-balance text-2xl font-bold tracking-tight text-slate-900 md:text-3xl">
              Roadmap &amp; Development Gantt
            </h1>
          </div>
        </div>
        <p className="max-w-3xl text-sm leading-relaxed text-slate-600">
          לוח זמנים אסטרטגי לבניית ה-ERP — מעקב עבור הנהלת הפרויקט (Ophir).
          שלבים 2–4 <strong className="font-semibold text-slate-800">תלויים</strong>{" "}
          בהשלמת יעדי שלב 1 (נתוני מאסטר מאוחדים).
        </p>
      </header>

      {/* Horizontal Gantt strip */}
      <section
        aria-label="ציר שלבים אופקי"
        className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm md:p-5"
      >
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-bold text-slate-900">ציר שלבים (V1)</h2>
          <span className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-medium text-slate-600">
            <GitBranch className="size-3.5 text-slate-500" aria-hidden />
            תלות: כל שלב נשען על השלב שקדם לו
          </span>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {PHASES.map((phase, i) => {
            const Icon = phase.icon
            const badge = statusBadgeHe(phase.status)
            return (
              <motion.div
                key={phase.id}
                initial={reduce ? false : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  delay: reduce ? 0 : 0.05 + i * 0.07,
                  duration: 0.4,
                  ease: [0.22, 1, 0.36, 1] as const,
                }}
                className={cn(
                  "flex flex-col rounded-lg border border-slate-200 bg-slate-50/50 p-3",
                  phase.status === "in_progress" &&
                    "border-sky-200/80 bg-sky-50/30 ring-1 ring-sky-100"
                )}
              >
                <div className="mb-2 flex items-start justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-white text-slate-700 shadow-sm ring-1 ring-slate-200">
                      <Icon className="size-4" aria-hidden />
                    </span>
                    <div className="min-w-0">
                      <p className="text-[10px] font-bold text-slate-500">
                        שלב {phase.index}
                      </p>
                      <p className="truncate text-xs font-bold text-slate-900">
                        {phase.title}
                      </p>
                    </div>
                  </div>
                  <Badge
                    variant="outline"
                    className={cn("shrink-0 text-[10px] font-semibold", badge.className)}
                  >
                    {badge.label}
                  </Badge>
                </div>
                <p className="mb-2 line-clamp-2 text-[10px] leading-snug text-slate-500">
                  {phase.subtitle}
                </p>
                {phase.dependsOn != null ? (
                  <p className="mb-2 text-[10px] font-medium text-amber-800">
                    ← תלוי בשלב {phase.dependsOn}
                  </p>
                ) : (
                  <p className="mb-2 text-[10px] font-medium text-emerald-800">
                    נקודת כניסה — אין תלות קודמת
                  </p>
                )}
                <div className="mt-auto h-2 overflow-hidden rounded-full bg-slate-200/90">
                  <motion.div
                    className={cn(
                      "h-full rounded-full",
                      phase.progress >= 0.99
                        ? "bg-emerald-500"
                        : phase.progress > 0
                          ? "bg-sky-500"
                          : "bg-slate-300"
                    )}
                    initial={reduce ? false : { width: "0%" }}
                    animate={{ width: `${Math.round(phase.progress * 100)}%` }}
                    transition={{
                      duration: reduce ? 0 : 1.05,
                      ease: [0.22, 1, 0.36, 1] as const,
                      delay: reduce ? 0 : 0.15 + i * 0.08,
                    }}
                  />
                </div>
                <p className="mt-1.5 text-end text-[10px] font-currency-mono tabular-nums text-slate-500">
                  {Math.round(phase.progress * 100)}%
                </p>
              </motion.div>
            )
          })}
        </div>

        {/* Dependency flow (visual) */}
        <div className="mt-4 hidden items-center justify-between gap-1 border-t border-dashed border-slate-200 pt-4 lg:flex">
          {PHASES.map((phase, i) => (
            <React.Fragment key={`flow-${phase.id}`}>
              <div className="flex min-w-0 flex-1 flex-col items-center gap-1 text-center">
                <span className="text-[10px] font-bold text-slate-400">
                  {phase.index}
                </span>
                <div className="h-1 w-full max-w-[4rem] rounded-full bg-slate-200">
                  <motion.div
                    className="h-full rounded-full bg-gradient-to-l from-emerald-400 via-sky-400 to-violet-400"
                    initial={reduce ? false : { scaleX: 0 }}
                    animate={{ scaleX: 1 }}
                    style={{ transformOrigin: "right" }}
                    transition={{
                      duration: reduce ? 0 : 0.8,
                      delay: reduce ? 0 : 0.4 + i * 0.1,
                    }}
                  />
                </div>
              </div>
              {i < PHASES.length - 1 ? (
                <ArrowLeft
                  className="size-4 shrink-0 text-slate-300"
                  aria-hidden
                />
              ) : null}
            </React.Fragment>
          ))}
        </div>
      </section>

      {/* Detailed breakdown */}
      <motion.section
        variants={listVariants}
        initial="hidden"
        animate="show"
        className="space-y-4"
        aria-label="פירוט משימות לפי שלב"
      >
        <h2 className="text-sm font-bold text-slate-900">פירוט משימות</h2>
        {PHASES.map((phase) => {
          const Icon = phase.icon
          const phaseBadge = statusBadgeHe(phase.status)
          return (
            <motion.article
              key={phase.id}
              variants={rowVariants}
              className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"
            >
              <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 bg-slate-50/80 px-4 py-3">
                <span className="flex size-9 items-center justify-center rounded-lg bg-white text-slate-700 shadow-sm ring-1 ring-slate-200">
                  <Icon className="size-4" aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-bold text-slate-900">
                      שלב {phase.index}: {phase.title}
                    </h3>
                    <Badge
                      variant="outline"
                      className={cn("text-[10px] font-semibold", phaseBadge.className)}
                    >
                      {phaseBadge.label}
                    </Badge>
                  </div>
                  <p className="text-[11px] text-slate-500">{phase.subtitle}</p>
                </div>
                {phase.dependsOn != null ? (
                  <span className="inline-flex items-center gap-1 rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-[10px] font-semibold text-amber-950">
                    <GitBranch className="size-3" aria-hidden />
                    דורש שלב {phase.dependsOn}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-[10px] font-semibold text-emerald-900">
                    <Sparkles className="size-3" aria-hidden />
                    בסיס
                  </span>
                )}
              </div>
              <ul className="divide-y divide-slate-100">
                {phase.tasks.map((task) => {
                  const sb = subStatusBadge(task.status)
                  return (
                    <li
                      key={task.id}
                      className={cn(
                        "flex flex-col gap-1.5 px-4 py-3 sm:flex-row sm:items-start sm:justify-between",
                        task.highlight === "next" &&
                          "bg-amber-50/60 ring-1 ring-inset ring-amber-200/60"
                      )}
                    >
                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-[11px] font-bold text-slate-400">
                            {task.code}
                          </span>
                          <span className="text-sm font-semibold text-slate-900">
                            {task.title}
                          </span>
                          {task.highlight === "next" ? (
                            <Badge className="h-5 border-amber-300 bg-amber-100 text-[10px] font-bold text-amber-950">
                              המשימה הבאה
                            </Badge>
                          ) : null}
                        </div>
                        <p className="text-[12px] leading-relaxed text-slate-600">
                          {task.detail}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2 sm:flex-col sm:items-end">
                        <span
                          className={cn(
                            "rounded-full px-2 py-0.5 text-[10px] font-bold",
                            sb.className
                          )}
                        >
                          {sb.label}
                        </span>
                        {task.status === "done" ? (
                          <CheckCircle2 className="size-4 text-emerald-600" aria-hidden />
                        ) : task.status === "in_progress" ? (
                          <CircleDot className="size-4 text-sky-600" aria-hidden />
                        ) : (
                          <Package className="size-4 text-slate-400" aria-hidden />
                        )}
                      </div>
                    </li>
                  )
                })}
              </ul>
            </motion.article>
          )
        })}
      </motion.section>

      <footer className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-[11px] text-slate-500 shadow-sm">
        <p>
          מסמך חי — יעודכן עם סגירת משימות ב-Git. גרסת יעד:{" "}
          <strong className="font-semibold text-slate-800">ERP V1</strong>.
        </p>
      </footer>
    </div>
  )
}
