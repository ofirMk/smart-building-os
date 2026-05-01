"use client"

/**
 * /marker-ofek/items — דף הנחיתה של מודול הפריטים.
 *
 * Phase 7.13.5 (Hybrid Hierarchy):
 *   הדף מבוסס על הדפוס הקנוני של מרקר אופק:
 *     EntityWorkspace (sidebar+main) + BentoSmartList + slide-over FocusPane
 *
 *   קליק על שורה פותח תצוגה מקדימה ב-Sheet (`ItemPreviewFocusPane`); ה-CTA
 *   "פתח כרטיס מלא" ב-Sheet מנווט ל-`/marker-ofek/items/[id]` — ה-V3
 *   single-page-scroll עם sticky-side-nav.
 *
 *   הזרימה הזו מאפשרת גם דפדוף מהיר (preview בלי לעזוב את הליסט) וגם עבודה
 *   עמוקה (כרטיס מלא ב-route ייעודי, deep-link, mobile-friendly).
 */

import { ItemsCatalogScaffold } from "@/components/marker-ofek/items/items-catalog-scaffold"

export default function MarkerOfekItemsCatalogPage() {
  return <ItemsCatalogScaffold />
}
