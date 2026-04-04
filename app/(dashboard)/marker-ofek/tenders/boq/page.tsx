import { TendersBoqClient } from "@/components/marker-ofek/tenders/tenders-boq-client"

type PageProps = {
  searchParams?: Promise<{ projectId?: string }>
}

export default async function MarkerOfekTendersBoqPage({ searchParams }: PageProps) {
  const sp = (await searchParams) ?? {}
  const projectId = sp.projectId?.trim() || null
  return <TendersBoqClient projectId={projectId} />
}
