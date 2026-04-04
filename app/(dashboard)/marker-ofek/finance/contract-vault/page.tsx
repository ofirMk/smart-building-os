import { listProjectsForWbsSelector } from "@/lib/marker-ofek/wbs-structure-actions"

import ContractVaultClient from "./contract-vault-client"

export default async function ContractVaultPage() {
  const projects = await listProjectsForWbsSelector()
  return <ContractVaultClient projects={projects} />
}
