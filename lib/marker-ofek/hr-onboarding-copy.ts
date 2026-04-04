import type { WorkspacePersona } from "@/lib/marker-ofek/workspace-types"

/** טקסט קצר לעוזר AI ול־hrWelcome — כללי PO ומס לארגון */
export function hrComplianceRulesBrief(
  persona: WorkspacePersona,
  grantSystemAdmin: boolean
): string {
  const po =
    "הזמנות רכש (PO): רק הזמנות שעברו את שרשרת האישורים (כולל מנכ״ל כשנדרש) נספרות בעלות מחויבת לפרויקט. טיוטות ו«ממתין לאישור» אינן מחייבות תקציב עד לאישור סופי."
  const tax =
    "תאימות מס: יש לתעד חשבוניות ספק, ניכוי במקור ומע״מ בהתאם להנחיות רואה החשבון והגדרות הישות במערכת — אין להסתמך על הערכות בלבד."
  if (grantSystemAdmin) {
    return `${po} ${tax} כמנהל/ת מערכת: אחריותכם לפקח על הרשאות, שער אישורים ועקביות נתונים בין רכש לחיוב.`
  }
  if (persona === "field") {
    return `${po} ${tax} בשטח: דיווח יומי מלא, עדכון התקדמות בגאנט וכמויות לפני הגשת חשבונות חלקיים.`
  }
  if (persona === "finance") {
    return `${po} ${tax} בכספים: וודאו התאמה בין חשבוניות מס, חשבונות חלקיים וזרימת אישור PO לפני הכרה בהכנסה.`
  }
  return `${po} ${tax} בהנהלה: עקבו אחר תור אישורי רכש, חריגי תקציב ודוחות מע״מ לפי פרויקט.`
}

export function personaLabelHe(persona: WorkspacePersona, grantSystemAdmin: boolean): string {
  if (grantSystemAdmin) return "מנהל/ת מערכת"
  if (persona === "finance") return "כספים"
  if (persona === "field") return "שטח / ביצוע"
  return "הנהלה"
}
