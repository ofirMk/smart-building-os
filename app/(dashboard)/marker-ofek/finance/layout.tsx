import type { Metadata } from "next"

import { RouteShell } from "@/components/layout/route-shell"

export const metadata: Metadata = {
  title: "כספים",
}

export default function MarkerOfekFinanceLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <RouteShell>{children}</RouteShell>
}

