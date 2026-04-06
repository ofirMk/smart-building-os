"use client"

import { usePathname } from "next/navigation"

import { useDiamondNavigation } from "@/hooks/use-diamond-navigation"

/**
 * סטנדרט Holden: F2/ESC יהלום בכל הדשבורד מחוץ למרקר אופק
 * (שם המעטפת והדפים עם hook ייעודי מנהלים את אותו סטנדרט).
 */
export function DashboardDiamondStandardNav() {
  const pathname = usePathname() ?? ""
  const suppress =
    pathname.startsWith("/marker-ofek") || pathname.startsWith("/admin")
  useDiamondNavigation("projects", { enabled: !suppress })
  return null
}
