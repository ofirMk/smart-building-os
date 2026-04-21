"use client"

import * as React from "react"
import { Loader2 } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  fetchProjectTasks,
  setTaskDependencyIds,
  updateTaskDatesWithDependencies,
  type GanttTaskRow,
} from "@/lib/marker-ofek/gantt-actions"
import { cn, formatError } from "@/lib/utils"

type ProjectMiniGanttProps = {
  projectId: string
  className?: string
}

function parseDay(iso: string | null | undefined): number {
  const s = String(iso ?? "").trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return NaN
  return Date.parse(`${s}T12:00:00.000Z`)
}

function addDaysIso(iso: string, delta: number): string {
  const d = new Date(parseDay(iso))
  if (Number.isNaN(d.getTime())) return iso
  d.setUTCDate(d.getUTCDate() + delta)
  return d.toISOString().slice(0, 10)
}

function leafTasks(rows: GanttTaskRow[]): GanttTaskRow[] {
  const hasChild = new Set<string>()
  for (const t of rows) {
    if (t.parent_id) hasChild.add(t.parent_id)
  }
  return rows.filter((t) => !hasChild.has(t.id))
}

export function ProjectMiniGantt({ projectId, className }: ProjectMiniGanttProps) {
  const [rows, setRows] = React.useState<GanttTaskRow[]>([])
  const [loading, setLoading] = React.useState(true)
  const trackRef = React.useRef<HTMLDivElement | null>(null)
  const [dragUi, setDragUi] = React.useState<{ taskId: string; days: number } | null>(null)

  const load = React.useCallback(async () => {
    setLoading(true)
    try {
      const data = await fetchProjectTasks(projectId)
      setRows(data)
    } catch (e) {
      toast.error(formatError(e))
    } finally {
      setLoading(false)
    }
  }, [projectId])

  React.useEffect(() => {
    void load()
  }, [load])

  const leaves = React.useMemo(() => leafTasks(rows).slice(0, 10), [rows])

  const { minT, maxT, span } = React.useMemo(() => {
    let min = Infinity
    let max = -Infinity
    for (const t of leaves) {
      const a = parseDay(t.start_date)
      const b = parseDay(t.end_date)
      if (Number.isFinite(a)) {
        min = Math.min(min, a)
        max = Math.max(max, a)
      }
      if (Number.isFinite(b)) {
        min = Math.min(min, b)
        max = Math.max(max, b)
      }
    }
    if (!Number.isFinite(min) || !Number.isFinite(max) || min > max) {
      const now = Date.now()
      min = now
      max = now + 14 * 86400000
    }
    const pad = 2 * 86400000
    return { minT: min - pad, maxT: max + pad, span: Math.max(1, max - min + pad * 2) }
  }, [leaves])

  function xFor(iso: string | null): number {
    const d = parseDay(iso)
    if (!Number.isFinite(d)) return 0
    return ((d - minT) / span) * 100
  }

  const applyDeltaDays = React.useCallback(
    async (taskId: string, deltaDays: number) => {
      const t = rows.find((r) => r.id === taskId)
      if (!t) return
      const s = String(t.start_date ?? "").trim()
      const e = String(t.end_date ?? "").trim()
      if (!s || !e) {
        toast.error("חסרים תאריכים למשימה")
        return
      }
      try {
        await updateTaskDatesWithDependencies({
          taskId,
          projectId,
          startDate: addDaysIso(s, deltaDays),
          endDate: addDaysIso(e, deltaDays),
        })
        toast.success("לוח עודכן")
        await load()
      } catch (err) {
        toast.error(formatError(err))
      }
    },
    [rows, projectId, load]
  )

  function daysFromDx(dxPx: number): number {
    const w = trackRef.current?.getBoundingClientRect().width ?? 320
    if (w <= 0) return 0
    return Math.round((dxPx / w) * (span / 86400000))
  }

  function startDrag(e: React.PointerEvent, taskId: string) {
    e.preventDefault()
    e.stopPropagation()
    const startX = e.clientX
    setDragUi({ taskId, days: 0 })

    function onMove(ev: PointerEvent) {
      setDragUi({ taskId, days: daysFromDx(ev.clientX - startX) })
    }

    function onUp(ev: PointerEvent) {
      window.removeEventListener("pointermove", onMove)
      window.removeEventListener("pointerup", onUp)
      window.removeEventListener("pointercancel", onUp)
      const days = daysFromDx(ev.clientX - startX)
      setDragUi(null)
      if (days !== 0) void applyDeltaDays(taskId, days)
    }

    window.addEventListener("pointermove", onMove)
    window.addEventListener("pointerup", onUp)
    window.addEventListener("pointercancel", onUp)
  }

  if (loading) {
    return (
      <div className={cn("flex items-center gap-2 text-sm text-slate-500", className)}>
        <Loader2 className="size-4 animate-spin" aria-hidden />
        טוען משימות…
      </div>
    )
  }

  if (leaves.length === 0) {
    return (
      <p className={cn("text-sm text-slate-500", className)}>
        אין משימות עלה להצגה. הוסיפו משימות בגאנט המלא.
      </p>
    )
  }

  return (
    <div className={cn("space-y-4", className)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium text-[#1e293b]">גנט מהיר — גרירה או ± יום</p>
        <Button type="button" variant="outline" size="sm" className="border-slate-100" onClick={() => void load()}>
          רענון
        </Button>
      </div>
      <div ref={trackRef} className="space-y-4 rounded-xl border border-slate-100 bg-card p-4">
        {leaves.map((t) => {
          const s = String(t.start_date ?? "").trim()
          const e = String(t.end_date ?? "").trim()
          const left = xFor(s)
          const right = xFor(e)
          const w = Math.max(2, right - left)
          const preview = dragUi?.taskId === t.id ? dragUi.days : 0
          return (
            <div key={t.id} className="grid gap-1">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="min-w-0 truncate text-sm text-[#1e293b]">{t.name}</span>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-currency-mono text-xs tabular-nums text-slate-500">
                    {s} → {e}
                    {preview !== 0 ? ` (${preview > 0 ? "+" : ""}${preview} ימ׳)` : ""}
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 border-slate-100 px-2 font-currency-mono text-xs"
                    onClick={() => void applyDeltaDays(t.id, -1)}
                  >
                    −יום
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 border-slate-100 px-2 font-currency-mono text-xs"
                    onClick={() => void applyDeltaDays(t.id, 1)}
                  >
                    +יום
                  </Button>
                </div>
              </div>
              <div className="relative h-8 rounded-md bg-background">
                <div
                  role="slider"
                  tabIndex={0}
                  aria-label={`גרירת משימה ${t.name}`}
                  className={cn(
                    "absolute top-1 h-6 cursor-grab rounded border border-indigo-200 bg-indigo-100/90 active:cursor-grabbing",
                    dragUi?.taskId === t.id && "ring-2 ring-indigo-400"
                  )}
                  style={{ left: `${left}%`, width: `${w}%` }}
                  onPointerDown={(ev) => startDrag(ev, t.id)}
                />
              </div>
              <MiniDepsEditor projectId={projectId} task={t} allTasks={rows} onSaved={() => void load()} />
            </div>
          )
        })}
      </div>
    </div>
  )
}

function MiniDepsEditor({
  projectId,
  task,
  allTasks,
  onSaved,
}: {
  projectId: string
  task: GanttTaskRow
  allTasks: GanttTaskRow[]
  onSaved: () => void
}) {
  const options = allTasks.filter((x) => x.id !== task.id)
  const [val, setVal] = React.useState<string>(task.dependency_ids?.[0] ?? "__none__")
  const [busy, setBusy] = React.useState(false)

  React.useEffect(() => {
    setVal(task.dependency_ids?.[0] ?? "__none__")
  }, [task.id, task.dependency_ids])

  async function save() {
    setBusy(true)
    try {
      const deps = val && val !== "__none__" ? [val] : []
      await setTaskDependencyIds({ projectId, taskId: task.id, dependencyIds: deps })
      toast.success("תלות עודכנה")
      onSaved()
    } catch (e) {
      toast.error(formatError(e))
    } finally {
      setBusy(false)
    }
  }

  if (options.length === 0) return null

  return (
    <div className="flex flex-wrap items-end gap-2 border-t border-slate-100 pt-2">
      <div className="grid gap-1">
        <Label className="text-[11px] text-slate-500">קדם (FS)</Label>
        <Select value={val} onValueChange={(v) => setVal(v ?? "__none__")}>
          <SelectTrigger className="h-8 w-[min(100%,14rem)] border-slate-100 font-currency-mono text-xs">
            <SelectValue placeholder="ללא" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">ללא</SelectItem>
            {options.map((o) => (
              <SelectItem key={o.id} value={o.id}>
                {o.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <Button
        type="button"
        size="sm"
        variant="secondary"
        className="border border-slate-100"
        disabled={busy}
        onClick={() => void save()}
      >
        {busy ? <Loader2 className="size-4 animate-spin" /> : "שמירת תלות"}
      </Button>
    </div>
  )
}
