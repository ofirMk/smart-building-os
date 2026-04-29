"use client"

/**
 * F2LookupField — עטיפה ויזואלית לשדה Lookup עם רמז F2.
 *
 * תפקיד:
 *  - מציג Label + תג [F2] + slot ל-input/select.
 *  - לא מנהל את ה-listener של F2 — האב מקבל handler מ-`useF2Listener` ושם אותו על
 *    `onKeyDown` של ה-input/select הפנימי (→ מתפקד רק כשהשדה בפוקוס).
 *  - משנה מראה לפי focus-within: כשהשדה הפנימי בפוקוס — ה-hint ותג ה-F2 מודגשים
 *    בצבע ה-`primary` ו-`font-medium`. כך המשתמש יודע בדיוק מתי F2 "חיה".
 *  - תמיכה ב-Mouse-Trigger: לחיצה על תג [F2] מפעילה את אותה פעולה בדיוק כמו F2.
 *
 * סיבה: cloneElement / context יוצרים תלויות שבירות. עדיף שהאב יחזיק את ה-state
 * וייצא handler. השדה הזה רק עוטף את הויזואל + מטפל בטריגר העכבר.
 *
 * שימוש:
 * ```tsx
 * const handleFamilyKeydown = useF2Listener(() => setFamilyModalOpen(true))
 * <F2LookupField
 *   id="it-family"
 *   label="משפחת מוצר"
 *   required
 *   hint="לחץ F2 ליצירת רשומה חדשה"
 *   onTrigger={() => setFamilyModalOpen(true)}
 * >
 *   <select id="it-family" onKeyDown={handleFamilyKeydown} ...>
 *     ...
 *   </select>
 * </F2LookupField>
 * ```
 */

import * as React from "react"

import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"

export interface F2LookupFieldProps {
  id: string
  label: string
  required?: boolean
  /** טקסט מתחת לשדה — רמז למשתמש. */
  hint?: string
  /** אם נדרש להציג שגיאה ספציפית לשדה. */
  error?: string | null
  /** ה-input/select/combobox שיציג ה-trigger של F2. */
  children: React.ReactNode
  /** האם התג F2 מוצג. ברירת מחדל true. */
  showF2Badge?: boolean
  /**
   * לחיצה על תג ה-F2 תפעיל את ה-callback הזה. זהה ללחיצה על מקש F2 במקלדת.
   * אם לא סופק — התג מוצג כלא-לחיצ (טקסט בלבד).
   */
  onTrigger?: () => void
  className?: string
}

export function F2LookupField({
  id,
  label,
  required,
  hint,
  error,
  children,
  showF2Badge = true,
  onTrigger,
  className,
}: F2LookupFieldProps) {
  // מוסיף `group` למעטפת — מאפשר ל-`group-focus-within:` מ-Tailwind להשפיע על ה-hint/badge
  // לפי מצב הפוקוס של ה-input/select המקונן כתוכן. `tabIndex={-1}` מוודא שה-div
  // עצמו לא מקבל פוקוס.
  const TriggerTag = onTrigger ? "button" : "span"
  return (
    <div
      className={cn("group space-y-2", className)}
      data-f2-lookup-field=""
    >
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={id} className="flex items-center gap-1">
          <span>{label}</span>
          {required ? (
            <span aria-hidden className="text-destructive">
              *
            </span>
          ) : null}
        </Label>
        {showF2Badge ? (
          <TriggerTag
            type={onTrigger ? "button" : undefined}
            onClick={onTrigger}
            tabIndex={onTrigger ? 0 : undefined}
            aria-label={
              onTrigger
                ? `פתח טופס יצירה מהירה עבור ${label} (קיצור: F2)`
                : undefined
            }
            className={cn(
              "inline-flex items-center gap-1 rounded-sm text-[10px] transition-colors",
              // ברירת מחדל — עדין, השדה לא בפוקוס.
              "text-muted-foreground/80",
              // focus-within של הקבוצה — התג לוהט עם ה-primary ומודגש.
              "group-focus-within:text-primary group-focus-within:font-medium",
              // hover (לחיצה) — מסמן את ההתנהגות הלחיצה כאשר קיים onTrigger.
              onTrigger
                ? "cursor-pointer hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background"
                : "",
              // padding ללחץ גדול יותר.
              onTrigger ? "px-1.5 py-0.5" : ""
            )}
            aria-hidden={!onTrigger}
          >
            <kbd
              className={cn(
                "rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px] leading-none text-foreground/70 transition-colors",
                "group-focus-within:border-primary group-focus-within:bg-primary/10 group-focus-within:text-primary"
              )}
            >
              F2
            </kbd>
            <span>ליצירה מהירה</span>
          </TriggerTag>
        ) : null}
      </div>
      {children}
      {error ? (
        <p className="text-[11px] text-destructive">{error}</p>
      ) : hint ? (
        <p
          className={cn(
            "text-[11px] text-muted-foreground transition-colors",
            // כשהשדה בפוקוס — ה-hint מודגש ב-primary + medium. זה הג'סטה החזותית
            // שמשדרת למשתמש "עכשיו F2 תפעיל יצירה מהירה".
            "group-focus-within:font-medium group-focus-within:text-primary"
          )}
        >
          {hint}
        </p>
      ) : null}
    </div>
  )
}
