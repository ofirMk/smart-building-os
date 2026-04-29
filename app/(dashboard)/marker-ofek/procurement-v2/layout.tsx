import type { ReactNode } from "react"

import { RouteShell } from "@/components/layout/route-shell"

export default function ProcurementV2Layout({
  children,
}: {
  children: ReactNode
}) {
  return <RouteShell>{children}</RouteShell>
}
