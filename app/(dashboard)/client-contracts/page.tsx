import type { Metadata } from "next"

import { ClientContractsWorkspaceClient } from "@/components/erp/workspaces/client-contracts/client-contracts-workspace-client"

export const metadata: Metadata = {
  title: "Client Contracts Workspace",
  description: "Client-side contract and progress billing workspace.",
}

export default function ClientContractsPage() {
  return <ClientContractsWorkspaceClient />
}

