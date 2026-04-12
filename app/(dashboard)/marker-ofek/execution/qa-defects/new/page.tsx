import type { Metadata } from "next"

import { QaDefectWorkspace } from "@/components/marker-ofek/execution/qa-defect-workspace"

export const metadata: Metadata = {
  title: "ניהול ליקויים (QA)",
  description:
    "Phase 3.2 — פתיחת קריאת ליקוי, הקצאה לקבלן משנה ומעקב (Snag List)",
}

export default function NewQaDefectPage() {
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-white">
      <QaDefectWorkspace />
    </div>
  )
}
