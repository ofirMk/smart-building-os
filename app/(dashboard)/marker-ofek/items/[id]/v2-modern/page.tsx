"use client"

/**
 * /marker-ofek/items/[id]/v2-modern — תצוגה משווה של גרסה B.
 *
 * מציג את `MasterItemCardModern` המודרני (Header עם תמונה, 6 טאבים,
 * RHF FormProvider, Save גלובלי) מעל banner לבחירת גרסה.
 */

import * as React from "react"
import { useParams } from "next/navigation"

import { MasterItemCardModern } from "@/components/marker-ofek/items/master-item-card-modern"
import { VersionPickerBanner } from "@/components/marker-ofek/items/version-picker-banner"

export default function Page() {
  const params = useParams()
  const id = typeof params.id === "string" ? params.id : ""

  return (
    <div className="flex w-full flex-col">
      <VersionPickerBanner current="v2" itemId={id} />
      <MasterItemCardModern itemId={id} hideBackLink />
    </div>
  )
}
