"use server"

import { createSupabaseServerAuthClient } from "@/lib/supabase/server-auth"
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role"
import type { AppUserRole } from "@/lib/auth/user-role"
import { isPartnerDashboardSuperAdmin } from "@/lib/marker-ofek/partner-metrics/access"
import { formatError } from "@/lib/utils"

export type MoAccessRequestRow = {
  id: string
  full_name: string
  role_requested: string
  requested_project_name: string
  project_id: string | null
  mobile: string
  email: string | null
  company: string | null
  status: string
  created_at: string
  projects?: { name: string | null } | null
}

function normalizeProjectsEmbed(projects: unknown): { name: string | null } | null {
  if (projects == null) return null
  if (Array.isArray(projects)) {
    const first = projects[0] as { name?: unknown } | undefined
    if (!first || typeof first !== "object") return null
    const n = first.name
    return { name: typeof n === "string" ? n : n == null ? null : String(n) }
  }
  if (typeof projects === "object" && projects !== null && "name" in projects) {
    const n = (projects as { name: unknown }).name
    return { name: typeof n === "string" ? n : n == null ? null : String(n) }
  }
  return null
}

function assertCanReviewAccessRequests(
  email: string | null | undefined,
  role: AppUserRole | string | null | undefined
): boolean {
  if (role === "admin") return true
  return isPartnerDashboardSuperAdmin(email)
}

export async function submitMoAccessRequest(input: {
  full_name: string
  role_requested: string
  requested_project_name: string
  project_id: string | null
  mobile: string
  email: string | null
  company: string | null
}): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const supabase = await createSupabaseServerAuthClient()
    const name = String(input.full_name ?? "").trim()
    const role = String(input.role_requested ?? "").trim()
    const mobile = String(input.mobile ?? "").trim()
    const projLabel = String(input.requested_project_name ?? "").trim()
    const email = String(input.email ?? "").trim() || null
    const pid = input.project_id?.trim() || null

    if (name.length < 2) return { ok: false, error: "יש למלא שם מלא" }
    if (role.length < 2) return { ok: false, error: "יש לציין תפקיד" }
    if (mobile.length < 9) return { ok: false, error: "יש למלא מספר נייד תקין" }

    const company = String(input.company ?? "").trim() || null

    const { error } = await supabase.from("mo_access_requests").insert({
      full_name: name,
      role_requested: role,
      requested_project_name: projLabel,
      project_id: pid,
      mobile,
      email,
      company,
      status: "pending",
    })

    if (error) {
      if (/relation|does not exist|column/i.test(error.message)) {
        return { ok: false, error: "הריצו מיגרציה 20260428120000 ב-Supabase" }
      }
      return { ok: false, error: error.message }
    }

    return { ok: true }
  } catch (e) {
    return { ok: false, error: formatError(e) }
  }
}

export async function listPendingMoAccessRequests(): Promise<
  { ok: true; rows: MoAccessRequestRow[] } | { ok: false; error: string }
> {
  try {
    const supabase = await createSupabaseServerAuthClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user?.id) return { ok: false, error: "נדרשת התחברות" }

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle()

    const role = (profile as { role?: AppUserRole } | null)?.role ?? null
    if (!assertCanReviewAccessRequests(user.email, role)) {
      return { ok: false, error: "אין הרשאה לצפות בבקשות גישה" }
    }

    const svc = createSupabaseServiceRoleClient()
    const { data, error } = await svc
      .from("mo_access_requests")
      .select(
        "id, full_name, role_requested, requested_project_name, project_id, mobile, email, company, status, created_at, projects(name)"
      )
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(80)

    if (error) {
      if (/relation|does not exist|column/i.test(error.message)) {
        return { ok: false, error: "הריצו מיגרציה 20260428120000 ב-Supabase" }
      }
      return { ok: false, error: error.message }
    }

    const rows: MoAccessRequestRow[] = (data ?? []).map((raw) => {
      const r = raw as Record<string, unknown>
      return {
        id: String(r.id ?? ""),
        full_name: String(r.full_name ?? ""),
        role_requested: String(r.role_requested ?? ""),
        requested_project_name: String(r.requested_project_name ?? ""),
        project_id:
          r.project_id == null || r.project_id === ""
            ? null
            : String(r.project_id),
        mobile: String(r.mobile ?? ""),
        email: r.email == null ? null : String(r.email),
        company: r.company == null ? null : String(r.company),
        status: String(r.status ?? ""),
        created_at: String(r.created_at ?? ""),
        projects: normalizeProjectsEmbed(r.projects),
      }
    })
    return { ok: true, rows }
  } catch (e) {
    return { ok: false, error: formatError(e) }
  }
}
