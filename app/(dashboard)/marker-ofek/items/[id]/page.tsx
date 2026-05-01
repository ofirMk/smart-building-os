"use client"

/**
 * /marker-ofek/items/[id] — כרטיס פריט (Phase 7.13.6 → Parent/Child Split).
 *
 * המשתמש ביקש ב-1 במאי 2026 (אחרי שראה את ה-Single-Page Scroll) לעבור
 * לדפוס Parent/Child 60/40: נתוני אב בחלק העליון, navigable child/grandchild
 * tabs בתחתית, split resizable, scroll פנימי בכל פאנל.
 *
 * הדף מצהיר על עצמו `flex flex-1 min-h-0 overflow-hidden` כדי שה-`main`
 * של `DashboardShell` לא יגלגל אותו — ה-split pane גולל פנימית.
 */

import * as React from "react"
import { useParams } from "next/navigation"

import { MasterItemCardSplit } from "@/components/marker-ofek/items/master-item-card-split"

export default function MarkerOfekItemMasterPage() {
  const params = useParams()
  const id = typeof params.id === "string" ? params.id : ""
  return (
    <div
      className="flex min-h-0 w-full flex-1 flex-col overflow-hidden"
      data-layout-mode="fixed-split"
    >
      <MasterItemCardSplit itemId={id} />
    </div>
  )
}
