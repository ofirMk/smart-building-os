"use client"

/**
 * /marker-ofek/items/[id]/v1-priority — תצוגה משווה של גרסה A.
 *
 * מציג את `HeavyItemMasterScreen` הקיים (Master-Detail בסגנון Priority/SAP
 * עם left-rail רשימת פריטים + center-tabs קלאסיים), מעל banner לבחירת
 * גרסה. ה-banner sticky כך שגלילה למטה לא מסתירה את הבחירה.
 */

import * as React from "react"
import { useParams } from "next/navigation"

import { HeavyItemMasterScreen } from "@/components/marker-ofek/items/heavy-item-master-screen"
import { VersionPickerBanner } from "@/components/marker-ofek/items/version-picker-banner"

export default function Page() {
  const params = useParams()
  const id = typeof params.id === "string" ? params.id : ""

  return (
    <div className="flex w-full flex-col">
      <VersionPickerBanner current="v1" itemId={id} />
      {/*
        HeavyItemMasterScreen מקבל initialSelectedId — זה גורם לו לטעון את
        הפריט הנכון בעמודה הימנית ולפתוח אותו בעמודה המרכזית.
        onBack מחזיר ל-/marker-ofek/items (page.tsx ההורה).
      */}
      <HeavyItemMasterScreen
        initialSelectedId={id}
        onBack={undefined /* ה-VersionPickerBanner מנהל את הניווט */}
      />
    </div>
  )
}
