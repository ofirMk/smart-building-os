"use client"

import * as React from "react"
import { Loader2, Plus, Trash2 } from "lucide-react"

import type {
  GanttTaskRow,
  ProjectBoqRow,
  ProjectResourceRow,
  TaskBoqLinkRow,
  TaskResourceAssignmentRow,
} from "@/lib/marker-ofek/gantt-actions"
import {
  assignResourceToTask,
  removeTaskResourceAssignment,
  setTaskPrimaryBoqLink,
  updateTaskDetailsForSchedule,
} from "@/lib/marker-ofek/gantt-actions"
import { formatError } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "sonner"

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectId: string
  task: GanttTaskRow | null
  resources: ProjectResourceRow[]
  assignments: TaskResourceAssignmentRow[]
  projectBoq: ProjectBoqRow[]
  taskBoqLinks: TaskBoqLinkRow[]
  supplierEntities: { id: string; name: string }[]
  onSaved: () => void | Promise<void>
}

export function GanttMsTaskDetailDialog({
  open,
  onOpenChange,
  projectId,
  task,
  resources,
  assignments,
  projectBoq,
  taskBoqLinks,
  supplierEntities,
  onSaved,
}: Props) {
  const [tab, setTab] = React.useState("general")
  const [name, setName] = React.useState("")
  const [description, setDescription] = React.useState("")
  const [subcontractorId, setSubcontractorId] = React.useState<string | null>(null)
  const [boqItemId, setBoqItemId] = React.useState<string | null>(null)
  const [saving, setSaving] = React.useState(false)
  const [addResourceId, setAddResourceId] = React.useState<string>("")

  React.useEffect(() => {
    if (!task) return
    setName(task.name)
    setDescription(task.description ?? "")
    setSubcontractorId(task.subcontractor_id)
    const link = taskBoqLinks.find((l) => l.task_id === task.id)
    setBoqItemId(link?.boq_item_id ?? null)
  }, [task, taskBoqLinks])

  const taskAssignments = React.useMemo(() => {
    if (!task) return []
    return assignments.filter((a) => a.task_id === task.id)
  }, [assignments, task])

  const resourceById = React.useMemo(() => new Map(resources.map((r) => [r.id, r])), [resources])

  async function saveGeneral() {
    if (!task) return
    const n = name.trim()
    if (!n) {
      toast.error("שם משימה חובה")
      return
    }
    setSaving(true)
    try {
      await updateTaskDetailsForSchedule({
        projectId,
        taskId: task.id,
        name: n,
        description: description.trim() || null,
        subcontractorId: subcontractorId,
      })
      toast.success("נשמר")
      await onSaved()
    } catch (e) {
      toast.error(formatError(e))
    } finally {
      setSaving(false)
    }
  }

  async function saveBoq() {
    if (!task) return
    setSaving(true)
    try {
      await setTaskPrimaryBoqLink({
        projectId,
        taskId: task.id,
        boqItemId: boqItemId,
      })
      toast.success("קישור כתב כמויות עודכן")
      await onSaved()
    } catch (e) {
      toast.error(formatError(e))
    } finally {
      setSaving(false)
    }
  }

  async function addAssignment() {
    if (!task || !addResourceId) return
    setSaving(true)
    try {
      await assignResourceToTask({
        projectId,
        taskId: task.id,
        resourceId: addResourceId,
        units: null,
      })
      setAddResourceId("")
      toast.success("המשאב שויך")
      await onSaved()
    } catch (e) {
      toast.error(formatError(e))
    } finally {
      setSaving(false)
    }
  }

  async function updateUnits(resourceId: string, raw: string) {
    if (!task) return
    const trimmed = raw.trim()
    const units = trimmed === "" ? null : Math.max(0, Number(trimmed))
    if (trimmed !== "" && Number.isNaN(units as number)) {
      toast.error("מספר יחידות לא תקין")
      return
    }
    setSaving(true)
    try {
      await assignResourceToTask({
        projectId,
        taskId: task.id,
        resourceId,
        units,
      })
      await onSaved()
    } catch (e) {
      toast.error(formatError(e))
    } finally {
      setSaving(false)
    }
  }

  async function removeAssignment(resourceId: string) {
    if (!task) return
    setSaving(true)
    try {
      await removeTaskResourceAssignment({ projectId, taskId: task.id, resourceId })
      toast.success("הוסר מהמשימה")
      await onSaved()
    } catch (e) {
      toast.error(formatError(e))
    } finally {
      setSaving(false)
    }
  }

  if (!task) return null

  const boqRow = projectBoq.find((b) => b.id === boqItemId)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[min(90vh,720px)] overflow-y-auto sm:max-w-lg" dir="rtl" showCloseButton>
        <DialogHeader className="text-start">
          <DialogTitle className="text-start">פרטי משימה ומשאבים</DialogTitle>
          <p className="text-xs text-slate-500">{task.name}</p>
        </DialogHeader>

        <Tabs value={tab} onValueChange={setTab} className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="general">כללי</TabsTrigger>
            <TabsTrigger value="resources">הקצאת משאבים</TabsTrigger>
            <TabsTrigger value="boq">תקציב וכתב כמויות</TabsTrigger>
          </TabsList>

          <TabsContent value="general" className="mt-4 space-y-3 text-start">
            <div className="space-y-1.5">
              <Label htmlFor="ms-task-name">שם</Label>
              <Input id="ms-task-name" value={name} onChange={(e) => setName(e.target.value)} className="text-start" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ms-task-desc">תיאור</Label>
              <Textarea
                id="ms-task-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                className="resize-none text-start"
              />
            </div>
            <div className="space-y-1.5">
              <Label>קבלן (ספק)</Label>
              <Select
                value={subcontractorId ?? "__none__"}
                onValueChange={(v) => setSubcontractorId(v === "__none__" ? null : v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="ללא" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">ללא</SelectItem>
                  {supplierEntities.map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <DialogFooter className="gap-2 sm:justify-start">
              <Button type="button" onClick={() => void saveGeneral()} disabled={saving}>
                {saving ? <Loader2 className="size-4 animate-spin" /> : "שמור"}
              </Button>
            </DialogFooter>
          </TabsContent>

          <TabsContent value="resources" className="mt-4 space-y-4 text-start">
            <p className="text-xs text-slate-500">
              בחרו משאבים ממאגר המשאבים. שדה &quot;יחידות&quot; משמש למגבלת כוח־אדם יומית או יחידות עבודה.
            </p>

            <div className="flex flex-wrap items-end gap-2 border-b border-slate-100 pb-3">
              <div className="min-w-[200px] flex-1 space-y-1">
                <Label>הוספת משאב</Label>
                <Select
                  value={addResourceId || undefined}
                  onValueChange={(v) => setAddResourceId(v ?? "")}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="בחרו משאב…" />
                  </SelectTrigger>
                  <SelectContent>
                    {resources.map((r) => (
                      <SelectItem key={r.id} value={r.id}>
                        {r.name}
                        {r.profession ? ` — ${r.profession}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button type="button" size="sm" onClick={() => void addAssignment()} disabled={saving || !addResourceId}>
                <Plus className="ms-1 size-4" />
                שיוך
              </Button>
            </div>

            <div className="space-y-2">
              {taskAssignments.length === 0 ? (
                <p className="text-sm text-slate-500">אין משאבים משויכים למשימה.</p>
              ) : (
                taskAssignments.map((a) => {
                  const r = resourceById.get(a.resource_id)
                  return (
                    <div
                      key={a.id}
                      className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-100 bg-background/80 px-2 py-1.5"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-foreground">{r?.name ?? a.resource_id}</p>
                        {r?.profession ? <p className="truncate text-xs text-slate-500">{r.profession}</p> : null}
                      </div>
                      <div className="flex items-center gap-1">
                        <Label className="sr-only" htmlFor={`u-${a.resource_id}`}>
                          יחידות
                        </Label>
                        <Input
                          key={`${a.id}-${a.units ?? "u"}`}
                          id={`u-${a.resource_id}`}
                          className="h-8 w-16 font-currency-mono text-xs tabular-nums"
                          defaultValue={a.units ?? ""}
                          placeholder="—"
                          onBlur={(e) => void updateUnits(a.resource_id, e.target.value)}
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="size-8 text-red-600 hover:text-red-700"
                          title="הסר שיוך"
                          onClick={() => void removeAssignment(a.resource_id)}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </TabsContent>

          <TabsContent value="boq" className="mt-4 space-y-3 text-start">
            <p className="text-xs text-slate-500">
              קישור לשורה בכתב כמויות הפרויקט. העלות מחושבת לפי כמות ותעריף בכתב הכמויות.
            </p>
            <div className="space-y-1.5">
              <Label>פריט כתב כמויות</Label>
              <Select value={boqItemId ?? "__none__"} onValueChange={(v) => setBoqItemId(v === "__none__" ? null : v)}>
                <SelectTrigger>
                  <SelectValue placeholder="ללא קישור" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">ללא קישור</SelectItem>
                  {projectBoq.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      <span className="font-currency-mono">{b.item_code}</span> — {b.description}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {boqRow ? (
              <div className="rounded-md border border-slate-100 bg-card px-2 py-2 text-xs text-slate-600">
                <p>
                  <span className="font-semibold">יחידה:</span> {boqRow.unit}
                </p>
                <p>
                  <span className="font-semibold">כמות מתוכננת:</span>{" "}
                  <span className="font-currency-mono tabular-nums">{boqRow.planned_quantity}</span>
                </p>
                <p>
                  <span className="font-semibold">תעריף:</span>{" "}
                  <span className="font-currency-mono tabular-nums">{boqRow.rate}</span>
                </p>
              </div>
            ) : null}
            <DialogFooter className="gap-2 sm:justify-start">
              <Button type="button" onClick={() => void saveBoq()} disabled={saving}>
                שמור קישור
              </Button>
            </DialogFooter>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}
