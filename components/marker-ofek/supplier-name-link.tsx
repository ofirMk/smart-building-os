"use client"

import * as React from "react"

import { useMarkerOfekWorkspaceOptional } from "@/components/marker-ofek/workspace/marker-ofek-workspace-context"
import { cn } from "@/lib/utils"

type SupplierNameLinkProps = {
  supplierId?: string | null
  supplierName: string
  className?: string
}

export function SupplierNameLink({
  supplierId,
  supplierName,
  className,
}: SupplierNameLinkProps) {
  const workspace = useMarkerOfekWorkspaceOptional()
  const safeName = supplierName?.trim() || "—"

  const onClick = React.useCallback(() => {
    if (!workspace) return
    workspace.openSupplierDrawer({
      supplierId: supplierId?.trim() || null,
      supplierName: safeName,
    })
  }, [workspace, supplierId, safeName])

  if (!workspace) {
    return <span className={className}>{safeName}</span>
  }

  return (
    <button
      type="button"
      className={cn(
        "text-start underline-offset-4 transition-colors hover:text-emerald-700 hover:underline dark:hover:text-emerald-400",
        className
      )}
      onClick={onClick}
      title="פתח מגירת ספק"
    >
      {safeName}
    </button>
  )
}
