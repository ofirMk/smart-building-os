import type { Metadata } from "next"

import { ClientContractsWorkspaceClient } from "@/components/erp/workspaces/client-contracts/client-contracts-workspace-client"
import { resolveContractTitle } from "@/lib/metadata/dynamic-titles"

type PageProps = {
  params: Promise<{ id: string }> | { id: string }
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const resolved = await Promise.resolve(params)
  const id = String(resolved.id ?? "").trim()
  const title = id ? await resolveContractTitle(id) : "חיובי לקוח"
  return {
    title,
    description: "מרחב ניהול חיובי לקוח ו-BOQ",
  }
}

export default async function ClientContractEditPage({ params }: PageProps) {
  const resolvedParams = await params
  return <ClientContractsWorkspaceClient initialContractId={resolvedParams.id} />
}
