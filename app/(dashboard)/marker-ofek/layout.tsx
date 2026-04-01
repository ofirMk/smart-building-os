import { Suspense } from "react"

import { MarkerOfekRouteSkeleton } from "@/components/marker-ofek/marker-ofek-route-skeleton"
import { MarkerOfekWorkspaceLayout } from "@/components/marker-ofek/workspace/marker-ofek-workspace-layout"

export default function MarkerOfekLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <MarkerOfekWorkspaceLayout>
      <Suspense fallback={<MarkerOfekRouteSkeleton />}>{children}</Suspense>
    </MarkerOfekWorkspaceLayout>
  )
}
