import { TendersPricingClient } from "@/components/marker-ofek/tenders/tenders-pricing-client"

type PageProps = {
  searchParams?: Promise<{ projectId?: string }>
}

export default async function MarkerOfekTendersPricingPage({ searchParams }: PageProps) {
  const sp = (await searchParams) ?? {}
  const projectId = sp.projectId?.trim() || null
  return <TendersPricingClient projectId={projectId} />
}
