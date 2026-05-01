/**
 * ItemEditForm shared types — Phase 7.13.4.
 *
 * הטיפוסים של טופס-העריכה של כרטיס פריט משותפים בין 3 טאבים (כללי /
 * לוגיסטיקה / מחירים) ובין ה-page שמחזיק את ה-`useForm` הגלובלי. חייב
 * להישאר כ-types-only קובץ (בלי runtime imports) כדי שיוכל לעלות גם
 * מקומפוננטות "use client" וגם מ-helpers שרת בעתיד.
 *
 * שימו לב: ה-form עובד ב-controlled-strings, לא ב-numbers. כל שדה מספרי
 * מיוצג כ-string בטופס (FP-safe, תואם ל-sanitizeDecimalString בשרת).
 * ההמרה ל-numeric מתבצעת רק ב-onSubmit → PUT payload.
 */

export interface ItemEditFormValues {
  // ── כללי ──
  description: string
  descriptionEn: string
  barcode: string
  status: "ACTIVE" | "INACTIVE" | "PURCHASE_ONLY" | "INTERNAL_ONLY" | "OBSOLETE"
  minOrderQuantity: string
  // ── לוגיסטיקה ──
  isInventoryManaged: boolean
  isSerialTracked: boolean
  purchasingUom: string
  conversionFactor: string
  // ── מחירים ──
  standardCost: string
  defaultPrice: string
  // ── Header ──
  imageUrl: string
}

export const ITEM_STATUS_OPTIONS: Array<{
  value: ItemEditFormValues["status"]
  label: string
}> = [
  { value: "ACTIVE", label: "פעיל" },
  { value: "INACTIVE", label: "לא פעיל" },
  { value: "PURCHASE_ONLY", label: "רכש בלבד" },
  { value: "INTERNAL_ONLY", label: "פנימי בלבד" },
  { value: "OBSOLETE", label: "יצא משימוש" },
]

export interface UomLookupOption {
  id: string
  code: string
  descriptionHe: string
  nameEn: string
  /** null = גלובלי, string = פרטי לחברה */
  companyId: string | null
}
