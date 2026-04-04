import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowRight, LayoutList, Smartphone } from "lucide-react"

import { ProjectExecutionCommandView } from "@/components/marker-ofek/projects/project-execution-command-view"
import { MarkerOfekProjectHubClient } from "./project-hub-client"
import { fetchProjectTasks } from "@/lib/marker-ofek/gantt-actions"
import { weightedLeafProgressPercent } from "@/lib/marker-ofek/gantt-progress-display"
import { ensureProjectSiteForProject } from "@/lib/marker-ofek/project-execution-actions"
import { ensureProjectVaultDefaultFolders } from "@/lib/marker-ofek/wbs-plan-link-actions"
import { createSupabaseServerAuthClient } from "@/lib/supabase/server-auth"
import type {
  MarkerOfekProjectDailyLogRow,
  MarkerOfekProjectDocumentRow,
  MarkerOfekProjectRow,
  MarkerOfekSiteMediaRow,
} from "@/types/marker-ofek"

type ContractBrief = {
  id: string
  contract_type: string
  status: string
  total_amount: number | null
  entities: { name: string } | { name: string }[] | null
}

export async function MarkerOfekProjectHubSection({ id }: { id: string }) {
  const supabase = await createSupabaseServerAuthClient()

  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select(
      "id, internal_project_code, name, address, client_name, tender_id, status, is_deleted, deleted_at, created_at"
    )
    .eq("id", id)
    .eq("is_deleted", false)
    .maybeSingle()

  if (projectError || !project) notFound()

  await ensureProjectSiteForProject(id)
  await ensureProjectVaultDefaultFolders(id)

  const [
    contractsRes,
    documentsRes,
    siteRes,
    mediaRes,
    issuesRes,
    tasksForProgress,
  ] = await Promise.all([
    supabase
      .from("contracts")
      .select("id, contract_type, status, total_amount, entities ( name )")
      .eq("project_id", id)
      .eq("is_deleted", false)
      .order("created_at", { ascending: false }),
    supabase
      .from("project_documents")
      .select(
        "id, project_id, title, file_path, document_kind, mime_type, created_at, version_group_id, version_number, is_current, parent_document_id, updated_at, is_folder, vault_folder_key"
      )
      .eq("project_id", id)
      .order("created_at", { ascending: false }),
    supabase.from("project_sites").select("*").eq("project_id", id).maybeSingle(),
    supabase
      .from("site_media")
      .select("id, project_id, storage_path, mime_type, caption, taken_at, created_at")
      .eq("project_id", id)
      .order("created_at", { ascending: false })
      .limit(8),
    supabase
      .from("project_daily_logs")
      .select("*")
      .eq("project_id", id)
      .not("red_flags", "is", null)
      .order("created_at", { ascending: false })
      .limit(6),
    fetchProjectTasks(id),
  ])

  const contracts = contractsRes.data ?? []
  const documents = (documentsRes.data ?? []) as MarkerOfekProjectDocumentRow[]
  const site = (siteRes.error ? null : siteRes.data) as Record<string, unknown> | null
  const media = (mediaRes.error ? [] : (mediaRes.data ?? [])) as MarkerOfekSiteMediaRow[]
  const issues = (issuesRes.error ? [] : (issuesRes.data ?? [])) as MarkerOfekProjectDailyLogRow[]

  const progressPercent = weightedLeafProgressPercent(tasksForProgress)

  const siteLabel =
    site?.display_name != null && String(site.display_name).trim()
      ? String(site.display_name)
      : site?.site_address != null && String(site.site_address).trim()
        ? String(site.site_address)
        : null

  let tenderDisplay: string | null = null
  const tenderId = project.tender_id as string | null
  if (tenderId) {
    const { data: t } = await supabase
      .from("tenders")
      .select("project_name_from_ai, tender_date_target")
      .eq("id", tenderId)
      .maybeSingle()
    if (t) {
      tenderDisplay =
        t.project_name_from_ai?.trim() ||
        t.tender_date_target ||
        null
    }
  }

  const row = project as MarkerOfekProjectRow

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-8 bg-white pb-10">
      <Link
        href="/marker-ofek/projects"
        className="inline-flex w-fit items-center gap-2 text-sm text-slate-500 transition-colors hover:text-indigo-700"
      >
        <ArrowRight className="size-4 rotate-180" aria-hidden />
        חזרה לפרויקטים
      </Link>

      <div className="space-y-1">
        <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
          מרכז רווח · ביצוע
        </p>
        <h1 className="text-2xl font-bold tracking-tight text-[#1e293b] md:text-3xl">
          {row.name}
        </h1>
        <p className="font-currency-mono text-sm text-slate-500 tabular-nums">
          {row.internal_project_code}
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-start gap-2">
        <Link
          href={`/marker-ofek/execution/gantt/${id}`}
          className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500"
        >
          <LayoutList className="size-4" aria-hidden />
          גאנט מלא
        </Link>
        <Link
          href={`/marker-ofek/projects/${id}/daily-log`}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-100 bg-white px-4 py-2 text-sm font-medium text-[#1e293b] shadow-sm hover:bg-slate-50"
        >
          <Smartphone className="size-4" aria-hidden />
          יומן שטח
        </Link>
        <Link
          href={`/marker-ofek/execution/gantt/${id}/field`}
          className="inline-flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-900 hover:bg-emerald-100/80"
        >
          <Smartphone className="size-4" aria-hidden />
          תצוגת שטח
        </Link>
      </div>

      <ProjectExecutionCommandView
        projectId={id}
        progressPercent={progressPercent}
        siteLabel={siteLabel}
        media={media}
        issues={issues}
      />

      <MarkerOfekProjectHubClient
        project={row}
        contracts={contracts as ContractBrief[]}
        documents={documents}
        tenderDisplay={tenderDisplay}
      />
    </div>
  )
}
