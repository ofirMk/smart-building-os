"use client"

/**
 * /marker-ofek/items/[id] — כרטיס פריט (Phase 7.13.4 → גרסת Single-Page).
 *
 * המשתמש בחר ב-1 במאי 2026 בגרסה C ("Single-Page Scroll") כעיצוב הסופי
 * של מסך הפריט. הדף הוא מעטפת דקה מעל `MasterItemCardOnePage` שאחראי
 * על כל הלוגיקה (RHF, fetch, Save, sticky-side-nav).
 *
 * הערה: ב-mobile הדף הופך ארוך — נטפל בזה ב-iteration נפרד (אופציה:
 * לקפל סקציות ב-Accordion במכשירים < md).
 */

import * as React from "react"
import { useParams } from "next/navigation"

import { MasterItemCardOnePage } from "@/components/marker-ofek/items/master-item-card-onepage"

export default function MarkerOfekItemMasterPage() {
  const params = useParams()
  const id = typeof params.id === "string" ? params.id : ""
  return <MasterItemCardOnePage itemId={id} />
}
