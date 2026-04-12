/**
 * פרמטרי שאילתה אחידים לדפוס Master → Detail (ניווט + מצב ניתן לשיתוף).
 * להשתמש ב־router.replace / Link עם אותם מפתחות בכל המודולים.
 */
export const MD_QUERY = {
  /** מזהה ישות לפרטים (פרויקט ב־BI / בחירת פרויקט בתקציב) */
  entity: "e",
  /** קטגוריית תקציב (budget-control) */
  category: "c",
  /** משנה מ־1 — שורת טופס / שורת הצעת מחיר */
  line: "line",
  /** מזהה עובד בגיליון שעות (תואם attendance / HR) */
  worker: "worker",
  /** מק״ט בקטלוג טכני */
  sku: "sku",
  /** מזהה PO דמה בלוח רכש */
  mockPo: "mockPo",
} as const
