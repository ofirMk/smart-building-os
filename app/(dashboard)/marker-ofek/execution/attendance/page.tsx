import type { Metadata } from "next"

import { AttendanceWorkspace } from "@/components/marker-ofek/execution/attendance-workspace"

export const metadata: Metadata = {
  title: "שעון נוכחות יומי",
  description:
    "Phase 7.2 — נוכחות בשטח עם GPS דמה, כניסה/יציאה ושעות יומיות",
}

export default function AttendancePage() {
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-white">
      <AttendanceWorkspace />
    </div>
  )
}
