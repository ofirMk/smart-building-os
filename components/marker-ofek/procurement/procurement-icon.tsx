import type { LucideIcon } from "lucide-react"

import { cn } from "@/lib/utils"

export function ProcurementIcon({
  icon: Icon,
  className,
  "aria-hidden": ariaHidden = true,
}: {
  icon: LucideIcon
  className?: string
  "aria-hidden"?: boolean
}) {
  return (
    <Icon
      className={cn("size-4 shrink-0 text-indigo-600", className)}
      strokeWidth={1.5}
      aria-hidden={ariaHidden}
    />
  )
}
