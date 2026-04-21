"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import * as React from "react"
import { Plus } from "lucide-react"
import { toast } from "sonner"

import { createGantt, fetchActiveProjectsForGantt } from "@/app/actions/gantt-actions"
import type { GanttManagementRow } from "@/app/actions/gantt-actions"
import { Button } from "@/components/ui/button"
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
import { formatError } from "@/lib/utils"

type GanttPortfolioClientProps = {
  initialRows: GanttManagementRow[]
}

export function GanttPortfolioClient({ initialRows }: GanttPortfolioClientProps) {
  const router = useRouter()
  const [rows, setRows] = React.useState(initialRows)
  const [open, setOpen] = React.useState(false)
  const [name, setName] = React.useState("")
  const [projectId, setProjectId] = React.useState("")
  const [projects, setProjects] = React.useState<{ id: string; name: string }[]>([])
  const [loadingProjects, setLoadingProjects] = React.useState(false)
  const [saving, setSaving] = React.useState(false)

  React.useEffect(() => {
    setRows(initialRows)
  }, [initialRows])

  React.useEffect(() => {
    if (!open) return
    let cancelled = false
    setLoadingProjects(true)
    void fetchActiveProjectsForGantt()
      .then((list) => {
        if (cancelled) return
        setProjects(list)
        setProjectId((prev) => prev || list[0]?.id || "")
      })
      .catch((e) => toast.error(formatError(e)))
      .finally(() => {
        if (!cancelled) setLoadingProjects(false)
      })
    return () => {
      cancelled = true
    }
  }, [open])

  const onCreate = async () => {
    const n = name.trim()
    if (!n) {
      toast.error("נא להזין שם לגאנט")
      return
    }
    if (!projectId) {
      toast.error("נא לבחור פרויקט")
      return
    }
    setSaving(true)
    try {
      const created = await createGantt({ project_id: projectId, name: n })
      toast.success("הגאנט נוצר")
      setOpen(false)
      setName("")
      router.push(`/marker-ofek/projects/gantt/${created.id}`)
      router.refresh()
    } catch (e) {
      toast.error(formatError(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4" dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-slate-600">
          ניהול תרשימי גאנט לפי פרויקט — פתיחה, יצירה ומעקב אחר גרסאות.
        </p>
        <Button
          type="button"
          className="bg-indigo-600 text-white hover:bg-indigo-500"
          onClick={() => setOpen(true)}
        >
          <Plus className="ms-1 size-4" aria-hidden />
          יצירת גנט חדש
        </Button>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-card shadow-sm">
        <table className="w-full text-right text-sm">
          <thead className="border-b border-slate-200 bg-background text-[11px] font-semibold uppercase tracking-wide text-slate-600">
            <tr>
              <th className="px-3 py-2">שם הגאנט</th>
              <th className="px-3 py-2">פרויקט</th>
              <th className="px-3 py-2">סטטוס</th>
              <th className="px-3 py-2">נוצר</th>
              <th className="px-3 py-2">פעולות</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-10 text-center text-slate-500">
                  אין גאנטים עדיין. לחץ &quot;יצירת גנט חדש&quot; כדי להתחיל.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id} className="border-b border-slate-100 last:border-0">
                  <td className="px-3 py-2 font-medium text-foreground">{row.name}</td>
                  <td className="px-3 py-2 text-slate-700">{row.project_name}</td>
                  <td className="px-3 py-2 text-slate-600">{row.status}</td>
                  <td className="px-3 py-2 tabular-nums text-slate-600">
                    {row.created_at
                      ? new Date(row.created_at).toLocaleString("he-IL", {
                          dateStyle: "short",
                          timeStyle: "short",
                        })
                      : "—"}
                  </td>
                  <td className="px-3 py-2">
                    <Link
                      href={`/marker-ofek/projects/gantt/${row.id}`}
                      className="inline-flex h-8 items-center rounded-md border border-slate-200 bg-card px-3 text-xs font-medium text-slate-800 shadow-sm transition-colors hover:bg-background"
                    >
                      פתח
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle>יצירת גאנט חדש</DialogTitle>
            <DialogDescription>
              הגדר שם ושיוך לפרויקט קיים. לאחר השמירה תועבר ללוח הזמנים.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="grid gap-1.5">
              <Label htmlFor="new-gantt-name">שם הגאנט</Label>
              <Input
                id="new-gantt-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="לדוגמה: שלד / חשמל"
              />
            </div>
            <div className="grid gap-1.5">
              <Label>שיוך לפרויקט קיים</Label>
              <Select
                value={projectId}
                onValueChange={(v) => setProjectId(v ?? "")}
                disabled={loadingProjects || projects.length === 0}
              >
                <SelectTrigger>
                  <SelectValue placeholder={loadingProjects ? "טוען פרויקטים…" : "בחר פרויקט"} />
                </SelectTrigger>
                <SelectContent>
                  {projects.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter className="gap-2 sm:justify-start">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              ביטול
            </Button>
            <Button
              type="button"
              className="bg-indigo-600 text-white hover:bg-indigo-500"
              disabled={saving}
              onClick={() => void onCreate()}
            >
              {saving ? "יוצר…" : "צור גאנט"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
