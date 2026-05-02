"use client"

/**
 * /marker-ofek/procurement/orders — Procurement Orders landing.
 *
 * Phase 8.3.X Master/Detail adoption:
 *   הדף הפך ל-thin wrapper. כל הלוגיקה (טעינה, סינון, KPIs, grid, detail tabs)
 *   נמצאת ב-`OrdersListScaffold` — עם MasterDetailShell שמכיל 4 detail tabs:
 *   [שורות ההזמנה | סטטוס קליטה | אישורים | חשבוניות].
 *
 * הזרימה:
 *   • Single-click על שורה = בחירה; ה-detail מתעדכן לאותה הזמנה.
 *   • Double-click על שורה = ניווט לכרטיס PO המלא (`/procurement/orders/[id]`).
 */

import { OrdersListScaffold } from "@/components/marker-ofek/procurement/orders-list-scaffold"

export default function ProcurementOrdersPage() {
  return <OrdersListScaffold />
}
