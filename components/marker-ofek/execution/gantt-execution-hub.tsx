"use client"

import Link from "next/link"
import * as React from "react"
import { useRouter } from "next/navigation"
import { CalendarRange, LayoutGrid } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { GanttWbsImportDialog } from "@/components/marker-ofek/execution/gantt-wbs-import-dialog"

type ProjectOpt = { id: string; name: string; internal_project_code: string }

export function GanttExecutionHub({
  projects,
}: {
  projects: ProjectOpt[]
}) {
  const router = useRouter()
  const [projectId, setProjectId] = React.useState(projects[0]?.id ?? "")
  const [importOpen, setImportOpen] = React.useState(false)
  const [linkModalOpen, setLinkModalOpen] = React.useState(false)
  const [modalProjectId, setModalProjectId] = React.useState(
    projects[0]?.id ?? ""
  )

  function openGantt() {
    const id = projectId.trim()
    if (!id) return
    router.push(`/marker-ofek/execution/gantt/${id}`)
  }

  function openDiamondWorkspace() {
    const id = projectId.trim()
    if (!id) return
    router.push(`/marker-ofek/execution/diamond-workspace/${id}`)
  }

  function openLinkModal() {
    setModalProjectId(projectId.trim() || projects[0]?.id || "")
    setLinkModalOpen(true)
  }

  function continueToGanttEditor() {
    const id = modalProjectId.trim()
    if (!id) return
    setLinkModalOpen(false)
    router.push(`/marker-ofek/projects/${id}/gantt-editor`)
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-8 bg-white p-6 md:p-10">
      <div className="space-y-2 text-center md:text-start">
        <div className="mx-auto flex size-12 items-center justify-center rounded-2xl border border-slate-100 bg-indigo-50 text-indigo-700 md:mx-0">
          <CalendarRange className="size-6" aria-hidden />
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-indigo-900">לו״ז וביצוע (גאנט)</h1>
        <p className="text-sm text-slate-500">
          בחרו פרויקט לפתיחת לוח הזמנים, או ייבאו מבנה WBS / לו״ז מפרויקט אחר.
        </p>
      </div>

      <Button
        type="button"
        size="lg"
        className="h-12 w-full gap-2 bg-indigo-600 text-base font-semibold shadow-md hover:bg-indigo-500"
        onClick={openLinkModal}
        disabled={projects.length === 0}
      >
        <LayoutGrid className="size-5 shrink-0" aria-hidden />
        צור תרשים גנט חדש
      </Button>

      <Dialog open={linkModalOpen} onOpenChange={setLinkModalOpen}>
        <DialogContent className="max-w-md border-slate-200 sm:max-w-md" showCloseButton>
          <DialogHeader>
            <DialogTitle>שיוך גנט לפרויקט</DialogTitle>
            <DialogDescription>
              בחרו פרויקט פעיל מרשימת הפרויקטים ב-ERP. ניתן לערוך תרשים גאנט בסגנון MS Project
              לאחר מכן.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-1">
            <Label htmlFor="gantt-link-project" className="text-xs text-slate-500">
              פרויקט
            </Label>
            <Select
              value={modalProjectId || ""}
              onValueChange={(v) => setModalProjectId(v ?? "")}
            >
              <SelectTrigger
                id="gantt-link-project"
                className="w-full border-slate-200"
              >
                <SelectValue placeholder="בחרו פרויקט" />
              </SelectTrigger>
              <SelectContent>
                {projects.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    <span>{p.name}</span>{" "}
                    <span className="font-currency-mono text-xs text-slate-500 tabular-nums">
                      {p.internal_project_code}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter className="gap-2 sm:justify-between">
            <Button
              type="button"
              variant="outline"
              onClick={() => setLinkModalOpen(false)}
            >
              ביטול
            </Button>
            <Button
              type="button"
              className="bg-indigo-600 hover:bg-indigo-500"
              disabled={!modalProjectId.trim()}
              onClick={continueToGanttEditor}
            >
              המשך לעריכה
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="space-y-3 rounded-xl border border-slate-100 bg-white p-4 shadow-sm">
        <Label className="text-xs text-slate-500">פרויקט</Label>
        <Select
          value={projectId || ""}
          onValueChange={(v) => setProjectId(v ?? "")}
        >
          <SelectTrigger className="w-full border-slate-100">
            <SelectValue placeholder="בחרו פרויקט" />
          </SelectTrigger>
          <SelectContent>
            {projects.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                <span>{p.name}</span>{" "}
                <span className="font-currency-mono text-xs text-slate-500 tabular-nums">
                  {p.internal_project_code}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex flex-wrap gap-2 pt-2">
          <Button
            type="button"
            className="bg-indigo-600 hover:bg-indigo-500"
            disabled={!projectId}
            onClick={openGantt}
          >
            פתח גאנט
          </Button>
          <Button
            type="button"
            variant="outline"
            className="border-slate-200 bg-white hover:bg-slate-50"
            disabled={!projectId}
            onClick={openDiamondWorkspace}
          >
            שולחן יהלום
          </Button>
          <Button
            type="button"
            variant="outline"
            className="border-slate-100"
            disabled={!projectId}
            onClick={() => setImportOpen(true)}
          >
            טען מבנה WBS
          </Button>
        </div>
      </div>

      <GanttWbsImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        targetProjectId={projectId}
        projects={projects}
        onImported={() => router.push(`/marker-ofek/execution/gantt/${projectId.trim()}`)}
      />

      <p className="text-center text-xs text-slate-500 md:text-start">
        עורך מבנה מלא:{" "}
        <Link href="/marker-ofek/tenders/wbs" className="font-medium text-indigo-600 underline">
          מבנה WBS (Master)
        </Link>
      </p>
    </div>
  )
}
