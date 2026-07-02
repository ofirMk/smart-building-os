"use client"

import { useState, useTransition } from "react"
import { toast } from "sonner"
import { ChevronDown, ChevronRight, Loader2, PackageCheck } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"

import { assignOnboardingTask, skipOnboardingTask, updateOnboardingTaskStatus } from "@/app/actions/onboarding"
import {
  PHASE_LABELS,
  TASK_STATUS_LABELS,
  type ErpOnboardingConfig,
  type ErpOnboardingTaskInstance,
  type OnboardingPhase,
  type TaskStatus,
} from "@/types/onboarding"
import { cn } from "@/lib/utils"

// ─────────────────────────────────────────────────────────────────────────────
// Local types
// ─────────────────────────────────────────────────────────────────────────────

type Supplier = { id: string; name: string; supplier_kind: string }

interface Props {
  config: ErpOnboardingConfig
  initialTasks: ErpOnboardingTaskInstance[]
  suppliers: Supplier[]
  onAllAssigned: () => void
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const PHASE_ORDER: OnboardingPhase[] = ["setup", "commissioning", "handover"]

function statusColor(s: TaskStatus): string {
  const map: Record<TaskStatus, string> = {
    pending: "bg-slate-100 text-slate-600",
    assigned: "bg-blue-100 text-blue-700",
    in_progress: "bg-amber-100 text-amber-700",
    done: "bg-emerald-100 text-emerald-700",
    skipped: "bg-slate-100 text-slate-400 line-through",
  }
  return map[s]
}

// ─────────────────────────────────────────────────────────────────────────────
// TaskRow
// ─────────────────────────────────────────────────────────────────────────────

function TaskRow({
  task,
  suppliers,
  onMutated,
}: {
  task: ErpOnboardingTaskInstance
  suppliers: Supplier[]
  onMutated: (updated: Partial<ErpOnboardingTaskInstance> & { id: string }) => void
}) {
  const [supplierId, setSupplierId] = useState(task.assigned_to_supplier_id ?? "")
  const [startDate, setStartDate] = useState(task.scheduled_start_date ?? "")
  const [endDate, setEndDate]     = useState(task.scheduled_end_date ?? "")
  const [isPending, startTransition] = useTransition()
  const [expanded, setExpanded] = useState(false)

  const canAssign = task.status === "pending" || task.status === "assigned"
  const canDone   = task.status === "in_progress" || task.status === "assigned"
  const canSkip   = !task.is_mandatory && task.status === "pending"

  function handleAssign() {
    if (!supplierId) {
      toast.error("יש לבחור ספק לפני שיבוץ")
      return
    }
    startTransition(async () => {
      const result = await assignOnboardingTask({
        taskId: task.id,
        supplierId,
        scheduledStartDate: startDate || undefined,
        scheduledEndDate: endDate || undefined,
      })
      if (!result.ok) {
        toast.error(result.error ?? "שגיאה בשיבוץ")
        return
      }
      toast.success("פקודת עבודה נוצרה ושובצה")
      onMutated({
        id: task.id,
        status: "assigned",
        assigned_to_supplier_id: supplierId,
        work_order_id: result.data.workOrderId,
        scheduled_start_date: startDate || null,
        scheduled_end_date: endDate || null,
      })
    })
  }

  function handleDone() {
    startTransition(async () => {
      const result = await updateOnboardingTaskStatus(task.id, "done")
      if (!result.ok) { toast.error(result.error ?? "שגיאה"); return }
      toast.success("משימה סומנה כהושלמה")
      onMutated({ id: task.id, status: "done" })
    })
  }

  function handleSkip() {
    startTransition(async () => {
      const result = await skipOnboardingTask(task.id, "דולג ידנית על ידי מנהל")
      if (!result.ok) { toast.error(result.error ?? "שגיאה"); return }
      onMutated({ id: task.id, status: "skipped", is_skipped: true })
    })
  }

  return (
    <div
      className={cn(
        "border rounded-lg transition-all",
        task.status === "done" ? "border-emerald-200 bg-emerald-50/30" :
        task.status === "skipped" ? "border-slate-100 bg-slate-50/50 opacity-60" :
        "border-border bg-card"
      )}
    >
      {/* Row header */}
      <button
        className="w-full text-right px-4 py-3 flex items-center gap-3"
        onClick={() => setExpanded((v) => !v)}
      >
        {expanded
          ? <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
          : <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />}
        <span className="flex-1 font-medium text-sm">{task.title}</span>
        {task.is_mandatory && (
          <span className="text-xs text-amber-600 font-medium shrink-0">חובה</span>
        )}
        <span className={cn("text-xs px-2 py-0.5 rounded-full shrink-0", statusColor(task.status))}>
          {TASK_STATUS_LABELS[task.status]}
        </span>
        <Badge variant="outline" className="text-xs shrink-0">{task.category}</Badge>
      </button>

      {/* Expanded assignment panel */}
      {expanded && (
        <div className="px-4 pb-4 pt-1 border-t space-y-3">
          {task.description && (
            <p className="text-xs text-muted-foreground leading-relaxed">{task.description}</p>
          )}

          {canAssign && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
              {/* Supplier */}
              <div className="space-y-1">
                <Label className="text-xs">ספק מבצע</Label>
                <Select value={supplierId} onValueChange={(v) => setSupplierId(v ?? "")} disabled={!canAssign || isPending}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="בחרו ספק" />
                  </SelectTrigger>
                  <SelectContent>
                    {suppliers.map((s) => (
                      <SelectItem key={s.id} value={s.id} className="text-xs">
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Dates */}
              <div className="space-y-1">
                <Label className="text-xs">תאריך התחלה</Label>
                <Input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="h-8 text-xs"
                  disabled={isPending}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">תאריך סיום</Label>
                <Input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="h-8 text-xs"
                  disabled={isPending}
                />
              </div>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex gap-2">
            {canAssign && (
              <Button size="sm" onClick={handleAssign} disabled={isPending} className="gap-1 text-xs">
                {isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                {task.status === "assigned" ? "עדכן שיבוץ" : "צור פקודת עבודה"}
              </Button>
            )}
            {canDone && (
              <Button size="sm" variant="outline" onClick={handleDone} disabled={isPending} className="text-xs">
                סמן כהושלם ✓
              </Button>
            )}
            {canSkip && (
              <Button size="sm" variant="ghost" onClick={handleSkip} disabled={isPending} className="text-xs text-muted-foreground">
                דלג
              </Button>
            )}
            {task.work_order_id && (
              <span className="text-xs text-muted-foreground self-center mr-auto">
                פ"ע: {task.work_order_id.slice(0, 8)}...
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// PipelineView
// ─────────────────────────────────────────────────────────────────────────────

export function PipelineView({ config, initialTasks, suppliers, onAllAssigned }: Props) {
  const [tasks, setTasks] = useState(initialTasks)

  function handleMutated(updated: Partial<ErpOnboardingTaskInstance> & { id: string }) {
    setTasks((prev) =>
      prev.map((t) => (t.id === updated.id ? { ...t, ...updated } : t))
    )
  }

  const grouped = PHASE_ORDER.reduce(
    (acc, phase) => {
      acc[phase] = tasks.filter((t) => t.phase === phase)
      return acc
    },
    {} as Record<OnboardingPhase, ErpOnboardingTaskInstance[]>
  )

  const totalMandatory  = tasks.filter((t) => t.is_mandatory).length
  const assignedOrDone  = tasks.filter((t) => ["assigned","in_progress","done"].includes(t.status)).length
  const allActionable   = tasks.filter((t) => !["skipped"].includes(t.status)).length
  const pct = allActionable > 0 ? Math.round((assignedOrDone / allActionable) * 100) : 0

  return (
    <div className="space-y-6">
      {/* Progress summary */}
      <Card className="bg-muted/40">
        <CardContent className="pt-4 pb-4">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">
              {assignedOrDone} / {allActionable} משימות שובצו
            </span>
            <span className="font-medium">{pct}% הושלמו</span>
          </div>
          <div className="mt-2 h-2 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {totalMandatory} משימות חובה · {tasks.length - totalMandatory} אופציונליות
          </p>
        </CardContent>
      </Card>

      {/* Phase sections */}
      {PHASE_ORDER.map((phase) => {
        const phaseTasks = grouped[phase]
        if (!phaseTasks.length) return null
        const phaseDone = phaseTasks.filter((t) => t.status === "done").length
        return (
          <div key={phase}>
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold">{PHASE_LABELS[phase]}</h2>
              <span className="text-xs text-muted-foreground">
                {phaseDone}/{phaseTasks.length} ✓
              </span>
            </div>
            <div className="space-y-2">
              {phaseTasks.map((task) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  suppliers={suppliers}
                  onMutated={handleMutated}
                />
              ))}
            </div>
            {phase !== "handover" && <Separator className="mt-6" />}
          </div>
        )
      })}

      {/* CTA to readiness */}
      {assignedOrDone > 0 && (
        <div className="flex justify-start pt-2">
          <Button onClick={onAllAssigned} variant="default" className="gap-2">
            <PackageCheck className="w-4 h-4" />
            עבור למעקב מוכנות ←
          </Button>
        </div>
      )}
    </div>
  )
}
