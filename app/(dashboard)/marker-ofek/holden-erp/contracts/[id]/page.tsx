import { notFound } from "next/navigation"

import { HoldenContractWorkspaceClient } from "@/components/holden-erp/holden-contract-workspace-client"
import { loadHoldenContractDocument } from "@/lib/holden-erp/loaders"

export default async function HoldenErpContractDocumentPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const doc = await loadHoldenContractDocument(id)
  if (!doc) notFound()

  return <HoldenContractWorkspaceClient initial={doc} />
}
