import type { Metadata } from "next"
import { Suspense } from "react"

import { ProjectSetupWorkspace } from "@/components/marker-ofek/projects/project-setup-workspace"

export const metadata: Metadata = {
  title: "הקמת פרויקט / מכרז",
  description:
    "Phase 8.3 — מסך מאוחד: פרטי פרויקט + טיוטת הצעת מחיר ראשונית (BoQ)",
}

function ProjectSetupFallback() {
  return (
    <div
      className="flex min-h-[min(420px,50vh)] items-center justify-center bg-card text-sm text-slate-500"
      dir="rtl"
    >
      טוען הקמת פרויקט…
    </div>
  )
}

export default function NewMarkerOfekProjectPage() {
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-card">
      <Suspense fallback={<ProjectSetupFallback />}>
        <ProjectSetupWorkspace />
      </Suspense>
    </div>
  )
}
