import type { Metadata } from "next"

import { ClientContractsWorkspaceClient } from "@/components/erp/workspaces/client-contracts/client-contracts-workspace-client"

export const metadata: Metadata = {
  title: "Client Billing Workspace",
  description: "Interactive client billing and BOQ execution workspace.",
}

export default async function ClientContractEditPage({
  params,
}: {
  params: Promise<{ id: string }> | { id: string }
}) {
  const resolvedParams = await params
  return <ClientContractsWorkspaceClient initialContractId={resolvedParams.id} />
}
