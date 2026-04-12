import type { Metadata } from "next"

import { AssetTrackingWorkspace } from "@/components/marker-ofek/logistics/asset-tracking-workspace"

export const metadata: Metadata = {
  title: "ניהול כלי עבודה וציוד",
  description:
    "Phase 6.2 — מעקב אחר כלי עבודה מוחזרים: ניפוק לעובדים והחזרה למחסן",
}

export default function AssetTrackingPage() {
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-white">
      <AssetTrackingWorkspace />
    </div>
  )
}
