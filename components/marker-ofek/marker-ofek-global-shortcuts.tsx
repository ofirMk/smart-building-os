"use client"

import * as React from "react"

/**
 * Ctrl/Cmd+K — מיקוד חיפוש פרויקטים (כשקיים בשורת הכותרת).
 * Ctrl/Cmd+S — אירוע שמירה גלובלי (דפים יכולים להאזין), לא מפריע לטפסים בפוקוס.
 * Enter — בחירת תוצאה ראשונה בחיפוש הגלובלי (ממומש ב־GlobalProjectSearch).
 * Esc — סגירת שכבות פתוחות (תפריט הקשר, וכו׳).
 */
export function MarkerOfekGlobalShortcuts() {
  React.useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const mod = e.metaKey || e.ctrlKey
      const t = e.target as HTMLElement | null
      const tag = t?.tagName?.toLowerCase()
      const inField =
        tag === "input" ||
        tag === "textarea" ||
        tag === "select" ||
        (t && (t as HTMLElement).isContentEditable)

      if (mod && (e.key === "k" || e.key === "K")) {
        e.preventDefault()
        document.getElementById("global-project-search-input")?.focus()
        return
      }

      if (mod && (e.key === "s" || e.key === "S")) {
        if (inField) return
        e.preventDefault()
        window.dispatchEvent(new Event("marker-ofek-global-save"))
        return
      }

      if (e.key === "Escape") {
        window.dispatchEvent(new Event("marker-ofek-global-escape"))
      }
    }

    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [])

  return null
}
