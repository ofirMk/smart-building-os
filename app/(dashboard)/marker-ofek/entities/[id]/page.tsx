import { notFound } from "next/navigation"

import { EntityMasterDetailClient } from "@/components/marker-ofek/entities/entity-master-detail-client"
import type { ErpEntityData } from "@/lib/marker-ofek/erp-entity-detail-types"
import { createSupabaseServerAuthClient } from "@/lib/supabase/server-auth"

export default async function EntityDetailPage({
  params,
}: {
  params: Promise<{ id: string }> | { id: string }
}) {
  const resolvedParams = await Promise.resolve(params)
  const id = typeof resolvedParams.id === "string" ? resolvedParams.id : ""
  if (!id) notFound()

  const supabase = await createSupabaseServerAuthClient()

  // 1. שליפת רשומת ה-Master (הישות)
  const { data: entity, error: entityError } = await supabase
    .from("entities")
    .select("*")
    .eq("id", id)
    .eq("is_deleted", false)
    .maybeSingle()

  if (entityError || !entity) {
    notFound()
  }

  // 2. שליפת החוזים המקושרים לישות זו (`contracts.entity_id` → `entities.id`)
  const { data: contracts, error: contractsError } = await supabase
    .from("contracts")
    .select(
      "id, contract_type, pricing_model, contract_number, name, start_date, total_amount"
    )
    .eq("entity_id", id)
    .eq("is_deleted", false)

  const safeContracts = contractsError ? [] : contracts ?? []

  return (
    <EntityMasterDetailClient
      initialData={entity as ErpEntityData}
      entityId={id}
      contracts={safeContracts}
    />
  )
}
