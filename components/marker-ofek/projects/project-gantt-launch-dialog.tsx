"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { LayoutList, Loader2 } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  listWonLinkedProjectsForGantt,
  type WonLinkedProjectOption,
} from "@/lib/marker-ofek/gantt-actions"
import {
  applyWbsStructureToProject,
  listWbsStructures,
  type WbsStructureRow,
} from "@/lib/marker-ofek/wbs-structure-actions"
import { formatError } from "@/lib/utils"

export function ProjectGanttLaunchDialog({ defaultProjectId }: { defaultProjectId?: string }) {
  const router = useRouter()
  const [open, setOpen] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const [won, setWon] = React.useState<WonLinkedProjectOption[]>([])
  const [structures, setStructures] = React.useState<WbsStructureRow[]>([])
  const [pick, setPick] = React.useState("")
  const [applyTpl, setApplyTpl] = React.useState(false)
  const [structureId, setStructureId] = React.useState("")
  const [replaceTasks, setReplaceTasks] = React.useState(true)

  React.useEffect(() => {
    if (!open) return
    let cancelled = false
    ;(async () => {
      try {
        const [w, st] = await Promise.all([
          listWonLinkedProjectsForGantt(),
          listWbsStructures(),
        ])
        if (cancelled) return
        setWon(w)
        setStructures(st)
        const def =
          (defaultProjectId && w.some((p) => p.id === defaultProjectId)
            ? defaultProjectId
            : w[0]?.id) ?? ""
        setPick(def)
        const templates = st.filter((s) => s.is_template)
        setStructureId(templates[0]?.id ?? st[0]?.id ?? "")
      } catch (e) {
        toast.error(formatError(e))
      }
    })()
    return () => {
      cancelled = true
    }
  }, [open, defaultProjectId])

  const templateStructures = React.useMemo(
    () => structures.filter((s) => s.is_template),
    [structures]
  )

  async function onSubmit() {
    const pid = pick.trim()
    if (!pid) {
      toast.error("בחרו פרויקט")
      return
    }
    setBusy(true)
    try {
      if (applyTpl && structureId.trim()) {
        await applyWbsStructureToProject({
          structureId: structureId.trim(),
          projectId: pid,
          replaceExisting: replaceTasks,
        })
        toast.success("מבנה WBS הוחל — פותחים לו״ז")
      }
      setOpen(false)
      router.push(`/marker-ofek/execution/gantt/${pid}`)
    } catch (e) {
      toast.error(formatError(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="border-slate-100 bg-white text-indigo-900"
        onClick={() => setOpen(true)}
      >
        <LayoutList className="size-4" aria-hidden />
        צור גאנט / קשר פרויקט מנוצח
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="border-slate-100 sm:max-w-md" showCloseButton dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-indigo-900">פתיחת לו״ז — פרויקט ממכרז שניצח</DialogTitle>
            <p className="text-xs text-slate-500">
              בחרו פרויקט שמקושר למכרז במצב <span className="font-currency-mono">won</span>. אופציונלי:
              החלת תבנית WBS לפני המעבר.
            </p>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="space-y-2">
              <Label className="text-xs text-slate-600">פרויקט</Label>
              {won.length === 0 ? (
                <p className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-sm text-slate-600">
                  אין פרויקטים מקושרים למכרזים בניצחון. קשרו מכרז לפרויקט במסך המכרזים, או{" "}
                  <Link
                    href="/marker-ofek/execution/gantt"
                    className="font-medium text-indigo-600 underline"
                    onClick={() => setOpen(false)}
                  >
                    פתחו את מרכז הגאנט
                  </Link>
                  .
                </p>
              ) : (
                <Select value={pick || undefined} onValueChange={(v) => v && setPick(v)}>
                  <SelectTrigger className="border-slate-100 bg-white text-indigo-900">
                    <SelectValue placeholder="בחרו" />
                  </SelectTrigger>
                  <SelectContent>
                    {won.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        <span>{p.name}</span>{" "}
                        <span className="font-currency-mono text-xs text-slate-500 tabular-nums">
                          ({p.internal_project_code})
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
            <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-600">
              <input
                type="checkbox"
                checked={applyTpl}
                onChange={(e) => setApplyTpl(e.target.checked)}
                className="rounded border-slate-300"
              />
              טען מבנה מתבנית WBS לפני הכניסה לגאנט
            </label>
            {applyTpl ? (
              <>
                <div className="space-y-2">
                  <Label className="text-xs text-slate-600">תבנית</Label>
                  <Select
                    value={structureId || undefined}
                    onValueChange={(v) => v && setStructureId(v)}
                    disabled={templateStructures.length === 0}
                  >
                    <SelectTrigger className="border-slate-100 bg-white text-indigo-900">
                      <SelectValue placeholder="בחרו תבנית" />
                    </SelectTrigger>
                    <SelectContent>
                      {(templateStructures.length ? templateStructures : structures).map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.name}
                          {s.is_template ? " · תבנית" : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-600">
                  <input
                    type="checkbox"
                    checked={replaceTasks}
                    onChange={(e) => setReplaceTasks(e.target.checked)}
                    className="rounded border-slate-300"
                  />
                  להחליף משימות קיימות בפרויקט (מומלץ לייבוא נקי)
                </label>
              </>
            ) : null}
          </div>
          <DialogFooter className="gap-2 sm:justify-start">
            <Button type="button" variant="outline" className="border-slate-100" onClick={() => setOpen(false)}>
              ביטול
            </Button>
            <Button
              type="button"
              className="bg-indigo-600 hover:bg-indigo-500"
              disabled={busy || !pick || (applyTpl && !structureId.trim())}
              onClick={() => void onSubmit()}
            >
              {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
              המשך לגאנט
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
