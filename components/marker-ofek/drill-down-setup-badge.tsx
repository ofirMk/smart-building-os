"use client"

import { Badge } from "@/components/ui/badge"
import { DRILL_DOWN_QUICK_SETUP_KEY } from "@/lib/marker-ofek/drill-down-f2"

const BADGE_CLASS =
  "h-5 border-border/60 px-1.5 py-0 text-[10px] font-normal leading-none text-muted-foreground"

/** רמז ויזואלי עדין לקיצור F2 (הקמת מאסטר בלשונית חדשה) */
export function DrillDownSetupBadge() {
  return (
    <Badge
      variant="outline"
      className={BADGE_CLASS}
      title={`${DRILL_DOWN_QUICK_SETUP_KEY} — פתיחת מסך הקמה בלשונית חדשה`}
    >
      {DRILL_DOWN_QUICK_SETUP_KEY} להקמה
    </Badge>
  )
}
