import type { Metadata } from "next"

import { CommandCenterLightman } from "./command-center-lightman"

export const metadata: Metadata = {
  title: "מרכז הפיקוד",
  description: "Lightman ERP — מרכז פיקוד תפעולי",
}

/** נתוני דמו בלבד — ללא Supabase בצד ה-UI */
export default function MarkerOfekCommandCenterPage() {
  return <CommandCenterLightman />
}
