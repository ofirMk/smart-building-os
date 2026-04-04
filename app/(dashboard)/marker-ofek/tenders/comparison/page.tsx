import { TendersComparisonClient } from "@/components/marker-ofek/tenders/tenders-comparison-client"

type PageProps = {
  searchParams?: Promise<{ projectId?: string }>
}

export default async function MarkerOfekTendersComparisonPage({ searchParams }: PageProps) {
  const sp = (await searchParams) ?? {}
  const projectId = sp.projectId?.trim() || null
  return <TendersComparisonClient projectId={projectId} />
}
