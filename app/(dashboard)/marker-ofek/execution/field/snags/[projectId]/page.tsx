import { createSupabaseServerAuthClient } from "@/lib/supabase/server-auth"

import FieldSnagsClient, {
  type FieldSnagContractOption,
  type FieldSnagRow,
} from "./field-snags-client"

type PageProps = {
  params: Promise<{ projectId: string }> | { projectId: string }
}

export default async function FieldSnagsPage({ params }: PageProps) {
  const resolved = await Promise.resolve(params)
  const projectId = String(resolved.projectId ?? "").trim()
  const supabase = await createSupabaseServerAuthClient()

  const { data: snags } = await supabase
    .schema("public")
    .from("mo_field_snags")
    .select("id, title, deduction_amount_ils, status, created_at, contract_id")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false })
    .limit(40)

  const { data: contractRows } = await supabase
    .schema("public")
    .from("contracts")
    .select("id, contract_type, entity_id")
    .eq("project_id", projectId)
    .eq("is_deleted", false)

  const entityIds = [
    ...new Set(
      (contractRows ?? [])
        .map((c) => String((c as { entity_id?: string }).entity_id ?? "").trim())
        .filter(Boolean)
    ),
  ]

  let nameByEntity = new Map<string, string>()
  if (entityIds.length > 0) {
    const { data: ents } = await supabase
      .schema("public")
      .from("entities")
      .select("id, name")
      .in("id", entityIds)
    for (const e of ents ?? []) {
      const id = String((e as { id?: string }).id ?? "")
      const name = String((e as { name?: string }).name ?? "").trim()
      if (id) nameByEntity.set(id, name || id)
    }
  }

  const contracts = (contractRows ?? []).map((c) => {
    const row = c as { id: string; contract_type?: string; entity_id?: string }
    const en = String(row.entity_id ?? "").trim()
    return {
      id: row.id,
      label:
        (en ? nameByEntity.get(en) ?? "ישות" : "ישות") +
        (row.contract_type ? ` · ${row.contract_type}` : ""),
    }
  })

  return (
    <FieldSnagsClient
      projectId={projectId}
      initialSnags={(snags ?? []) as FieldSnagRow[]}
      contracts={contracts as FieldSnagContractOption[]}
    />
  )
}
