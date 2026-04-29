import type { Metadata } from "next"

import { EntityWorkspace } from "@/components/layout/EntityWorkspace"
import { PoCreationSidebar } from "@/components/marker-ofek/procurement/po-creation-sidebar"
import { PurchaseOrderEngineForm } from "@/components/marker-ofek/procurement/purchase-order-engine-form"

export const metadata: Metadata = {
  title: "הזמנת רכש",
  description:
    "Phase 2.1 — מנוע הזמנת רכש עם בקרת תקציב (Budget-locked PO Engine)",
}

export default async function NewPurchaseOrderPage({
  searchParams,
}: {
  searchParams:
    | Promise<{ mockPo?: string | string[] | undefined }>
    | { mockPo?: string | string[] | undefined }
}) {
  const resolvedSearchParams = await Promise.resolve(searchParams)
  const mockPoParam = resolvedSearchParams.mockPo
  const mockPo = Array.isArray(mockPoParam) ? (mockPoParam[0] ?? "") : (mockPoParam ?? "")

  return (
    <EntityWorkspace
      title="Procurement PO Workspace"
      description="Master-detail 70/30 layout · יצירת הזמנת רכש"
      sidebar={<PoCreationSidebar />}
      main={<PurchaseOrderEngineForm mockPo={mockPo} />}
    />
  )
}
