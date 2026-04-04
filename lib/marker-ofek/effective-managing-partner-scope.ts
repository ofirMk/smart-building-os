import "server-only"

import { cookies } from "next/headers"

import { GUY_RAHUMIM_ADMIN_EMAIL } from "@/lib/auth/user-role"
import {
  resolvePartnerMetricsPersona,
} from "@/lib/marker-ofek/partner-metrics/access"
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role"
import {
  MIRROR_MODE_COOKIE,
  type ViewAsToken,
} from "@/lib/marker-ofek/mirror-mode-types"

export type { ViewAsToken }
export { MIRROR_MODE_COOKIE }

const emailToIdCache = new Map<string, string | null>()

export async function getAuthUserIdByEmail(email: string): Promise<string | null> {
  const e = email.trim().toLowerCase()
  if (!e) return null
  if (emailToIdCache.has(e)) return emailToIdCache.get(e) ?? null

  const service = createSupabaseServiceRoleClient()
  const { data, error } = await service.auth.admin.listUsers({ page: 1, perPage: 1000 })
  if (error) {
    emailToIdCache.set(e, null)
    return null
  }
  const u = data.users.find((x) => x.email?.trim().toLowerCase() === e)
  const id = u?.id ?? null
  emailToIdCache.set(e, id)
  return id
}

function parseViewAsCookie(raw: string | undefined): ViewAsToken {
  const v = (raw ?? "global").trim().toLowerCase()
  if (v === "guy" || v === "samer" || v === "site_manager") return v
  return "global"
}

export type ManagingPartnerScope = {
  viewAs: ViewAsToken
  /** When set, project queries use `managing_partner_id = effectiveManagingPartnerId`. */
  effectiveManagingPartnerId: string | null
  /** Banner text (Hebrew); null when not mirroring. */
  bannerLabel: string | null
}

/**
 * Resolves which `managing_partner_id` filters apply for the current viewer.
 * - Guy/Samer: always their own `viewerId` (cookie ignored).
 * - Ophir: cookie selects mirror target; `global` = no partner filter on portfolio queries.
 * - Others: no mirror, no filter.
 */
export async function resolveManagingPartnerScope(
  viewerEmail: string | null | undefined,
  viewerId: string | null | undefined
): Promise<ManagingPartnerScope> {
  const persona = resolvePartnerMetricsPersona(viewerEmail)
  const vid = viewerId?.trim() ?? ""

  if (persona === "guy" || persona === "samer") {
    if (!vid) {
      return { viewAs: "global", effectiveManagingPartnerId: null, bannerLabel: null }
    }
    return {
      viewAs: "global",
      effectiveManagingPartnerId: vid,
      bannerLabel: null,
    }
  }

  if (persona !== "ophir" || !vid) {
    return { viewAs: "global", effectiveManagingPartnerId: null, bannerLabel: null }
  }

  const cookieStore = await cookies()
  const cookie = parseViewAsCookie(cookieStore.get(MIRROR_MODE_COOKIE)?.value)

  if (cookie === "global") {
    return { viewAs: "global", effectiveManagingPartnerId: null, bannerLabel: null }
  }

  const guyEmail = GUY_RAHUMIM_ADMIN_EMAIL.trim().toLowerCase()
  const samerEmail = process.env.PARTNER_SAMER_EMAIL?.trim().toLowerCase() ?? ""
  const siteEmail = process.env.MARKER_OFEK_SITE_MANAGER_EMAIL?.trim().toLowerCase() ?? ""

  let targetEmail: string | null = null
  let labelHe = ""
  if (cookie === "guy") {
    targetEmail = guyEmail
    labelHe = "גיא רחומים"
  } else if (cookie === "samer") {
    targetEmail = samerEmail || null
    labelHe = "סאמר"
  } else {
    targetEmail = siteEmail || null
    labelHe = "מנהל אתר"
  }

  if (!targetEmail) {
    return {
      viewAs: cookie,
      effectiveManagingPartnerId: null,
      bannerLabel: `${labelHe} — חסר אימייל בהגדרות`,
    }
  }

  const id = await getAuthUserIdByEmail(targetEmail)
  if (!id) {
    return {
      viewAs: cookie,
      effectiveManagingPartnerId: null,
      bannerLabel: `${labelHe} — משתמש לא נמצא`,
    }
  }

  return {
    viewAs: cookie,
    effectiveManagingPartnerId: id,
    bannerLabel: `מציג כ: ${labelHe}`,
  }
}

/** Returns false if project is outside mirror / persona scope (for gantt & direct links). */
export async function isProjectInManagingPartnerScope(
  projectId: string,
  viewerEmail: string | null | undefined,
  viewerId: string | null | undefined
): Promise<boolean> {
  const pid = projectId.trim()
  if (!pid) return false

  const scope = await resolveManagingPartnerScope(viewerEmail, viewerId)
  const { createSupabaseServerAuthClient } = await import("@/lib/supabase/server-auth")
  const supabase = await createSupabaseServerAuthClient()

  const { data: row } = await supabase
    .from("projects")
    .select("managing_partner_id")
    .eq("id", pid)
    .eq("is_deleted", false)
    .maybeSingle()

  const mp = (row as { managing_partner_id: string | null } | null)?.managing_partner_id ?? null

  const persona = resolvePartnerMetricsPersona(viewerEmail)
  if (persona === "guy" || persona === "samer") {
    return mp === viewerId
  }

  if (persona !== "ophir") return true

  if (scope.effectiveManagingPartnerId == null) return true
  return mp === scope.effectiveManagingPartnerId
}
