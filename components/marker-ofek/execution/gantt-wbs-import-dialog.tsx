"use client"

import * as React from "react"
import { Loader2 } from "lucide-react"
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
  applyWbsStructureToProject,
  copyScheduleBetweenProjects,
  listWbsStructures,
  type WbsStructureRow,
} from "@/lib/marker-ofek/wbs-structure-actions"
import { formatError } from "@/lib/utils"

type ProjectOpt = { id: string; name: string; internal_project_code: string }

export function GanttWbsImportDialog({
  open,
  onOpenChange,
  targetProjectId,
  projects,
  onImported,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  targetProjectId: string
  projects: ProjectOpt[]
  onImported?: () => void
}) {
  const [sourceKind, setSourceKind] = React.useState<"structure" | "project">("structure")
  const [structures, setStructures] = React.useState<WbsStructureRow[]>([])
  const [structurePick, setStructurePick] = React.useState("")
  const [sourceProjectPick, setSourceProjectPick] = React.useState("")
  const [replace, setReplace] = React.useState(true)
  const [busy, setBusy] = React.useState(false)

  React.useEffect(() => {
    if (!open) return
    let c = false
    void (async () => {
      try {
        const list = await listWbsStructures()
        if (!c) {
          setStructures(list)
          if (list[0]?.id) setStructurePick(list[0].id)
        }
      } catch (e) {
        if (!c) toast.error(formatError(e))
      }
    })()
    return () => {
      c = true
    }
  }, [open])

  async function runImport() {
    const tgt = targetProjectId.trim()
    if (!tgt) {
      toast.error("פרויקט יעד חסר")
      return
    }
    setBusy(true)
    try {
      if (sourceKind === "structure") {
        const sid = structurePick.trim()
        if (!sid) {
          toast.error("בחרו מבנה WBS")
          return
        }
        await applyWbsStructureToProject({
          structureId: sid,
          projectId: tgt,
          replaceExisting: replace,
        })
      } else {
        const src = sourceProjectPick.trim()
        if (!src) {
          toast.error("בחרו פרויקט מקור")
          return
        }
        if (src === tgt) {
          toast.error("פרויקט מקור ויעד חייבים להיות שונים")
          return
        }
        await copyScheduleBetweenProjects({
          sourceProjectId: src,
          targetProjectId: tgt,
          replaceExisting: replace,
        })
      }
      toast.success("הלו״ז עודכן")
      onOpenChange(false)
      onImported?.()
    } catch (e) {
      toast.error(formatError(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-slate-100 sm:max-w-lg" showCloseButton dir="rtl">
        <DialogHeader>
          <DialogTitle>טען מבנה WBS</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-slate-500">
          יעד:{" "}
          <span className="font-currency-mono text-indigo-700 tabular-nums">{targetProjectId || "—"}</span>
        </p>
        <div className="grid gap-3 py-2">
          <div className="space-y-2">
            <Label className="text-xs">מקור</Label>
            <Select
              value={sourceKind}
              onValueChange={(v) => setSourceKind(v as "structure" | "project")}
            >
              <SelectTrigger className="border-slate-100">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="structure">מבנה WBS שמור / תבנית</SelectItem>
                <SelectItem value="project">לו״ז מפרויקט קיים</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {sourceKind === "structure" ? (
            <div className="space-y-2">
              <Label className="text-xs">מבנה</Label>
              <Select
                value={structurePick || ""}
                onValueChange={(v) => setStructurePick(v ?? "")}
              >
                <SelectTrigger className="border-slate-100">
                  <SelectValue placeholder="בחרו" />
                </SelectTrigger>
                <SelectContent>
                  {structures.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}{" "}
                      <span className="font-currency-mono text-[10px] text-slate-400">
                        {s.id.slice(0, 8)}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <div className="space-y-2">
              <Label className="text-xs">פרויקט מקור</Label>
              <Select
                value={sourceProjectPick || ""}
                onValueChange={(v) => setSourceProjectPick(v ?? "")}
              >
                <SelectTrigger className="border-slate-100">
                  <SelectValue placeholder="בחרו" />
                </SelectTrigger>
                <SelectContent>
                  {projects
                    .filter((p) => p.id !== targetProjectId)
                    .map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input
              type="checkbox"
              checked={replace}
              onChange={(e) => setReplace(e.target.checked)}
              className="rounded border-slate-300"
            />
            להחליף משימות קיימות בפרויקט היעד
          </label>
        </div>
        <DialogFooter className="gap-2 sm:justify-start">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            ביטול
          </Button>
          <Button type="button" disabled={busy} onClick={() => void runImport()}>
            {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
            ייבוא
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
