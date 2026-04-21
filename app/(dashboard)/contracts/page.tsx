import type { Metadata } from 'next'
import { ContractsPageClient } from '@/components/erp/workspaces/contracts/contracts-page-client'

export const metadata: Metadata = {
  title: 'Contracts Workspace',
  description: 'Master contracts grid with enterprise filters.',
}

export default function ContractsPage() {
  return <ContractsPageClient />
}