import { format } from "date-fns"
import Link from "next/link"

import SubcontractorSyncClient from "./subcontractor-sync-client"
import { fetchProjectTasks } from "@/lib/marker-ofek/gantt-actions"
import { createSupabaseServerAuthClient } from "@/lib/supabase/server-auth"

type PageProps = {
  params: Promise<{ id: string }> | { id: string }
}

export default async function SubcontractorSyncPage({ params }: PageProps) {
  const resolved = await Promise.resolve(params)
  const projectId = String(resolved.id ?? "").trim()
  const supabase = await createSupabaseServerAuthClient()
  const { data: project } = await supabase
    .schema("public")
    .from("projects")
    .select("name, internal_project_code")
    .eq("id", projectId)
    .maybeSingle()

  const tasks = await fetchProjectTasks(projectId)
  const derivatives = tasks.filter((t) => t.is_derivative)
  const entityIds = [...new Set(derivatives.map((t) => t.subcontractor_id).filter(Boolean))] as string[]
  const contractIds = [...new Set(derivatives.map((t) => t.contract_id).filter(Boolean))] as string[]

  const entityNames: Record<string, string> = {}
  if (entityIds.length > 0) {
    const { data: ents } = await supabase
      .schema("public")
      .from("entities")
      .select("id, name")
      .in("id", entityIds)
    for (const e of (ents ?? []) as Array<{ id?: string; name?: string }>) {
      const id = String(e.id ?? "")
      if (id) entityNames[id] = String(e.name ?? "").trim() || id
    }
  }

  const contractOptions: { id: string; label: string }[] = []
  const { data: contracts } = await supabase
    .schema("public")
    .from("contracts")
    .select("id, agreement_type, total_amount, entity_id")
    .eq("project_id", projectId)
    .eq("is_deleted", false)
    .order("created_at", { ascending: false })
    .limit(200)

  const contractEntityIds = [
    ...new Set(
      ((contracts ?? []) as Array<{ entity_id?: string | null }>)
        .map((c) => String(c.entity_id ?? "").trim())
        .filter(Boolean)
    ),
  ]
  const missingEnt = contractEntityIds.filter((id) => !entityNames[id])
  if (missingEnt.length > 0) {
    const { data: entExtra } = await supabase
      .schema("public")
      .from("entities")
      .select("id, name")
      .in("id", missingEnt)
    for (const e of (entExtra ?? []) as Array<{ id?: string; name?: string }>) {
      const id = String(e.id ?? "")
      if (id) entityNames[id] = String(e.name ?? "").trim() || id
    }
  }

  for (const c of (contracts ?? []) as Array<Record<string, unknown>>) {
    const id = String(c.id ?? "")
    if (!id) continue
    const eid = String(c.entity_id ?? "").trim()
    const entName = eid ? (entityNames[eid] ?? eid) : ""
    const agreement = String(c.agreement_type ?? "").trim()
    const amt = c.total_amount != null ? Number(c.total_amount) : null
    const label = [entName || "ישות", agreement || "חוזה", amt != null ? `₪${Math.round(amt)}` : ""]
      .filter(Boolean)
      .join(" · ")
    contractOptions.push({ id, label: label || id })
  }

  const todayIso = format(new Date(), "yyyy-MM-dd")

  return (
    <div dir="rtl" className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#0f172a]">סנכרון חברות ביצוע</h1>
          <p className="text-sm text-slate-500">
            {String(project?.name ?? "פרויקט")} ({String(project?.internal_project_code ?? "ללא קוד")})
          </p>
        </div>
        <Link
          href={`/marker-ofek/execution/gantt/${projectId}`}
          className="rounded-lg border border-slate-200 bg-card px-3 py-1.5 text-sm font-medium text-indigo-700 shadow-sm hover:bg-background"
        >
          חזרה לגאנט
        </Link>
      </div>

      <SubcontractorSyncClient
        projectId={projectId}
        initialTasks={tasks}
        todayIso={todayIso}
        entityNames={entityNames}
        contractOptions={contractOptions}
      />
    </div>
  )
}
