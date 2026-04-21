import type { Metadata } from "next"
import { Suspense } from "react"

import { AttendanceWorkspace } from "@/components/marker-ofek/execution/attendance-workspace"

export const metadata: Metadata = {
  title: "שעון נוכחות יומי",
  description:
    "Phase 7.2 — נוכחות בשטח עם GPS דמה, כניסה/יציאה ושעות יומיות",
}

export default function AttendancePage() {
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-card">
      {/* הוספת Suspense מבטיחה ש-Vercel יוכל לקמפל את הדף לסביבת הייצור */}
      <Suspense
        fallback={
          <div
            className="flex flex-1 items-center justify-center p-8 text-center text-slate-500"
            dir="rtl"
          >
            טוען מערכת נוכחות...
          </div>
        }
      >
        <AttendanceWorkspace />
      </Suspense>
    </div>
  )
}
