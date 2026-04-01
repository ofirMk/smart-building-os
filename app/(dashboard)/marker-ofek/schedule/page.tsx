"use client"

import Link from "next/link"
import * as React from "react"
import {
  ArrowRight,
  CalendarRange,
  Loader2,
  Plus,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { createSupabaseBrowserClient } from "@/lib/supabase/browser"
import { cn, formatError } from "@/lib/utils"
import type {
  MarkerOfekProjectTaskRow,
  MoProjectTaskStatus,
} from "@/types/marker-ofek"

type ProjectOption = { id: string; name: string; internal_project_code: string }

const STATUS_LABELS: Record<MoProjectTaskStatus, string> = {
  todo: "ממתין",
  in_progress: "בביצוע",
  done: "הושלם",
  delayed: "באיחור",
}

const STATUS_BAR: Record<MoProjectTaskStatus, string> = {
  todo: "bg-zinc-400/85",
  in_progress: "bg-blue-500/90",
  done: "bg-emerald-500/90",
  delayed: "bg-red-500/90",
}

const dateFmt = new Intl.DateTimeFormat("he-IL", {
  day: "numeric",
  month: "short",
  year: "numeric",
})

function dayStartMs(isoDate: string): number {
  return new Date(`${isoDate}T12:00:00`).getTime()
}

function timelineMeta(tasks: MarkerOfekProjectTaskRow[]) {
  if (tasks.length === 0) return null
  let min = Infinity
  let max = -Infinity
  for (const t of tasks) {
    min = Math.min(min, dayStartMs(t.start_date))
    max = Math.max(max, dayStartMs(t.end_date))
  }
  const totalDays = Math.max(
    1,
    Math.round((max - min) / 86_400_000) + 1
  )
  return { minMs: min, maxMs: max, totalDays }
}

function barLayout(
  task: MarkerOfekProjectTaskRow,
  minMs: number,
  totalDays: number
) {
  const s = dayStartMs(task.start_date)
  const e = dayStartMs(task.end_date)
  const offsetDays = Math.max(0, (s - minMs) / 86_400_000)
  const durationDays = Math.max(1, (e - s) / 86_400_000 + 1)
  const leftPct = (offsetDays / totalDays) * 100
  const widthPct = Math.min(100 - leftPct, (durationDays / totalDays) * 100)
  return { leftPct, widthPct }
}

export default function MarkerOfekSchedulePage() {
  const [projects, setProjects] = React.useState<ProjectOption[]>([])
  const [projectId, setProjectId] = React.useState("")
  const [tasks, setTasks] = React.useState<MarkerOfekProjectTaskRow[]>([])
  const [loadingProjects, setLoadingProjects] = React.useState(true)
  const [loadingTasks, setLoadingTasks] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [selectedId, setSelectedId] = React.useState<string | null>(null)

  const [createOpen, setCreateOpen] = React.useState(false)
  const [editOpen, setEditOpen] = React.useState(false)
  const [saving, setSaving] = React.useState(false)

  const [newTitle, setNewTitle] = React.useState("")
  const [newStart, setNewStart] = React.useState("")
  const [newEnd, setNewEnd] = React.useState("")
  const [newProgress, setNewProgress] = React.useState(0)

  const [editTask, setEditTask] = React.useState<MarkerOfekProjectTaskRow | null>(
    null
  )
  const [editProgress, setEditProgress] = React.useState(0)
  const [editStatus, setEditStatus] = React.useState<MoProjectTaskStatus>("todo")

  React.useEffect(() => {
    let cancelled = false
    async function loadProjects() {
      setLoadingProjects(true)
      setError(null)
      try {
        const supabase = createSupabaseBrowserClient()
        const { data, error: qErr } = await supabase
          .from("projects")
          .select("id, name, internal_project_code")
          .eq("is_deleted", false)
          .order("name", { ascending: true })
        if (qErr) throw qErr
        if (!cancelled) {
          setProjects((data ?? []) as ProjectOption[])
          setProjectId((prev) => prev || (data?.[0]?.id ?? ""))
        }
      } catch (e) {
        if (!cancelled) {
          setError(formatError(e) || "שגיאה בטעינת פרויקטים")
        }
      } finally {
        if (!cancelled) setLoadingProjects(false)
      }
    }
    void loadProjects()
    return () => {
      cancelled = true
    }
  }, [])

  const loadTasks = React.useCallback(async (pid: string) => {
    if (!pid) {
      setTasks([])
      return
    }
    setLoadingTasks(true)
    setError(null)
    try {
      const supabase = createSupabaseBrowserClient()
      const { data, error: qErr } = await supabase
        .from("project_tasks")
        .select(
          "id, project_id, title, description, start_date, end_date, progress, status, assigned_to, created_at"
        )
        .eq("project_id", pid)
        .order("start_date", { ascending: true })
        .limit(500)
      if (qErr) throw qErr
      setTasks((data ?? []) as MarkerOfekProjectTaskRow[])
    } catch (e) {
      setError(formatError(e) || "שגיאה בטעינת משימות")
      setTasks([])
    } finally {
      setLoadingTasks(false)
    }
  }, [])

  React.useEffect(() => {
    void loadTasks(projectId)
  }, [projectId, loadTasks])

  const meta = React.useMemo(() => timelineMeta(tasks), [tasks])

  function openEdit(t: MarkerOfekProjectTaskRow) {
    setSelectedId(t.id)
    setEditTask(t)
    setEditProgress(t.progress)
    setEditStatus(t.status)
    setEditOpen(true)
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!projectId || !newTitle.trim() || !newStart || !newEnd) return
    if (newEnd < newStart) {
      setError("תאריך הסיום חייב להיות אחרי או שווה לתאריך ההתחלה")
      return
    }
    setSaving(true)
    setError(null)
    try {
      const supabase = createSupabaseBrowserClient()
      const { error: insErr } = await supabase.from("project_tasks").insert({
        project_id: projectId,
        title: newTitle.trim(),
        start_date: newStart,
        end_date: newEnd,
        progress: Math.min(100, Math.max(0, newProgress)),
        status: "todo",
        description: null,
        assigned_to: null,
      })
      if (insErr) throw insErr
      setCreateOpen(false)
      setNewTitle("")
      setNewStart("")
      setNewEnd("")
      setNewProgress(0)
      await loadTasks(projectId)
    } catch (err) {
      setError(formatError(err) || "שגיאה בשמירת משימה")
    } finally {
      setSaving(false)
    }
  }

  async function handleEditSave(e: React.FormEvent) {
    e.preventDefault()
    if (!editTask || !projectId) return
    setSaving(true)
    setError(null)
    try {
      const supabase = createSupabaseBrowserClient()
      const { error: upErr } = await supabase
        .from("project_tasks")
        .update({
          progress: Math.min(100, Math.max(0, editProgress)),
          status: editStatus,
        })
        .eq("id", editTask.id)
      if (upErr) throw upErr
      setEditOpen(false)
      setEditTask(null)
      await loadTasks(projectId)
    } catch (err) {
      setError(formatError(err) || "שגיאה בעדכון משימה")
    } finally {
      setSaving(false)
    }
  }

  const projectLabel =
    projects.find((p) => p.id === projectId)?.name ?? "פרויקט"

  return (
    <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-6 pb-10" dir="rtl">
      <Link
        href="/marker-ofek"
        className="inline-flex w-fit items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowRight className="size-4 rotate-180" aria-hidden />
        חזרה ללוח הבקרה
      </Link>

      <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-violet-500/30 bg-violet-500/10 text-violet-300">
            <CalendarRange className="size-5" aria-hidden />
          </div>
          <div>
            <h1 className="font-heading text-xl font-semibold tracking-tight md:text-2xl">
              לוחות זמנים ומשימות
            </h1>
            <p className="text-sm text-muted-foreground">
              תצוגת גנט, מעקב התקדמות וסטטוס — מרקר אופק
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="min-w-[220px] space-y-1.5">
            <Label className="text-xs text-muted-foreground">פרויקט</Label>
            <Select
              value={projectId || undefined}
              onValueChange={(v) => setProjectId(v ?? "")}
              disabled={loadingProjects || projects.length === 0}
            >
              <SelectTrigger className="h-10 w-full border-border/70 bg-background/80">
                <SelectValue placeholder={loadingProjects ? "טוען…" : "בחרו פרויקט"} />
              </SelectTrigger>
              <SelectContent>
                {projects.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}{" "}
                    <span className="text-muted-foreground">
                      ({p.internal_project_code})
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            className="h-10 gap-2 shadow-sm"
            onClick={() => setCreateOpen(true)}
            disabled={!projectId}
          >
            <Plus className="size-4" aria-hidden />
            צור משימה חדשה
          </Button>
        </div>
      </div>

      {error ? (
        <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      {!projectId && !loadingProjects ? (
        <Card className="border-border/70 shadow-sm">
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            אין פרויקטים זמינים. הוסיפו פרויקט במסך החוזים או בהגדרות.
          </CardContent>
        </Card>
      ) : null}

      {projectId ? (
        <Card className="overflow-hidden border-border/70 shadow-sm">
          <CardHeader className="border-b border-border/60 pb-4">
            <CardTitle className="text-base">{projectLabel}</CardTitle>
            <CardDescription>
              לחצו על שורה לעדכון מהיר של אחוז התקדמות וסטטוס
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {loadingTasks ? (
              <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
                <Loader2 className="size-5 animate-spin" aria-hidden />
                טוען משימות…
              </div>
            ) : tasks.length === 0 ? (
              <div className="py-14 text-center text-sm text-muted-foreground">
                אין משימות לפרויקט זה. צרו משימה חדשה כדי להתחיל.
              </div>
            ) : (
              <div className="flex flex-col">
                {/* Header row */}
                <div className="grid grid-cols-1 border-b border-border/60 bg-muted/30 xl:grid-cols-[minmax(300px,1fr)_minmax(280px,1.2fr)]">
                  <div className="hidden grid-cols-4 gap-2 px-4 py-3 text-xs font-medium text-muted-foreground xl:grid">
                    <span>משימה</span>
                    <span>התחלה</span>
                    <span>סיום</span>
                    <span className="text-center">התקדמות</span>
                  </div>
                  <div
                    className="hidden items-center px-4 py-3 text-xs font-medium text-muted-foreground xl:flex"
                    dir="ltr"
                  >
                    {meta ? (
                      <span className="w-full text-center">
                        {dateFmt.format(new Date(meta.minMs))} —{" "}
                        {dateFmt.format(new Date(meta.maxMs))}
                        <span className="ms-2 text-muted-foreground/80">
                          {`(${meta.totalDays} ימים)`}
                        </span>
                      </span>
                    ) : (
                      <span>ציר זמן</span>
                    )}
                  </div>
                </div>

                {tasks.map((t) => {
                  const selected = selectedId === t.id
                  const layout =
                    meta != null
                      ? barLayout(t, meta.minMs, meta.totalDays)
                      : { leftPct: 0, widthPct: 100 }

                  return (
                    <div
                      key={t.id}
                      className={cn(
                        "grid grid-cols-1 border-b border-border/50 transition-colors xl:grid-cols-[minmax(300px,1fr)_minmax(280px,1.2fr)]",
                        selected ? "bg-violet-500/5" : "hover:bg-muted/20"
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => openEdit(t)}
                        className="grid w-full grid-cols-1 gap-2 px-4 py-3 text-start sm:grid-cols-2 xl:grid-cols-4 xl:gap-2"
                      >
                        <div className="font-medium">{t.title}</div>
                        <div className="text-sm text-muted-foreground">
                          {dateFmt.format(new Date(dayStartMs(t.start_date)))}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {dateFmt.format(new Date(dayStartMs(t.end_date)))}
                        </div>
                        <div className="flex items-center gap-2 text-sm">
                          <span
                            className={cn(
                              "inline-flex rounded-full px-2 py-0.5 text-xs font-medium",
                              t.status === "done" && "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
                              t.status === "in_progress" &&
                                "bg-blue-500/15 text-blue-700 dark:text-blue-300",
                              t.status === "delayed" && "bg-red-500/15 text-red-700 dark:text-red-300",
                              t.status === "todo" &&
                                "bg-zinc-500/15 text-zinc-700 dark:text-zinc-300"
                            )}
                          >
                            {STATUS_LABELS[t.status]}
                          </span>
                          <span className="tabular-nums font-medium">
                            {t.progress}%
                          </span>
                        </div>
                      </button>

                      <div className="min-h-[52px] border-t border-border/40 px-4 py-2 xl:border-t-0">
                        <button
                          type="button"
                          onClick={() => openEdit(t)}
                          className="flex w-full min-w-[260px] items-center overflow-x-auto xl:min-w-0"
                          dir="ltr"
                        >
                          <div className="relative h-9 w-full min-w-[240px] shrink-0 overflow-hidden rounded-lg bg-muted/50 ring-1 ring-border/40">
                            <div
                              className="absolute top-1 bottom-1 rounded-md bg-foreground/8"
                              style={{
                                left: `${layout.leftPct}%`,
                                width: `${layout.widthPct}%`,
                              }}
                              title={`משך משימה בציר הפרויקט`}
                            />
                            <div
                              className={cn(
                                "absolute top-1 bottom-1 rounded-md transition-all",
                                STATUS_BAR[t.status]
                              )}
                              style={{
                                left: `${layout.leftPct}%`,
                                width: `${(layout.widthPct * t.progress) / 100}%`,
                                minWidth: t.progress > 0 ? "4px" : undefined,
                              }}
                            />
                          </div>
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>
      ) : null}

      <p className="text-center text-xs text-muted-foreground xl:hidden">
        בנייד ניתן לגלול אופקית את אזור הגרף אם השורות רחבות.
      </p>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-md" showCloseButton>
          <form onSubmit={handleCreate}>
            <DialogHeader>
              <DialogTitle>משימה חדשה</DialogTitle>
              <DialogDescription>
                הזינו כותרת, טווח תאריכים ואחוז התקדמות ראשוני.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-2">
              <div className="space-y-2">
                <Label htmlFor="mo-task-title">כותרת</Label>
                <Input
                  id="mo-task-title"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  required
                  className="border-border/70"
                  placeholder="למשל: יציקת רצפה קומה 3"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="mo-task-start">תאריך התחלה</Label>
                  <Input
                    id="mo-task-start"
                    type="date"
                    value={newStart}
                    onChange={(e) => setNewStart(e.target.value)}
                    required
                    className="border-border/70"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="mo-task-end">תאריך סיום</Label>
                  <Input
                    id="mo-task-end"
                    type="date"
                    value={newEnd}
                    onChange={(e) => setNewEnd(e.target.value)}
                    required
                    className="border-border/70"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="mo-task-progress">
                  התקדמות: {newProgress}%
                </Label>
                <input
                  id="mo-task-progress"
                  type="range"
                  min={0}
                  max={100}
                  value={newProgress}
                  onChange={(e) => setNewProgress(Number(e.target.value))}
                  className="h-2 w-full cursor-pointer appearance-none rounded-full bg-muted accent-violet-500"
                />
              </div>
            </div>
            <DialogFooter className="border-t-0 bg-transparent p-0 pt-2 sm:justify-start">
              <Button type="submit" className="gap-2" disabled={saving}>
                {saving ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    שומר…
                  </>
                ) : (
                  "שמירה"
                )}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setCreateOpen(false)}
              >
                ביטול
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={editOpen}
        onOpenChange={(o) => {
          setEditOpen(o)
          if (!o) {
            setEditTask(null)
            setSelectedId(null)
          }
        }}
      >
        <DialogContent className="max-w-md" showCloseButton>
          <form onSubmit={handleEditSave}>
            <DialogHeader>
              <DialogTitle>עדכון משימה</DialogTitle>
              <DialogDescription>
                {editTask?.title ?? ""}
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-2">
              <div className="space-y-2">
                <Label>סטטוס</Label>
                <Select
                  value={editStatus}
                  onValueChange={(v) => setEditStatus(v as MoProjectTaskStatus)}
                >
                  <SelectTrigger className="border-border/70">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(STATUS_LABELS) as MoProjectTaskStatus[]).map(
                      (k) => (
                        <SelectItem key={k} value={k}>
                          {STATUS_LABELS[k]}
                        </SelectItem>
                      )
                    )}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="mo-edit-progress">
                  אחוז התקדמות: {editProgress}%
                </Label>
                <input
                  id="mo-edit-progress"
                  type="range"
                  min={0}
                  max={100}
                  value={editProgress}
                  onChange={(e) => setEditProgress(Number(e.target.value))}
                  className="h-2 w-full cursor-pointer appearance-none rounded-full bg-muted accent-violet-500"
                />
              </div>
            </div>
            <DialogFooter className="border-t-0 bg-transparent p-0 pt-2 sm:justify-start">
              <Button type="submit" className="gap-2" disabled={saving || !editTask}>
                {saving ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    שומר…
                  </>
                ) : (
                  "עדכון"
                )}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setEditOpen(false)}
              >
                סגירה
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
