"use client"

import * as React from "react"
import { BriefcaseBusiness, Loader2 } from "lucide-react"
import { z } from "zod"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  ACTIVE_PROJECT_CHANGED_EVENT,
  readActiveProjectIdFromCookie,
  writeActiveProjectCookie,
} from "@/lib/project-context"
import { apiGet } from "@/lib/utils/api-client"

const projectSchema = z.object({
  id: z.string().uuid(),
  projectNumber: z.string(),
  name: z.string(),
  status: z.enum(["ACTIVE", "COMPLETED", "DRAFT"]),
})

const projectsSchema = z.array(projectSchema)

type ProjectOption = z.infer<typeof projectSchema>

export function SidebarProjectContextSwitcher() {
  const [projects, setProjects] = React.useState<ProjectOption[]>([])
  const [activeProjectId, setActiveProjectId] = React.useState<string>("")
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setError(null)

    void (async () => {
      try {
        const rows = await apiGet<ProjectOption[]>("/api/projects?status=ACTIVE", {
          schema: projectsSchema,
          signal: controller.signal,
        })
        if (controller.signal.aborted) return
        setProjects(rows)
        const cookieProjectId = readActiveProjectIdFromCookie()
        const resolvedProjectId =
          cookieProjectId && rows.some((project) => project.id === cookieProjectId)
            ? cookieProjectId
            : rows[0]?.id ?? ""
        setActiveProjectId(resolvedProjectId)
        writeActiveProjectCookie(resolvedProjectId || null)
      } catch (fetchError) {
        if (controller.signal.aborted) return
        setProjects([])
        setError(fetchError instanceof Error ? fetchError.message : "טעינת פרויקטים נכשלה")
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    })()

    return () => controller.abort()
  }, [])

  const activeProject = React.useMemo(
    () => projects.find((project) => project.id === activeProjectId) ?? null,
    [activeProjectId, projects]
  )

  return (
    <section className="mb-2 rounded-xl border border-slate-200 bg-gradient-to-br from-white to-slate-50 p-2 shadow-[0_1px_2px_rgba(15,23,42,0.05)]">
      <div className="mb-2 flex items-center justify-between">
        <p className="flex items-center gap-1 text-[11px] font-semibold text-slate-700">
          <BriefcaseBusiness className="size-3.5" />
          Project Context
        </p>
        {loading ? <Loader2 className="size-3.5 animate-spin text-slate-500" /> : null}
      </div>
      <Select
        value={activeProjectId || "none"}
        onValueChange={(value) => {
          const nextProjectId = value && value !== "none" ? value : ""
          setActiveProjectId(nextProjectId)
          writeActiveProjectCookie(nextProjectId || null)
          window.dispatchEvent(
            new CustomEvent(ACTIVE_PROJECT_CHANGED_EVENT, {
              detail: { projectId: nextProjectId || null },
            })
          )
        }}
        disabled={loading || projects.length === 0}
      >
        <SelectTrigger size="sm" className="h-8 border-slate-200 bg-card text-xs">
          <SelectValue placeholder="בחר פרויקט פעיל" />
        </SelectTrigger>
        <SelectContent>
          {projects.length === 0 ? (
            <SelectItem value="none">אין פרויקטים פעילים</SelectItem>
          ) : (
            projects.map((project) => (
              <SelectItem key={project.id} value={project.id}>
                {project.projectNumber} · {project.name}
              </SelectItem>
            ))
          )}
        </SelectContent>
      </Select>
      <div className="mt-2 flex items-center justify-between">
        <span className="truncate text-[11px] text-slate-600">
          {activeProject ? activeProject.name : "לא נבחר פרויקט"}
        </span>
        {activeProject ? (
          <Badge variant="outline" className="h-5 border-emerald-200 bg-emerald-50 text-[10px] text-emerald-800">
            ACTIVE
          </Badge>
        ) : null}
      </div>
      {error ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="mt-1 h-6 px-1 text-[10px] text-rose-700"
          onClick={() => window.location.reload()}
        >
          {error}
        </Button>
      ) : null}
    </section>
  )
}
