import type { Metadata } from "next"
import { Suspense } from "react"

import { ProjectSetupWorkspace } from "@/components/marker-ofek/projects/project-setup-workspace"

/**
 * Legacy project-setup workspace (Phase 8.3).
 *
 * Preserved at `/marker-ofek/projects/legacy-setup` after Sprint P1
 * promoted the new 3-step Onboarding Wizard to the canonical
 * `/marker-ofek/projects/new` route. Iron-dome rule: "do not delete
 * existing screens" — this page keeps the OCR-driven BoQ-draft flow
 * reachable for users who still rely on it.
 */
export const metadata: Metadata = {
  title: "הקמת פרויקט / מכרז (Legacy)",
  description:
    "Phase 8.3 — מסך מאוחד: פרטי פרויקט + טיוטת הצעת מחיר ראשונית (BoQ). שמור לאחור-תאימות; הזרימה הראשית עברה ל-/projects/new.",
}

function LegacySetupFallback() {
  return (
    <div
      className="flex min-h-[min(420px,50vh)] items-center justify-center bg-card text-sm text-slate-500"
      dir="rtl"
    >
      טוען הקמת פרויקט (Legacy)…
    </div>
  )
}

export default function MarkerOfekLegacyProjectSetupPage() {
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-card">
      <Suspense fallback={<LegacySetupFallback />}>
        <ProjectSetupWorkspace />
      </Suspense>
    </div>
  )
}
