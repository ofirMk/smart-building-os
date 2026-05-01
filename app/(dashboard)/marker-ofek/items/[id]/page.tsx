"use client"

/**
 * /marker-ofek/items/[id] — כרטיס פריט (גרסה B — Modern / Tabbed).
 *
 * היסטוריה קצרה:
 *   • Phase 7.13.4 (c2217ce6) — 3 גרסאות להשוואה (V1 Priority / V2 Modern / V3 OnePage).
 *   • 96e00eed — המשתמש בחר ב-V3 (OnePage).
 *   • a4379b6f → 5873f836 — ניסיון חלוקת מסך Parent/Child 60-40 + Right Rail.
 *   • ‎**1/5/2026** — המשתמש ביקש לחזור לגרסה B (Modern). העבודה על ה-split
 *     נשמרת ב-git; אפשר להחיות עתידית.
 *
 * דף רגיל (לא fixed-split) — ה-`<main>` של `DashboardShell` גולל טבעית.
 */

import * as React from "react"
import { useParams } from "next/navigation"

import { MasterItemCardModern } from "@/components/marker-ofek/items/master-item-card-modern"

export default function MarkerOfekItemMasterPage() {
  const params = useParams()
  const id = typeof params.id === "string" ? params.id : ""
  return <MasterItemCardModern itemId={id} />
}
