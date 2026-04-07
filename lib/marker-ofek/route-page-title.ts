/** כותרת עברית לדף — לשימוש ב־Shell, Concierge וכרטיס "המשך מכאן" */

const titles: Record<string, string> = {
  "/": "לוח בקרה",
  "/dashboard": "לוח בקרה",
  "/partner-metrics": "שותפי ניהול",
  "/partner-finance": "מרכז שותפי ניהול",
  "/dashboard/holden": "מרכז הפיקוד של הולדן",
  "/facility": "לוח בקרה",
  "/announcements": "דוחות ונתונים",
  "/buildings": "בניינים",
  "/tenants": "ניהול דיירים",
  "/vendors": "ניהול חברות",
  "/maintenance": "תחזוקה מונעת",
  "/billing": "ניהול כספים",
  "/documents": "כספת מסמכים",
  "/tickets": "קריאות שירות",
  "/ev-management": "ניהול טעינה",
  "/amenities": "מתקנים",
  "/chat": "צ'אט AI",
}

export function titleForPath(pathname: string): string {
  if (
    pathname === "/marker-ofek/command-center" ||
    pathname === "/marker-ofek" ||
    pathname === "/marker-ofek/"
  ) {
    return "מרכז הפיקוד"
  }
  if (pathname === "/marker-ofek/settings/modules") {
    return "ניהול מודולים"
  }
  if (pathname === "/marker-ofek/settings/smart") {
    return "הגדרות חכמות"
  }
  if (pathname === "/marker-ofek/settings/user-permissions") {
    return "הרשאות משתמשים"
  }
  if (pathname === "/marker-ofek/settings/users/ai-setup") {
    return "הקמת משתמש (AI)"
  }
  if (pathname === "/marker-ofek/entities/new") {
    return "ישות חדשה"
  }
  if (pathname === "/marker-ofek/items/new") {
    return "פריט קטלוג חדש"
  }
  if (pathname === "/marker-ofek/executive") {
    return "דשבורד הנהלה"
  }
  if (pathname === "/management" || pathname.startsWith("/management/")) {
    return "לוח ניהול בכיר"
  }
  if (
    pathname === "/marker-ofek/procurement" ||
    pathname === "/marker-ofek/procurement/" ||
    pathname.startsWith("/marker-ofek/procurement/orders")
  ) {
    return "הזמנות"
  }
  if (pathname.startsWith("/marker-ofek/procurement/suppliers")) {
    return "ספקים"
  }
  if (pathname.startsWith("/marker-ofek/procurement/inventory")) {
    return "ניהול מלאי"
  }
  if (pathname.startsWith("/marker-ofek/procurement/catalog")) {
    return "קטלוג פריטים"
  }
  if (pathname.startsWith("/marker-ofek/procurement/assets")) {
    return "נכסי חברה"
  }
  if (pathname === "/marker-ofek/tenders" || pathname === "/marker-ofek/tenders/") {
    return "מכרזים והערכות"
  }
  if (pathname.startsWith("/marker-ofek/tenders/pricing")) {
    return "תמחור פרויקטים"
  }
  if (pathname.startsWith("/marker-ofek/tenders/boq")) {
    return "כתבי כמויות"
  }
  if (pathname.startsWith("/marker-ofek/tenders/comparison")) {
    return "השוואת הצעות"
  }
  if (pathname.startsWith("/marker-ofek/tenders/wbs")) {
    return "מבנה WBS"
  }
  if (pathname === "/marker-ofek/partner-finance") {
    return "מרכז שותפי ניהול"
  }
  if (pathname.startsWith("/marker-ofek/partner-finance/")) {
    return "פירוט פרויקט"
  }
  if (pathname.startsWith("/partner-finance/") && pathname !== "/partner-finance") {
    return "פירוט פרויקט"
  }
  if (titles[pathname]) return titles[pathname]
  const match = Object.keys(titles).find(
    (k) => k !== "/" && k !== "/dashboard" && pathname.startsWith(k)
  )
  return match ? titles[match] : "בניין חכם"
}
