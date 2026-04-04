import type { SupabaseClient } from "@supabase/supabase-js"

import type { AppUserRole } from "@/lib/auth/user-role"
import { isPartnerDashboardSuperAdmin } from "@/lib/marker-ofek/partner-metrics/access"

/** מזהה פרויקט האימון — תואם למיגרציה `20260511130000_user_onboarding_qualification_demo.sql` */
export const MARKER_DEMO_SANDBOX_PROJECT_ID =
  "f0e0e0e0-e0e0-4000-e0e0-00000000d001" as const

export const MARKER_ONBOARDING_SANDBOX_PATH = "/marker-ofek/onboarding/sandbox" as const

/** נתיבים תחת מרקר אופק שלא דורשים הסמכה (ארגז חול) */
export function isMarkerOfekOnboardingExemptPath(pathname: string): boolean {
  if (pathname === MARKER_ONBOARDING_SANDBOX_PATH) return true
  if (pathname.startsWith(`${MARKER_ONBOARDING_SANDBOX_PATH}/`)) return true
  return false
}

const ENTITIES_SUPPLIERS_PREFIX = "/marker-ofek/entities/suppliers" as const
const PROCUREMENT_PREFIX = "/marker-ofek/procurement" as const

/**
 * נתיבים שמותר לבלתי-מוסמך לצורך השלמת Diamond Qualification (ספקים + רכש בלבד).
 * שאר `/marker-ofek/*` מנותב לארגז החול.
 */
export function isMarkerOfekQualificationTrainingAllowlistPath(pathname: string): boolean {
  if (isMarkerOfekOnboardingExemptPath(pathname)) return true
  if (pathname === ENTITIES_SUPPLIERS_PREFIX || pathname.startsWith(`${ENTITIES_SUPPLIERS_PREFIX}/`)) {
    return true
  }
  if (pathname === PROCUREMENT_PREFIX || pathname.startsWith(`${PROCUREMENT_PREFIX}/`)) {
    return true
  }
  return false
}

export function isExemptFromDiamondQualificationGate(
  email: string | null | undefined,
  role: AppUserRole | string | null | undefined
): boolean {
  if (role === "admin") return true
  if (isPartnerDashboardSuperAdmin(email)) return true
  return false
}

/**
 * מוסמך לעבודה במרקר אופק:
 * - אין שורה ב־user_onboarding_status → תאימות לאחור (מוסמך)
 * - is_qualified = true → מוסמך
 * - is_qualified = false → חייב ארגז חול
 */
export async function isUserQualifiedForMarkerOfek(
  supabase: SupabaseClient,
  userId: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from("user_onboarding_status")
    .select("is_qualified")
    .eq("user_id", userId)
    .maybeSingle()

  if (error) {
    if (/relation|does not exist|column/i.test(String(error.message ?? ""))) {
      return true
    }
    console.error("[qualification-gate] user_onboarding_status read failed:", error.message)
    return true
  }

  const row = data as { is_qualified?: boolean } | null
  if (!row) return true
  return row.is_qualified === true
}

export function isDemoSandboxProjectId(projectId: string | null | undefined): boolean {
  const t = projectId?.trim()
  return t === MARKER_DEMO_SANDBOX_PROJECT_ID
}
