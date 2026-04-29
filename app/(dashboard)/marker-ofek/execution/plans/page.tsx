import { PlansTakeoffClient } from "./plans-takeoff-client"
import { fetchProjectBoq } from "@/lib/marker-ofek/gantt-actions"
import { createSupabaseServerAuthClient } from "@/lib/supabase/server-auth"

type PageProps = {
  searchParams?: Promise<{ project?: string }>
}

export default async function MarkerOfekExecutionPlansPage({ searchParams }: PageProps) {
  const sp = (await searchParams) ?? {}
  const requested = String(sp.project ?? "").trim()

  const supabase = await createSupabaseServerAuthClient()
  const { data: projectsData } = await supabase
    .schema("public")
    .from("projects")
    .select("id, name, internal_project_code")
    .eq("is_deleted", false)
    .order("created_at", { ascending: false })

  const projects = ((projectsData ?? []) as Array<{
    id: string
    name: string | null
    internal_project_code: string | null
  }>).map((p) => ({
    id: String(p.id ?? "").trim(),
    name: String(p.name ?? "").trim() || "פרויקט ללא שם",
    internal_project_code: String(p.internal_project_code ?? "").trim(),
  }))

  const initialProjectId =
    requested && projects.some((p) => p.id === requested) ? requested : (projects[0]?.id ?? "")

  const initialBoqRows = initialProjectId ? await fetchProjectBoq(initialProjectId) : []

  return (
    <div
      dir="rtl"
      className="flex-1 min-h-0 overflow-y-auto bg-zinc-50 font-sans text-zinc-900"
    >
      <PlansTakeoffClient
        key={initialProjectId || "no-project"}
        projects={projects}
        initialProjectId={initialProjectId}
        initialBoqRows={initialBoqRows}
      />
    </div>
  )
}
