import type { Metadata } from "next"
import Link from "next/link"

import { OnboardingWizard } from "@/components/marker-ofek/projects/onboarding/onboarding-wizard"

/**
 * Sprint P1 — Project Onboarding Wizard.
 *
 * 3-step wizard that writes to the real Supabase tables on every step:
 *   1. erp_proj_projects + projects (legacy mirror, same UUID)
 *   2. erp_client_contracts (linked via FK to step 1)
 *   3. activates both rows and navigates to /marker-ofek/projects/[id].
 *
 * The legacy Phase-8.3 ProjectSetupWorkspace flow is preserved at
 * `/marker-ofek/projects/legacy-setup` per the zero-regression rule.
 */
export const metadata: Metadata = {
  title: "הקמת פרויקט חדש",
  description:
    "Sprint P1 — אשף Multi-step עם כתיבה חיה ל-Supabase: מנהלה, חוזה מסחרי, השקה.",
}

export const dynamic = "force-dynamic"

export default function NewMarkerOfekProjectPage() {
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <OnboardingWizard />
      <div dir="rtl" className="mx-auto mt-4 mb-8 w-full max-w-5xl px-4 text-xs text-muted-foreground">
        <Link
          href="/marker-ofek/projects/legacy-setup"
          className="underline-offset-4 hover:underline"
        >
          זקוק לזרימת ה-OCR/BoQ הישנה? עבור ל-Legacy Setup
        </Link>
      </div>
    </div>
  )
}
