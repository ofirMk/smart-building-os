import { Suspense } from "react"
import type { Metadata } from "next"

import { MarkerOfekRouteSkeleton } from "@/components/marker-ofek/marker-ofek-route-skeleton"
import { MarkerOfekWorkspaceLayout } from "@/components/marker-ofek/workspace/marker-ofek-workspace-layout"

export const metadata: Metadata = {
  title: "מרקר אופק",
  description:
    "ERP לבנייה — לוחות זמנים, כספים, שטח וציות; ממשק נקי בעברית (RTL).",
}

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
