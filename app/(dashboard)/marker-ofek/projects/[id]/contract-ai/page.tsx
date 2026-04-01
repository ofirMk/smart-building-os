import { notFound } from "next/navigation"

import { createSupabaseServerAuthClient } from "@/lib/supabase/server-auth"

import { ContractAiPageClient } from "./contract-ai-page-client"

export default async function MarkerOfekProjectContractAiPage({
  params,
}: {
  params: Promise<{ id: string }> | { id: string }
}) {
  const resolved = await Promise.resolve(params)
  const id = typeof resolved.id === "string" ? resolved.id : ""
  if (!id) notFound()

  const supabase = await createSupabaseServerAuthClient()
  const { data: project, error } = await supabase
    .from("projects")
    .select("id, name, internal_project_code")
    .eq("id", id)
    .eq("is_deleted", false)
    .maybeSingle()

  if (error || !project) notFound()

  return (
    <ContractAiPageClient
      project={{
        id: project.id,
        name: project.name,
        internal_project_code: project.internal_project_code,
      }}
    />
  )
}
