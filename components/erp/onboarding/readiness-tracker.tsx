"use client"

import { useTransition } from "react"
import { toast } from "sonner"
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

import { completeOnboarding, computeReadiness } from "@/app/actions/onboarding"
import {
  PHASE_LABELS,
  TASK_STATUS_LABELS,
  type ErpOnboardingConfig,
  type ErpOnboardingTaskInstance,
  type OnboardingPhase,
} from "@/types/onboarding"
import { cn } from "@/lib/utils"

// ─────────────────────────────────────────────────────────────────────────────
// SVG Score Ring
// ─────────────────────────────────────────────────────────────────────────────

function ScoreRing({ pct }: { pct: number }) {
  const SIZE   = 140
  const STROKE = 10
  const R      = (SIZE - STROKE) / 2
  const CIRC   = 2 * Math.PI * R
  const offset = CIRC * (1 - pct / 100)

  const color =
    pct >= 100 ? "#22c55e" :
    pct >= 60  ? "#f59e0b" :
                 "#ef4444"

  return (
    <svg width={SIZE} height={SIZE} className="-rotate-90" aria-hidden="true">
      {/* Track */}
      <circle
        cx={SIZE / 2} cy={SIZE / 2} r={R}
        fill="none"
        strokeWidth={STROKE}
        className="stroke-muted"
      />
      {/* Progress */}
      <circle
        cx={SIZE / 2} cy={SIZE / 2} r={R}
        fill="none"
        stroke={color}
        strokeWidth={STROKE}
        strokeLinecap="round"
        strokeDasharray={CIRC}
        strokeDashoffset={offset}
        style={{ transition: "stroke-dashoffset 0.6s ease" }}
      />
    </svg>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase progress bar
// ─────────────────────────────────────────────────────────────────────────────

function PhaseBar({
  phase,
  total,
  done,
}: {
  phase: OnboardingPhase
  total: number
  done: number
}) {
  const pct = total === 0 ? 100 : Math.round((done / total) * 100)
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-muted-foreground">{PHASE_LABELS[phase]}</span>
        <span className="font-medium">
          {done}/{total}
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
        <div
          className={cn(
            "h-full rounded-full transition-all",
            pct === 100 ? "bg-emerald-500" : "bg-primary"
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// ReadinessTracker
// ─────────────────────────────────────────────────────────────────────────────

interface Props {
  config: ErpOnboardingConfig
  tasks: ErpOnboardingTaskInstance[]
}

export function ReadinessTracker({ config, tasks }: Props) {
  const [isPending, startTransition] = useTransition()

  const readiness = computeReadiness(tasks)
  const { scorePct, doneCount, mandatoryTotal, byPhase, blockingTasks } = readiness

  const isComplete = config.status === "completed"

  function handleComplete() {
    startTransition(async () => {
      const result = await completeOnboarding(config.id)
      if (!result.ok) {
        toast.error(result.error ?? "שגיאה בסגירת ההקמה")
        return
      }
      toast.success("ההקמה הושלמה בהצלחה! הבניין פעיל.")
    })
  }

  return (
    <div className="space-y-6">
      {/* Score header */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row items-center gap-8">
            {/* Ring */}
            <div className="relative shrink-0">
              <ScoreRing pct={scorePct} />
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-3xl font-bold">{scorePct}%</span>
                <span className="text-xs text-muted-foreground">מוכנות</span>
              </div>
            </div>

            {/* Summary text */}
            <div className="flex-1 space-y-1 text-center sm:text-right">
              <h2 className="text-xl font-bold">
                {scorePct === 100 ? "הבניין מוכן להפעלה!" : "ההקמה בתהליך"}
              </h2>
              <p className="text-sm text-muted-foreground">
                {doneCount} מתוך {mandatoryTotal} משימות חובה הושלמו
              </p>
              {isComplete && (
                <div className="flex items-center gap-1 justify-center sm:justify-start text-emerald-600 text-sm font-medium mt-2">
                  <CheckCircle2 className="w-4 h-4" />
                  ההקמה נסגרה רשמית ·{" "}
                  {config.completed_at
                    ? new Date(config.completed_at).toLocaleDateString("he-IL")
                    : ""}
                </div>
              )}
            </div>

            {/* CTA */}
            {!isComplete && (
              <div className="shrink-0">
                <Button
                  onClick={handleComplete}
                  disabled={isPending || blockingTasks.length > 0}
                  className="gap-2"
                  title={blockingTasks.length > 0 ? "יש משימות חובה פתוחות" : ""}
                >
                  {isPending
                    ? <Loader2 className="w-4 h-4 animate-spin" />
                    : <CheckCircle2 className="w-4 h-4" />}
                  אשר השלמת הקמה
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Phase breakdown */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">התקדמות לפי שלב</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {(["setup", "commissioning", "handover"] as OnboardingPhase[]).map((phase) => (
            <PhaseBar
              key={phase}
              phase={phase}
              total={byPhase[phase].total}
              done={byPhase[phase].done}
            />
          ))}
        </CardContent>
      </Card>

      {/* Blocking tasks */}
      {blockingTasks.length > 0 && (
        <Card className="border-amber-200 bg-amber-50/40">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2 text-amber-700">
              <AlertCircle className="w-4 h-4" />
              {blockingTasks.length} משימות חובה ממתינות
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {blockingTasks.map((t) => (
                <li key={t.id} className="flex items-center justify-between text-sm">
                  <span>{t.title}</span>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs">{PHASE_LABELS[t.phase]}</Badge>
                    <span className="text-xs text-muted-foreground">
                      {TASK_STATUS_LABELS[t.status]}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* All tasks summary */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">כל המשימות</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-1">
            {tasks.map((t) => (
              <div key={t.id} className="flex items-center justify-between text-xs py-1 border-b last:border-0">
                <span className={cn(t.status === "skipped" && "line-through text-muted-foreground")}>
                  {t.title}
                </span>
                <div className="flex items-center gap-2">
                  {t.is_mandatory && (
                    <span className="text-amber-600">חובה</span>
                  )}
                  <span
                    className={cn(
                      "px-1.5 py-0.5 rounded",
                      t.status === "done"       ? "bg-emerald-100 text-emerald-700" :
                      t.status === "assigned"   ? "bg-blue-100 text-blue-700" :
                      t.status === "in_progress"? "bg-amber-100 text-amber-700" :
                      t.status === "skipped"    ? "bg-slate-100 text-slate-400" :
                                                  "bg-slate-100 text-slate-600"
                    )}
                  >
                    {TASK_STATUS_LABELS[t.status]}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
