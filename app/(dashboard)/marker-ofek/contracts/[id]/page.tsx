import { Suspense } from "react"
import { notFound } from "next/navigation"
import { Loader2 } from "lucide-react"

import { ContextualPrintButton } from "@/components/marker-ofek/print/contextual-print-button"
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
    <div dir="rtl" className="flex min-h-0 flex-1 flex-col">
      {/* Contextual PDF toolbar — lives inside the live contract screen so the
          button pulls the real record id. Kept compact so it does not shift
          the existing workspace layout. */}
      <div className="sticky top-0 z-10 flex items-center justify-end gap-2 border-b border-border bg-background/80 px-4 py-2 backdrop-blur print:hidden">
        <ContextualPrintButton kind="contracts" id={id} />
      </div>
      <Suspense fallback={<ContractDetailFallback />}>
        <ContractDetailBody id={id} />
      </Suspense>
    </div>
  )
}
