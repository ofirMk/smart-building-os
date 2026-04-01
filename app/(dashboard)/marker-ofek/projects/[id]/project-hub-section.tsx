import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowRight } from "lucide-react"

import { MarkerOfekProjectHubClient } from "./project-hub-client"
import { createSupabaseServerAuthClient } from "@/lib/supabase/server-auth"
import type {
  MarkerOfekProjectDocumentRow,
  MarkerOfekProjectRow,
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

  const { data: contracts } = await supabase
    .from("contracts")
    .select("id, contract_type, status, total_amount, entities ( name )")
    .eq("project_id", id)
    .eq("is_deleted", false)
    .order("created_at", { ascending: false })

  const { data: documents } = await supabase
    .from("project_documents")
    .select(
      "id, project_id, title, file_path, document_kind, mime_type, created_at"
    )
    .eq("project_id", id)
    .order("created_at", { ascending: false })

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
    <div className="flex min-h-0 flex-1 flex-col gap-6 pb-10">
      <Link
        href="/marker-ofek/projects"
        className="inline-flex w-fit items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowRight className="size-4 rotate-180" aria-hidden />
        חזרה לפרויקטים
      </Link>

      <div className="space-y-1">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          מרכז רווח
        </p>
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">
          {row.name}
        </h1>
        <p className="text-sm text-muted-foreground">
          {row.internal_project_code}
        </p>
      </div>

      <MarkerOfekProjectHubClient
        project={row}
        contracts={(contracts ?? []) as ContractBrief[]}
        documents={(documents ?? []) as MarkerOfekProjectDocumentRow[]}
        tenderDisplay={tenderDisplay}
      />
    </div>
  )
}
