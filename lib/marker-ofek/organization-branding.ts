import "server-only"

import {
  DEFAULT_ORGANIZATION_DISPLAY_NAME,
  DEFAULT_SAAS_SLOGAN,
  FALLBACK_ORGANIZATION_BRANDING,
  type OrganizationBrandingSnapshot,
} from "@/lib/marker-ofek/organization-branding-public"
import { createSupabaseServerAuthClient } from "@/lib/supabase/server-auth"

export type { OrganizationBrandingSnapshot } from "@/lib/marker-ofek/organization-branding-public"
export {
  DEFAULT_ORGANIZATION_DISPLAY_NAME,
  DEFAULT_SAAS_SLOGAN,
  ERP_EXECUTION_SUBTITLE,
  FALLBACK_ORGANIZATION_BRANDING,
} from "@/lib/marker-ofek/organization-branding-public"

function normalizeName(raw: string | null | undefined): string {
  const s = String(raw ?? "").trim()
  return s.length > 0 ? s : DEFAULT_ORGANIZATION_DISPLAY_NAME
}

/**
 * מיתוג ארגון: עדיפות ל־`organizations` (logo_url, name), גיבוי ל־`company_profile`.
 */
export async function getOrganizationBranding(): Promise<OrganizationBrandingSnapshot> {
  try {
    const supabase = await createSupabaseServerAuthClient()
    const [orgRes, profileRes] = await Promise.all([
      supabase
        .from("organizations")
        .select("name, logo_url")
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("company_profile")
        .select("company_name, brand_logo_url")
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle(),
    ])

    const org = orgRes.error
      ? null
      : (orgRes.data as { name?: string | null; logo_url?: string | null } | null)
    const profile = profileRes.error
      ? null
      : (profileRes.data as {
          company_name?: string | null
          brand_logo_url?: string | null
        } | null)

    const nameFromOrg = org?.name != null ? String(org.name).trim() : ""
    const nameFromProfile =
      profile?.company_name != null ? String(profile.company_name).trim() : ""

    const logoFromOrg = org?.logo_url?.trim() || ""
    const logoFromProfile = profile?.brand_logo_url?.trim() || ""

    const organizationName = normalizeName(
      nameFromOrg || nameFromProfile || undefined
    )
    const brandLogoUrl =
      logoFromOrg || logoFromProfile || null

    if (!org && !profile) {
      return { ...FALLBACK_ORGANIZATION_BRANDING }
    }

    return {
      organizationName,
      brandLogoUrl: brandLogoUrl || null,
      slogan: DEFAULT_SAAS_SLOGAN,
    }
  } catch {
    return { ...FALLBACK_ORGANIZATION_BRANDING }
  }
}
