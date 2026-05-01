"use client"

import { useRouter } from "next/navigation"

import { ItemsDataGrid } from "@/components/marker-ofek/items/items-data-grid"

/**
 * עמוד הנחיתה של מודול הפריטים.
 *
 * Phase 7.13.4: עברנו מ-Master-Detail מבוסס-state (HeavyItemMasterScreen
 * מוטבע) ל-URL-based navigation. לחיצה על שורה ב-grid → ניווט מלא ל-
 * `/marker-ofek/items/<id>` (ה-page העשיר עם 6 הטאבים החדשים, FormProvider,
 * ImageHeader, וכפתור Save גלובלי). "פריט חדש" → ניווט ל-`/marker-ofek/items/new`
 * (PriorityItemFormClient).
 *
 * רציונל:
 *   המסך החדש בנוי כ-URL route מלא כי זה מאפשר deep-linking (שיתוף קישורים),
 *   bookmark, ו-back-button תקין. ה-grid הוא placeholder לטבלה הראשית; המצב
 *   שלו (חיפוש/גלילה) ייאפס בזמן navigation, וזה מקובל ל-list page קלאסי.
 *
 *   `HeavyItemMasterScreen` נשאר בקוד כ-fallback היסטורי — אין צריכים אקטיביים
 *   ולא שובר ייבוא, אבל הוא לא נטען יותר מדף הנחיתה הראשי.
 */
export default function MarkerOfekItemsCatalogPage() {
  const router = useRouter()

  return (
    <ItemsDataGrid
      onSelectItem={(itemId) => router.push(`/marker-ofek/items/${itemId}`)}
      onCreateNew={() => router.push("/marker-ofek/items/new")}
    />
  )
}
