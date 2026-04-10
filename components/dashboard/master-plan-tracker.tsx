"use client"

import type { ReactNode } from "react"
import {
  Bot,
  CheckCircle2,
  Circle,
  Loader2,
  Workflow,
} from "lucide-react"

import { cn } from "@/lib/utils"

export type PlanStatus = "completed" | "current" | "pending"

export interface MasterPlanStep {
  id: number
  title: string
  subtitle: string
  status: PlanStatus
  icon?: ReactNode
}

export const MILESTONES = [
  {
    id: 1,
    title: "שלב 1: הקמת מעטפת המערכת (The Shell)",
    subtitle: "Layout, Sidebar, Topbar",
    status: "completed",
  },
  {
    id: 2,
    title: "שלב 2: תבנית רשימת נתונים (Data Grid)",
    subtitle: "Standardizing tables and white cards",
    status: "completed",
  },
  {
    id: 3,
    title: "שלב 3: תבנית מסך אב-בן (Master-Detail)",
    subtitle: "Priority-style edit screens with tabs",
    status: "completed",
  },
  {
    id: 4,
    title: "שלב 4: ליבת קבלנים ופיננסים (Contractor Core)",
    subtitle: "BOQ, CBS Indexing, Partial Accounts",
    status: "current",
  },
  {
    id: 5,
    title: "שלב 5: סוכני בינה מלאכותית (AI Agents)",
    subtitle: "OCR Ingest, Auto-Gantt Billing & Smart Sidekick",
    status: "pending",
  },
] as const satisfies readonly MasterPlanStep[]

function stepAccentIcon(id: number): ReactNode {
  switch (id) {
    case 1:
      return <Workflow className="size-3.5 opacity-80" aria-hidden />
    case 5:
      return <Bot className="size-3.5 opacity-80" aria-hidden />
    default:
      return null
  }
}

function StepNode({ status }: { status: PlanStatus }) {
  if (status === "completed") {
    return (
      <div
        className="relative z-[1] flex size-9 shrink-0 items-center justify-center rounded-full bg-green-500 text-white shadow-sm ring-4 ring-green-500/15"
        aria-hidden
      >
        <CheckCircle2 className="size-[18px] stroke-[2]" aria-hidden />
      </div>
    )
  }
  if (status === "current") {
    return (
      <div
        className="relative z-[1] flex size-9 shrink-0 items-center justify-center rounded-full bg-blue-600 shadow-sm ring-4 ring-blue-600/25 animate-pulse"
        aria-hidden
      >
        <Loader2 className="size-4 animate-spin text-white" aria-hidden />
      </div>
    )
  }
  return (
    <div
      className="relative z-[1] flex size-9 shrink-0 items-center justify-center rounded-full border-2 border-slate-300 bg-white text-slate-400 shadow-sm dark:border-slate-600 dark:bg-slate-900"
      aria-hidden
    >
      <Circle className="size-4" strokeWidth={2} aria-hidden />
    </div>
  )
}

/** Vertical segment to the next step — style follows this step’s status. */
function Connector({ status }: { status: PlanStatus }) {
  if (status === "completed") {
    return (
      <div
        className="h-14 w-[3px] shrink-0 rounded-full bg-green-500"
        aria-hidden
      />
    )
  }
  if (status === "current") {
    return (
      <div className="flex h-14 w-6 shrink-0 justify-center" aria-hidden>
        <div className="h-full w-0 border-s-2 border-dashed border-blue-600" />
      </div>
    )
  }
  return (
    <div
      className="h-14 w-[3px] shrink-0 rounded-full bg-slate-200 dark:bg-slate-700"
      aria-hidden
    />
  )
}

/**
 * Visual rollout tracker — milestones with status lights for the Holden ERP upgrade plan.
 * Vertical timeline; rail on the visual right in RTL.
 */
export function MasterPlanTracker() {
  return (
    <section
      dir="rtl"
      lang="he"
      className="rounded-2xl border border-slate-200 bg-white p-5 shadow-md dark:border-slate-700/80 dark:bg-slate-950"
      aria-labelledby="master-plan-tracker-heading"
    >
      <h2
        id="master-plan-tracker-heading"
        className="text-start text-base font-bold tracking-tight text-slate-900 dark:text-slate-50"
      >
        מפת דרכים - שדרוג מערכת Holden ERP
      </h2>
      <p className="mt-1 text-start text-[12px] text-muted-foreground">
        תוכנית הנדסה לאחור — שלבים וסטטוס ביצוע
      </p>

      <ol className="mt-5 flex flex-col">
        {MILESTONES.map((step, index) => {
          const isLast = index === MILESTONES.length - 1
          const accent = stepAccentIcon(step.id)
          return (
            <li key={step.id} className="flex gap-4">
              <div className="flex w-11 shrink-0 flex-col items-center">
                <StepNode status={step.status} />
                {!isLast ? <Connector status={step.status} /> : null}
              </div>
              <div
                className={cn(
                  "min-w-0 flex-1 pb-8 text-start",
                  isLast && "pb-0"
                )}
              >
                <p
                  className={cn(
                    "flex flex-wrap items-center gap-1.5 text-sm font-semibold leading-snug",
                    step.status === "completed" &&
                      "text-green-800 dark:text-green-400",
                    step.status === "current" &&
                      "text-blue-800 dark:text-blue-400",
                    step.status === "pending" &&
                      "text-slate-600 dark:text-slate-400"
                  )}
                >
                  {accent}
                  <span>{step.title}</span>
                </p>
                <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
                  {step.subtitle}
                </p>
                <p className="mt-1.5 text-[10px] font-medium uppercase tracking-wide text-slate-400">
                  {step.status === "completed" && "הושלם"}
                  {step.status === "current" && "בעבודה"}
                  {step.status === "pending" && "ממתין"}
                </p>
              </div>
            </li>
          )
        })}
      </ol>
    </section>
  )
}
