"use client"

/**
 * /marker-ofek/items/[id] — ברירת המחדל של כרטיס פריט.
 *
 * Phase 7.13.4-comp:
 *   הקוד הועבר ל-`MasterItemCardModern` כדי שיוכל להיות משוכפל בנתיב
 *   ההשוואה (v2-modern). הדף נשאר כברירת מחדל ומציג את אותה גרסה
 *   "modular" שמשמשת ברוטינג מה-grid.
 *
 *   ניווט בחירה: יש toolbar עליון קטן שמציע מעבר ל-`/compare`
 *   לבחינת 3 חלופות עיצוב לפני קביעת הגרסה הסופית.
 */

import * as React from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { LayoutGrid } from "lucide-react"

import { MasterItemCardModern } from "@/components/marker-ofek/items/master-item-card-modern"
import { buttonVariants } from "@/components/ui/button-variants"
import { cn } from "@/lib/utils"

export default function MarkerOfekItemMasterPage() {
  const params = useParams()
  const id = typeof params.id === "string" ? params.id : ""

  return (
    <div className="flex w-full flex-col gap-2">
      {/* פס-עזר זמני: קישור ל-compare. נסיר אחרי שהמשתמש יבחר גרסה סופית. */}
      <div className="mx-auto flex w-full max-w-6xl items-center justify-end px-2">
        <Link
          href={`/marker-ofek/items/${id}/compare`}
          className={cn(
            buttonVariants({ variant: "outline", size: "sm" }),
            "gap-1.5"
          )}
        >
          <LayoutGrid className="size-3.5" aria-hidden />
          השווה 3 גרסאות עיצוב
        </Link>
      </div>
      <MasterItemCardModern itemId={id} />
    </div>
  )
}
