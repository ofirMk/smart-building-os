import { Suspense } from "react"
import { notFound } from "next/navigation"
import { Loader2 } from "lucide-react"

import { MarkerOfekContractDetailClient } from "./contract-detail-client"
import { loadContractWorkspaceInitial } from "@/lib/marker-ofek/contract-workspace-initial"

function ContractDetailFallback() {
  return (
    <div
      className="flex min-h-[40vh] flex-col items-center justify-center gap-3 text-muted-foreground"
      dir="rtl"
    >
      <Loader2 className="size-9 animate-spin" aria-hidden />
      <p className="text-sm">טוען חוזה…</p>
    </div>
  )
}

async function ContractDetailBody({ id }: { id: string }) {
  const initial = await loadContractWorkspaceInitial(id)
  if (!initial) notFound()
  return (
    <MarkerOfekContractDetailClient
      key={id}
      contractId={id}
      initialPayload={initial}
    />
  )
}

export default async function MarkerOfekContractDetailPage({
  params,
}: {
  params: Promise<{ id: string }> | { id: string }
}) {
  const resolved = await Promise.resolve(params)
  const id = typeof resolved.id === "string" ? resolved.id : ""
  if (!id) notFound()

  return (
    <Suspense fallback={<ContractDetailFallback />}>
      <ContractDetailBody id={id} />
    </Suspense>
  )
}
