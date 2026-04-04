"use client"

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

/**
 * F2 — מגירת יצירה מהירה; לערימה פנימית העבירו `stackLevel` גבוה יותר לז־אינדקס.
 */
export function QuickCreateDrawer({
  open,
  onOpenChange,
  title,
  description,
  footer,
  children,
  side = "right",
  stackLevel = 0,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: React.ReactNode
  footer?: React.ReactNode
  children: React.ReactNode
  side?: "right" | "left" | "top" | "bottom"
  /** 0 = בסיס, 1 = מגירה מקוננת מעל הראשונה */
  stackLevel?: number
}) {
  const nested = stackLevel > 0
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side={side}
        overlayClassName={nested ? "!z-[55]" : undefined}
        className={cn(
          "flex w-full flex-col gap-0 border-slate-200 bg-background p-0 sm:max-w-md",
          nested && "!z-[60]"
        )}
      >
        <SheetHeader className="border-b border-slate-100 px-4 py-4 text-start">
          <SheetTitle className="text-base">{title}</SheetTitle>
          {description ? (
            <SheetDescription className="text-start">{description}</SheetDescription>
          ) : null}
        </SheetHeader>
        <div className={cn("flex flex-1 flex-col gap-4 overflow-y-auto px-4 py-4")}>
          {children}
        </div>
        {footer ? (
          <SheetFooter className="border-t border-slate-100 px-4 py-4">{footer}</SheetFooter>
        ) : null}
      </SheetContent>
    </Sheet>
  )
}
