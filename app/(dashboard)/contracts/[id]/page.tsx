import { notFound } from 'next/navigation'
import { ContractWorkspaceClient } from '@/components/erp/workspaces/contracts/contract-workspace-view'

export default async function ContractWorkspacePage({
  params,
}: {
  params: Promise<{ id: string }> | { id: string }
}) {
  const resolved = await Promise.resolve(params)
  const id = typeof resolved.id === 'string' ? resolved.id : ''
  if (!id) notFound()
  return <ContractWorkspaceClient contractId={id} />
}