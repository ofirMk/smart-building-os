import { type NextRequest, NextResponse } from "next/server"

import { requireMasterDataApiContext } from "@/lib/erp/master-data-api"

function normalizeRole(role: string | null): string {
  return (role ?? "").trim().toLowerCase()
}

export function isSiteManagerRole(role: string | null): boolean {
  const normalized = normalizeRole(role)
  return normalized.includes("site")
}

function isPrivilegedRole(role: string | null): boolean {
  const normalized = normalizeRole(role)
  return (
    normalized === "admin" ||
    normalized === "manager" ||
    normalized === "project_manager" ||
    normalized.includes("director")
  )
}

export type MobileFieldApiContext =
  | {
      ok: true
      supabase: any
      activeCompanyId: string
      userId: string
      userRole: string | null
      siteManagerOnly: boolean
    }
  | { ok: false; response: NextResponse }

export async function requireMobileFieldApiContext(
  req: NextRequest
): Promise<MobileFieldApiContext> {
  const gate = await requireMasterDataApiContext(req)
  if (!gate.ok) return { ok: false, response: gate.response }

  const { supabase, activeCompanyId, userId, userRole } = gate.ctx
  const siteManagerOnly = isSiteManagerRole(userRole)
  const privileged = isPrivilegedRole(userRole)

  if (!siteManagerOnly && !privileged) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Field interface allowed only for Site Managers or Managers" },
        { status: 403 }
      ),
    }
  }

  return {
    ok: true,
    supabase,
    activeCompanyId,
    userId,
    userRole,
    siteManagerOnly,
  }
}

export async function assertMobileProjectAccess(input: {
  supabase: any
  activeCompanyId: string
  projectId: string
  userId: string
  siteManagerOnly: boolean
}): Promise<{ ok: true; project: { id: string } } | { ok: false; response: NextResponse }> {
  const { supabase, activeCompanyId, projectId, userId, siteManagerOnly } = input

  const projectLookup = await supabase
    .from("erp_proj_projects")
    .select("id, project_manager_id")
    .eq("company_id", activeCompanyId)
    .eq("id", projectId)
    .maybeSingle()
  if (projectLookup.error) {
    return {
      ok: false,
      response: NextResponse.json({ error: projectLookup.error.message }, { status: 500 }),
    }
  }
  if (!projectLookup.data) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Project not found for active company" }, { status: 404 }),
    }
  }

  if (siteManagerOnly) {
    const managerId = (projectLookup.data as { project_manager_id?: string | null })
      .project_manager_id
    if (!managerId || managerId !== userId) {
      return {
        ok: false,
        response: NextResponse.json(
          { error: "Site Manager can access only assigned projects" },
          { status: 403 }
        ),
      }
    }
  }

  return { ok: true, project: { id: String(projectLookup.data.id) } }
}
