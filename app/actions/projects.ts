"use server"

import { cookies } from "next/headers"
import { revalidatePath } from "next/cache"
import { z } from "zod"

import { apiErrorPayload, type ApiErrorPayload } from "@/lib/api/api-error"
import { COMPANY_COOKIE_KEY, resolveCompanyContext } from "@/lib/company-context"
import { formatError } from "@/lib/format-error"
import { createSupabaseServerAuthClient } from "@/lib/supabase/server-auth"

type ActionSuccess<T> = { ok: true; data: T }
type ActionResult<T> = ActionSuccess<T> | ApiErrorPayload

const createProjectSchema = z.object({
  projectCode: z.string().trim().min(1, "Project code is required"),
  name: z.string().trim().min(2, "Project name is required"),
  clientName: z.string().trim().optional(),
  projectManagerName: z.string().trim().optional(),
  projectType: z.enum(["RESIDENTIAL", "COMMERCIAL", "INFRA", "OTHER"]).optional(),
})

const addBoqLineSchema = z.object({
  projectId: z.string().uuid(),
  versionId: z.string().uuid().optional(),
  versionType: z.enum(["TENDER", "ZERO", "EXECUTION"]).optional(),
  parentNodeId: z.string().uuid().nullable().optional(),
  structureCode: z.string().trim().min(1, "BOQ code is required"),
  title: z.string().trim().min(2, "Title is required"),
  unitOfMeasure: z.string().trim().optional(),
  plannedQuantity: z.coerce.number().min(0),
  plannedUnitCost: z.coerce.number().min(0),
  executedPercent: z.coerce.number().min(0).max(100).optional(),
})

async function resolveActionContext() {
  const supabase = await createSupabaseServerAuthClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user?.id) {
    return {
      ok: false as const,
      error: apiErrorPayload("UNAUTHORIZED", "User must be authenticated"),
    }
  }

  const cookieStore = await cookies()
  const companyId = resolveCompanyContext(cookieStore.get(COMPANY_COOKIE_KEY)?.value)
  if (!companyId) return { ok: false as const, error: apiErrorPayload("BAD_REQUEST", "חסר הקשר חברה בסשן") }

  return {
    ok: true as const,
    supabase,
    userId: user.id,
    companyId,
  }
}

export async function createProjectAction(
  input: z.input<typeof createProjectSchema>
): Promise<ActionResult<{ id: string }>> {
  try {
    const parsed = createProjectSchema.safeParse(input)
    if (!parsed.success) {
      return apiErrorPayload(
        "VALIDATION_ERROR",
        parsed.error.issues.map((issue) => issue.message).join(" · ") || "Invalid input"
      )
    }

    const ctx = await resolveActionContext()
    if (!ctx.ok) return ctx.error

    const { data, error } = await ctx.supabase
      .from("pbc_projects")
      .insert({
        company_id: ctx.companyId,
        project_code: parsed.data.projectCode,
        name: parsed.data.name,
        client_name: parsed.data.clientName?.trim() || null,
        project_manager_name: parsed.data.projectManagerName?.trim() || null,
        project_type: parsed.data.projectType ?? "OTHER",
      })
      .select("id")
      .single()

    if (error) {
      return apiErrorPayload("PROJECT_CREATE_FAILED", error.message)
    }
    if (!data?.id) {
      return apiErrorPayload("PROJECT_CREATE_FAILED", "Project created without returned id")
    }

    revalidatePath("/marker-ofek/projects-budget-control")
    revalidatePath(`/marker-ofek/projects-budget-control/${data.id}`)
    return { ok: true, data: { id: data.id as string } }
  } catch (error) {
    return apiErrorPayload("PROJECT_CREATE_FAILED", formatError(error))
  }
}

export async function addBoqLineAction(
  input: z.input<typeof addBoqLineSchema>
): Promise<ActionResult<{ id: string; versionId: string }>> {
  try {
    const parsed = addBoqLineSchema.safeParse(input)
    if (!parsed.success) {
      return apiErrorPayload(
        "VALIDATION_ERROR",
        parsed.error.issues.map((issue) => issue.message).join(" · ") || "Invalid input"
      )
    }

    const ctx = await resolveActionContext()
    if (!ctx.ok) return ctx.error

    const projectOwnershipRes = await ctx.supabase
      .from("pbc_projects")
      .select("id")
      .eq("company_id", ctx.companyId)
      .eq("id", parsed.data.projectId)
      .maybeSingle()

    if (projectOwnershipRes.error) {
      return apiErrorPayload("PROJECT_RESOLVE_FAILED", projectOwnershipRes.error.message)
    }
    if (!projectOwnershipRes.data) {
      return apiErrorPayload("PROJECT_RESOLVE_FAILED", "Project not found for active company")
    }

    let versionId = parsed.data.versionId ?? null
    if (versionId) {
      const versionOwnershipRes = await ctx.supabase
        .from("pbc_planning_versions")
        .select("id")
        .eq("company_id", ctx.companyId)
        .eq("project_id", parsed.data.projectId)
        .eq("id", versionId)
        .maybeSingle()

      if (versionOwnershipRes.error) {
        return apiErrorPayload("VERSION_RESOLVE_FAILED", versionOwnershipRes.error.message)
      }
      if (!versionOwnershipRes.data) {
        return apiErrorPayload("VERSION_RESOLVE_FAILED", "Version not found for active company")
      }
    } else {
      const latestRes = await ctx.supabase
        .from("pbc_planning_versions")
        .select("id, version_number")
        .eq("company_id", ctx.companyId)
        .eq("project_id", parsed.data.projectId)
        .order("version_number", { ascending: false })
        .limit(1)
        .maybeSingle()

      if (latestRes.error) {
        return apiErrorPayload("VERSION_RESOLVE_FAILED", latestRes.error.message)
      }

      if (latestRes.data?.id) {
        versionId = latestRes.data.id as string
      } else {
        const createdVersionRes = await ctx.supabase
          .from("pbc_planning_versions")
          .insert({
            company_id: ctx.companyId,
            project_id: parsed.data.projectId,
            version_number: 1,
            version_kind: parsed.data.versionType ?? "EXECUTION",
            status: "DRAFT",
          })
          .select("id")
          .single()

        if (createdVersionRes.error) {
          return apiErrorPayload("VERSION_CREATE_FAILED", createdVersionRes.error.message)
        }
        versionId = String(createdVersionRes.data?.id ?? "")
      }
    }

    if (!versionId) {
      return apiErrorPayload("VERSION_RESOLVE_FAILED", "Missing version id for BOQ insert")
    }

    let hierarchyLevel = 1
    if (parsed.data.parentNodeId) {
      const parentRes = await ctx.supabase
        .from("pbc_boq_nodes")
        .select("hierarchy_level")
        .eq("company_id", ctx.companyId)
        .eq("id", parsed.data.parentNodeId)
        .maybeSingle()

      if (parentRes.error) {
        return apiErrorPayload("BOQ_PARENT_READ_FAILED", parentRes.error.message)
      }
      hierarchyLevel = Math.min(4, Number(parentRes.data?.hierarchy_level ?? 0) + 1)
    }

    const boqInsertRes = await ctx.supabase
      .from("pbc_boq_nodes")
      .insert({
        company_id: ctx.companyId,
        version_id: versionId,
        parent_node_id: parsed.data.parentNodeId ?? null,
        hierarchy_level: hierarchyLevel,
        structure_code: parsed.data.structureCode,
        title: parsed.data.title,
        unit_of_measure: parsed.data.unitOfMeasure?.trim() || null,
        planned_quantity: parsed.data.plannedQuantity,
        planned_unit_cost: parsed.data.plannedUnitCost,
        executed_percent: parsed.data.executedPercent ?? 0,
      })
      .select("id")
      .single()

    if (boqInsertRes.error) {
      return apiErrorPayload("BOQ_INSERT_FAILED", boqInsertRes.error.message)
    }

    const createdBoqId = String(boqInsertRes.data?.id ?? "")
    if (!createdBoqId) {
      return apiErrorPayload("BOQ_INSERT_FAILED", "BOQ line created without returned id")
    }

    revalidatePath("/marker-ofek/projects-budget-control")
    revalidatePath(`/marker-ofek/projects-budget-control/${parsed.data.projectId}`)
    revalidatePath(`/marker-ofek/projects-budget-control/${parsed.data.projectId}/versions/${versionId}`)

    return {
      ok: true,
      data: {
        id: createdBoqId,
        versionId,
      },
    }
  } catch (error) {
    return apiErrorPayload("BOQ_INSERT_FAILED", formatError(error))
  }
}
