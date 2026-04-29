/**
 * Focus Mode — מצב מסך-יחיד למשתמשי הרצה ראשונה / הדגמה.
 *
 * הפעלה: הגדרת `NEXT_PUBLIC_FOCUS_MODE=items` ב-`.env.local`.
 * מצב כבוי (ברירת מחדל / ערך ריק) → המערכת מתנהגת כרגיל, ללא שינוי.
 *
 * עיקרון: ה-Focus Mode רק *מסתיר* פריטי תפריט ומפנה כניסה — לא מוחק קוד או נתיבים.
 * כל המסכים האחרים זמינים בכתובת ישירה אם תקליד אותה.
 */

const FOCUS_MODE_ENV_KEY = "NEXT_PUBLIC_FOCUS_MODE"

/** הנתיב היחיד שיוצג ב-Focus Mode "items". */
export const FOCUS_MODE_ITEMS_HOME = "/marker-ofek/items"

export type FocusModeName = "items" | "off"

export function getFocusMode(): FocusModeName {
  const raw = process.env[FOCUS_MODE_ENV_KEY]
  if (typeof raw === "string" && raw.trim().toLowerCase() === "items") {
    return "items"
  }
  return "off"
}

export function isFocusModeActive(): boolean {
  return getFocusMode() !== "off"
}

/**
 * האם נתיב מסוים מותר ב-Focus Mode הנוכחי.
 * כש-Focus Mode כבוי → תמיד true.
 * כש-Focus Mode = "items" → מותרים רק `/marker-ofek/items` ותתי-נתיבים שלו.
 */
export function isFocusModeAllowedHref(href: string): boolean {
  const mode = getFocusMode()
  if (mode === "off") return true
  if (mode === "items") {
    if (href === FOCUS_MODE_ITEMS_HOME) return true
    if (href.startsWith(`${FOCUS_MODE_ITEMS_HOME}/`)) return true
    return false
  }
  return true
}

/** נתיב הבית של ה-Focus Mode הנוכחי — לשימוש כיעד redirect מהשורש. */
export function getFocusModeHomeHref(): string | null {
  const mode = getFocusMode()
  if (mode === "items") return FOCUS_MODE_ITEMS_HOME
  return null
}
