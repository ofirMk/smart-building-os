import type { Metadata } from "next"

import { ClientContractsWorkspaceClient } from "@/components/erp/workspaces/contracts/client-contracts-workspace-view"

export const metadata: Metadata = {
  title: "Client Billing Workspace",
  description: "Submitted vs Approved progress billing workspace.",
}

export default function ClientBillingContractsPage() {
  return <ClientContractsWorkspaceClient />
}

