"use client"

/**
 * DrilldownSheet — מודאל "Slide-Over" לזרימת F2 Drill-Down.
 *
 * עוטף את shadcn `Sheet` ומספק:
 *  - הופעה מצד התחלה (RTL: ימין; LTR: שמאל) — `side="left"` עם `dir="rtl"`
 *    מ-shadcn Sheet עושה auto-flip.
 *  - Header עם title + description.
 *  - Footer עם slot לכפתורי פעולה.
 *  - Esc סוגר ושומר את state טופס האב (שאינו מתפרק).
 *  - Focus-trap מובנה (Base UI Dialog).
 *
 * שימוש:
 * ```tsx
 * <DrilldownSheet
 *   open={open}
 *   onOpenChange={setOpen}
 *   title="פתיחת משפחת מוצר חדשה"
 *   description="קוד ייחודי + שם תצוגה"
 *   footer={<Button onClick={handleSave}>שמירה</Button>}
 * >
 *   <FamilyForm onCreated={handleCreated} />
 * </DrilldownSheet>
 * ```
 */

import * as React from "react"

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { cn } from "@/lib/utils"

export interface DrilldownSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  /** תוכן הטופס. */
  children: React.ReactNode
  /** כפתורי פעולה קבועים בתחתית. אם null — אין footer. */
  footer?: React.ReactNode
  /** רוחב מותאם לעקיפת ברירת המחדל של Sheet. */
  contentClassName?: string
}

export function DrilldownSheet({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  contentClassName,
}: DrilldownSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="left"
        className={cn(
          // ב-RTL: side="left" מתורגם לצד התחלה = ימין מבחינת המשתמש.
          // רוחב 480px מספיק לטופס יצירה מהירה (2-3 שדות + תוצאות validation).
          "flex w-full flex-col gap-0 sm:max-w-[480px]",
          contentClassName
        )}
      >
        <SheetHeader className="border-b border-border">
          <SheetTitle>{title}</SheetTitle>
          {description ? (
            <SheetDescription>{description}</SheetDescription>
          ) : null}
        </SheetHeader>
        <div className="flex-1 overflow-y-auto p-4">{children}</div>
        {footer !== null && footer !== undefined ? (
          <SheetFooter className="border-t border-border">{footer}</SheetFooter>
        ) : null}
      </SheetContent>
    </Sheet>
  )
}
