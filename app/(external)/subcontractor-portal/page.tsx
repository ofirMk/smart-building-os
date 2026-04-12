import type { Metadata } from "next"

import { SubcontractorDashboard } from "@/components/marker-ofek/portal/subcontractor-dashboard"

export const metadata: Metadata = {
  title: "אזור קבלנים אישי",
  description:
    "Phase 7.1 — פורטל קבלנים חיצוני: ליקויים QA והגשת חשבונות — ללא גישה ל־ERP הראשי",
}

export default function SubcontractorPortalPage() {
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-white">
      <SubcontractorDashboard />
    </div>
  )
}
