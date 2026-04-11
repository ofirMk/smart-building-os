"use client"

import * as React from "react"
import { Search } from "lucide-react"
import { useRouter } from "next/navigation"

import { useMirrorPartnerFilter } from "@/components/marker-ofek/marker-ofek-dashboard-context"
import { createSupabaseBrowserClient } from "@/lib/supabase/browser"

type ProjectOption = {
  id: string
  name: string
  internal_project_code: string | null
}

export function GlobalProjectSearch() {
  const router = useRouter()
  const partnerFilterId = useMirrorPartnerFilter()
  const [projects, setProjects] = React.useState<ProjectOption[]>([])
  const [query, setQuery] = React.useState("")
  const [open, setOpen] = React.useState(false)

  React.useEffect(() => {
    let cancelled = false
    void (async () => {
      const supabase = createSupabaseBrowserClient()
      let q = supabase
        .schema("public")
        .from("projects")
        .select("id, name, internal_project_code")
        .eq("is_deleted", false)
        .order("name", { ascending: true })
        .limit(200)
      if (partnerFilterId) {
        q = q.eq("managing_partner_id", partnerFilterId)
      }
      const { data } = await q
      if (cancelled) return
      setProjects((data as ProjectOption[]) ?? [])
    })()
    return () => {
      cancelled = true
    }
  }, [partnerFilterId])

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return projects.slice(0, 8)
    return projects
      .filter((p) =>
        `${p.internal_project_code ?? ""} ${p.name}`.toLowerCase().includes(q)
      )
      .slice(0, 8)
  }, [projects, query])

  function navigateToProject(projectId: string) {
    setOpen(false)
    setQuery("")
    router.push(`/marker-ofek/projects/${projectId}`)
  }

  return (
    <div className="relative w-full max-w-md">
      <Search className="pointer-events-none absolute end-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
      <input
        id="global-project-search-input"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value)
          setOpen(true)
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && filtered.length > 0) {
            e.preventDefault()
            navigateToProject(filtered[0]!.id)
          }
          if (e.key === "Escape") {
            e.preventDefault()
            setOpen(false)
            ;(e.target as HTMLInputElement).blur()
          }
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          window.setTimeout(() => setOpen(false), 120)
        }}
        placeholder="חיפוש פרויקט (Ctrl+K)"
        className="h-10 w-full rounded-xl border border-slate-200 bg-white pe-10 ps-3 text-sm text-[#1e293b] shadow-sm outline-none ring-0 transition focus:border-indigo-300"
        aria-label="חיפוש פרויקטים גלובלי"
      />
      {open && filtered.length > 0 ? (
        <div className="absolute z-30 mt-1 w-full rounded-xl border border-slate-100 bg-white p-1 shadow-sm">
          {filtered.map((project) => (
            <button
              key={project.id}
              type="button"
              onMouseDown={() => navigateToProject(project.id)}
              className="flex w-full items-center justify-between rounded-lg px-2 py-2 text-start text-sm hover:bg-violet-500/10"
            >
              <span className="truncate text-slate-800">
                {project.name}
              </span>
              <span className="shrink-0 text-xs text-slate-500">
                {project.internal_project_code ?? "ללא קוד"}
              </span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}
