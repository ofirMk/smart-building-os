import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

/** JetBrains / mono for all tender numeric surfaces (Diamond standard). */
export function TenderNum({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <span className={cn("font-mono tabular-nums text-[#1e293b]", className)}>{children}</span>
  )
}
