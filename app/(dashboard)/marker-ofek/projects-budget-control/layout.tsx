import type { ReactNode } from "react"

import { RouteShell } from "@/components/layout/route-shell"

export default function ProjectsBudgetControlLayout({
  children,
}: {
  children: ReactNode
}) {
  return <RouteShell>{children}</RouteShell>
}
