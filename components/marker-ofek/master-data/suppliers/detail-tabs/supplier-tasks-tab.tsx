"use client"

/**
 * Suppliers Master/Detail → Detail tab: משימות לספק.
 *
 * Priority parity: supplier tasks/to-dos (screenshots batch).
 * Each task has a date, handler, summary, and status.
 */

import * as React from "react"
import { CheckCircle2, Circle, XCircle } from "lucide-react"

import {
  MasterDetailTabEmpty,
  MasterDetailTabError,
  MasterDetailTabLoading,
} from "@/components/infrastructure/master-detail/master-detail-shell"
import { Badge } from "@/components/ui/badge"
import { masterDataFetch } from "@/lib/erp/master-data-browser"
import type { ErpSupplierTask } from "@/types/erp"

const STATUS_LABELS: Record<string, string> = {
  OPEN: "פתוח",
  DONE: "בוצע",
  CANCELLED: "בוטל",
}

const STATUS_ICON: Record<string, React.ReactNode> = {
  OPEN: <Circle className="size-3.5 text-amber-500" aria-hidden />,
  DONE: <CheckCircle2 className="size-3.5 text-emerald-600" aria-hidden />,
  CANCELLED: <XCircle className="size-3.5 text-rose-500" aria-hidden />,
}

export function SupplierTasksTab({
  supplierId,
}: {
  supplierId: string | null
}) {
  const [tasks, setTasks] = React.useState<ErpSupplierTask[]>([])
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!supplierId) return
    let cancelled = false
    setLoading(true)
    setError(null)
    masterDataFetch<ErpSupplierTask[]>(
      `/api/master-data/suppliers/${encodeURIComponent(supplierId)}/tasks`,
    )
      .then((data) => {
        if (cancelled) return
        setTasks(data)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : "טעינת משימות נכשלה")
        setTasks([])
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [supplierId])

  if (!supplierId) {
    return <MasterDetailTabEmpty>בחר ספק כדי לראות משימותיו.</MasterDetailTabEmpty>
  }
  if (loading) return <MasterDetailTabLoading>טוען משימות לספק…</MasterDetailTabLoading>
  if (error) return <MasterDetailTabError>{error}</MasterDetailTabError>
  if (tasks.length === 0) {
    return <MasterDetailTabEmpty>לספק זה אין משימות פתוחות.</MasterDetailTabEmpty>
  }

  return (
    <div className="divide-y divide-border text-xs" dir="rtl">
      {/* Header */}
      <div className="grid grid-cols-[1.5rem_7rem_8rem_1fr_5rem] gap-x-3 bg-muted/50 px-3 py-1.5 font-semibold text-muted-foreground">
        <span />
        <span>*מתאריך</span>
        <span>*לטיפול</span>
        <span>תקציר המשימה</span>
        <span>סטטוס</span>
      </div>

      {tasks.map((task) => (
        <div
          key={task.id}
          className="grid grid-cols-[1.5rem_7rem_8rem_1fr_5rem] items-center gap-x-3 px-3 py-2 hover:bg-muted/20"
        >
          <span className="flex items-center">{STATUS_ICON[task.status] ?? STATUS_ICON.OPEN}</span>
          <span className="tabular-nums text-muted-foreground">
            {new Date(task.taskDate).toLocaleDateString("he-IL")}
          </span>
          <span className="truncate font-medium">{task.assignedTo ?? "—"}</span>
          <span className="truncate text-muted-foreground">{task.summary ?? "—"}</span>
          <span>
            <Badge
              variant="outline"
              className={
                task.status === "DONE"
                  ? "border-emerald-300 text-emerald-700 text-[10px]"
                  : task.status === "CANCELLED"
                    ? "border-rose-300 text-rose-600 text-[10px]"
                    : "border-amber-300 text-amber-700 text-[10px]"
              }
            >
              {STATUS_LABELS[task.status] ?? task.status}
            </Badge>
          </span>
        </div>
      ))}
    </div>
  )
}
