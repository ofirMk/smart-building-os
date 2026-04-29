"use client"

import * as React from "react"

import { HeavyItemMasterScreen } from "@/components/marker-ofek/items/heavy-item-master-screen"
import { ItemsDataGrid } from "@/components/marker-ofek/items/items-data-grid"

/**
 * עמוד הנחיתה של מודול הפריטים (Phase 6).
 *
 * חוויה Master-Detail מבוססת-state:
 *   • ברירת מחדל — ItemsDataGrid (טבלה ראשית עם חיפוש + יצירה).
 *   • לחיצה על שורה → drill-down ל-HeavyItemMasterScreen עם הפריט הנבחר.
 *   • לחיצה על "פריט חדש" → drill-down ל-HeavyItemMasterScreen עם פתיחה אוטומטית
 *     של מודל ה-Quick Create (initialOpenCreate=true).
 *   • כפתור "חזור לטבלת הפריטים" ב-toolbar של המסך העשיר מחזיר ל-grid.
 *
 * הסטייט מקומי ל-page (ולא ב-URL) — תיתן UX מהיר ושומר על מצב ה-grid (חיפוש/גלילה)
 * כשמתחזרים מ-drill-down. אם בעתיד נדרש deep-linking, נעבור ל-`?item=<id>`.
 */
type ViewState = { mode: "grid" } | { mode: "detail"; itemId: string | null; openCreate?: boolean }

export default function MarkerOfekItemsCatalogPage() {
  const [view, setView] = React.useState<ViewState>({ mode: "grid" })

  if (view.mode === "detail") {
    return (
      <HeavyItemMasterScreen
        initialSelectedId={view.itemId}
        initialOpenCreate={view.openCreate}
        onBack={() => setView({ mode: "grid" })}
      />
    )
  }

  return (
    <ItemsDataGrid
      onSelectItem={(itemId) => setView({ mode: "detail", itemId })}
      onCreateNew={() =>
        setView({ mode: "detail", itemId: null, openCreate: true })
      }
    />
  )
}
