import { notFound } from "next/navigation"

import { HoldenPartialAccountWorkspaceClient } from "@/components/holden-erp/holden-partial-account-workspace-client"
import { loadHoldenPartialDocument } from "@/lib/holden-erp/loaders"

export default async function HoldenErpPartialAccountPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const doc = await loadHoldenPartialDocument(id)
  if (!doc) notFound()

  return <HoldenPartialAccountWorkspaceClient initial={doc} />
}
