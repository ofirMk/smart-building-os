"use client"

/**
 * /marker-ofek/items/[id]/v3-onepage — תצוגה משווה של גרסה C.
 *
 * מציג את `MasterItemCardOnePage` (כל הסקציות בעמוד אחד עם sticky-side-nav)
 * מעל banner לבחירת גרסה. מתאים לסקירה מהירה / הדפסה / audit.
 */

import * as React from "react"
import { useParams } from "next/navigation"

import { MasterItemCardOnePage } from "@/components/marker-ofek/items/master-item-card-onepage"
import { VersionPickerBanner } from "@/components/marker-ofek/items/version-picker-banner"

export default function Page() {
  const params = useParams()
  const id = typeof params.id === "string" ? params.id : ""

  return (
    <div className="flex w-full flex-col">
      <VersionPickerBanner current="v3" itemId={id} />
      <MasterItemCardOnePage itemId={id} hideBackLink />
    </div>
  )
}
