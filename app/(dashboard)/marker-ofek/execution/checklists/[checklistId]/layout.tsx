import type { ReactNode } from "react"

import { RouteShell } from "@/components/layout/route-shell"

export default function ExecutionChecklistDetailLayout({
  children,
}: {
  children: ReactNode
}) {
  return <RouteShell>{children}</RouteShell>
}
