"use client"

import * as React from "react"
import { AlertTriangle, Link2 } from "lucide-react"
import Link from "next/link"

import {
  updateDerivativeTaskBillingLink,
  type GanttTaskRow,
} from "@/lib/marker-ofek/gantt-actions"
import {
  derivativeIsDiamondAlert,
  linearTimelinePercent,
  masterTaskForDerivative,
  type DerivativeScheduleRow,
} from "@/lib/marker-ofek/derivative-gantt"
import { cn, formatError } from "@/lib/utils"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { buttonVariants } from "@/components/ui/button-variants"
import { toast } from "sonner"

type ContractOption = { id: string; label: string }

export default function SubcontractorSyncClient({
  projectId,
  initialTasks,
  todayIso,
  entityNames,
  contractOptions,
}: {
  projectId: string
  initialTasks: GanttTaskRow[]
  todayIso: string
  entityNames: Record<string, string>
  contractOptions: ContractOption[]
}) {
  const [tasks, setTasks] = React.useState(initialTasks)
  const [busyId, setBusyId] = React.useState<string | null>(null)

  React.useEffect(() => {
    setTasks(initialTasks)
  }, [initialTasks])

  const derivatives = React.useMemo(
    () => tasks.filter((t) => t.is_derivative),
    [tasks]
  )
  const derivSlice = derivatives as DerivativeScheduleRow[]

  async function onContractChange(taskId: string, value: string) {
    const contractId = value === "__none__" ? null : value
    setBusyId(taskId)
    try {
      await updateDerivativeTaskBillingLink({ projectId, taskId, contractId })
      setTasks((prev) =>
        prev.map((t) => (t.id === taskId ? { ...t, contract_id: contractId } : t))
      )
      toast.success("קישור חוזה עודכן.")
    } catch (e) {
      toast.error(formatError(e))
    } finally {
      setBusyId(null)
    }
  }

  if (derivatives.length === 0) {
    return (
      <div className="rounded-xl border border-slate-100 bg-white p-8 text-center text-sm text-slate-600 shadow-sm">
        אין משימות נגזרות בפרויקט. צרו משימת נגזרת קשורה למאסטר דרך פעולת השרת{" "}
        <code className="rounded bg-slate-100 px-1">createDerivativeTask</code> או עדכון DB לאחר
        המיגרציה.
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-slate-500">
        עמודות משווים בין לו״ז המאסטר (פרויקט) לבין דיווח חברת הביצוע. סימון אדום — פער מהלו״ז הבסיסי.
      </p>
      <ul className="space-y-3">
        {derivatives.map((row) => {
          const master = masterTaskForDerivative(derivSlice, row as DerivativeScheduleRow)
          const diamond = derivativeIsDiamondAlert(
            row as DerivativeScheduleRow,
            master,
            todayIso
          )
          const masterExpected = master
            ? linearTimelinePercent(master.start_date, master.end_date, todayIso)
            : null
          const subName =
            row.subcontractor_id && entityNames[row.subcontractor_id]
              ? entityNames[row.subcontractor_id]
              : row.subcontractor_id
                ? row.subcontractor_id.slice(0, 8) + "…"
                : "ללא ישות"

          return (
            <li
              key={row.id}
              className={`rounded-xl border p-4 shadow-sm ${
                diamond ? "border-red-300 bg-red-50/80" : "border-slate-100 bg-white"
              }`}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 space-y-1">
                  <div className="flex items-center gap-2">
                    {diamond ? (
                      <AlertTriangle className="size-4 shrink-0 text-red-600" aria-hidden />
                    ) : null}
                    <p className="font-semibold text-[#0f172a]">{row.name}</p>
                  </div>
                  <p className="text-xs text-slate-500">
                    ספק ביצוע: {subName}
                    {master ? (
                      <>
                        {" · "}
                        מאסטר: <span className="font-medium text-slate-700">{master.name}</span>
                      </>
                    ) : null}
                  </p>
                </div>
                {row.contract_id ? (
                  <Link
                    href={`/marker-ofek/finance/contracts/${row.contract_id}`}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-500"
                  >
                    <Link2 className="size-3.5" aria-hidden />
                    מרכז חיוב
                  </Link>
                ) : null}
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                    מאסטר — לו״ז
                  </p>
                  <p className="font-currency-mono text-sm tabular-nums text-slate-700">
                    {master?.start_date ?? "—"} → {master?.end_date ?? "—"}
                  </p>
                  <div className="mt-1 flex items-center gap-2">
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full bg-slate-400"
                        style={{
                          width: `${Math.round(Number(master?.progress) || 0)}%`,
                        }}
                      />
                    </div>
                    <span className="text-xs font-semibold tabular-nums text-slate-600">
                      {Math.round(Number(master?.progress) || 0)}%
                    </span>
                  </div>
                  {masterExpected != null ? (
                    <p className="mt-1 text-[11px] text-slate-500">
                      צפי ליניארי להיום: {masterExpected}%
                    </p>
                  ) : null}
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                    ספק ביצוע
                  </p>
                  <p className="font-currency-mono text-sm tabular-nums text-slate-700">
                    {row.start_date ?? "—"} → {row.end_date ?? "—"}
                  </p>
                  <div className="mt-1 flex items-center gap-2">
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className={`h-full rounded-full ${diamond ? "bg-red-500" : "bg-indigo-500"}`}
                        style={{
                          width: `${Math.round(Number(row.progress) || 0)}%`,
                        }}
                      />
                    </div>
                    <span className="text-xs font-semibold tabular-nums text-slate-600">
                      {Math.round(Number(row.progress) || 0)}%
                    </span>
                  </div>
                </div>
              </div>

              <div className="mt-4 flex flex-col gap-2 border-t border-slate-100 pt-3 sm:flex-row sm:items-center">
                <span className="text-xs font-medium text-slate-500">חוזה לחיוב:</span>
                <Select
                  disabled={busyId === row.id}
                  value={row.contract_id ?? "__none__"}
                  onValueChange={(v) => void onContractChange(String(row.id), String(v))}
                >
                  <SelectTrigger className="h-9 w-full max-w-xs border-slate-200 bg-white text-start text-xs">
                    <SelectValue placeholder="בחרו חוזה" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">ללא קישור</SelectItem>
                    {contractOptions.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Link
                  href={`/marker-ofek/execution/gantt/${projectId}/field`}
                  className={cn(buttonVariants({ variant: "outline", size: "sm" }), "w-fit border-slate-200")}
                >
                  תצוגת שטח
                </Link>
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
