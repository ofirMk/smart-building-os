import { redirect } from "next/navigation"

/**
 * Legacy route → redirect to canonical 3-Way Match workspace.
 *
 * ## למה redirect
 *   דף זה נבנה לפני המעבר לסכמה הקנונית (`erp_*`) וקרא מטבלאות
 *   ישנות (`supplier_invoices`, `purchase_orders`) שכבר אינן מסונכרנות
 *   לעולם הרכש החדש. Pilot עם לקוח משלם יראה כאן נתונים ריקים / חסרים.
 *
 *   המסך החדש שמבוסס על `erp_vendor_invoices` + `erp_invoice_po_line_matches`
 *   חי ב-`/marker-ofek/finance/reconciliation`
 *   (`components/marker-ofek/finance/reconciliation-workspace.tsx`, Phase 8.3).
 *
 *   4 קישורים קיימים בקוד (orders-dashboard, inventory-hub, diamond dashboard)
 *   ממשיכים לעבוד דרך ה-redirect — ללא צורך לעדכן אותם כדי לא לפזר שינוי.
 *
 * ## מה עם sub-route `reconciliation/inventory-progress`
 *   זהו פיצ'ר נפרד (מלאי מול חוזה) ולא 3-way match. ממשיך לעבוד כרגיל —
 *   Next.js file-based routing: redirect זה פוגע רק ב-path הזה.
 */
export default function LegacyReconciliationRedirect() {
  redirect("/marker-ofek/finance/reconciliation")
}
