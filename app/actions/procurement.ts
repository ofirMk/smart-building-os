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

const createPurchaseOrderSchema = z.object({
  poNumber: z.string().trim().min(1, "מספר הזמנה הוא שדה חובה"),
  projectId: z.string().uuid("יש לבחור פרויקט תקין"),
  supplierId: z.string().uuid("יש לבחור ספק תקין"),
  notes: z.string().trim().optional(),
  lines: z
    .array(
      z.object({
        description: z.string().trim().min(2, "תיאור שורה הוא שדה חובה"),
        requestedQuantity: z.coerce.number().positive("כמות חייבת להיות גדולה מאפס"),
        unitPrice: z.coerce.number().min(0, "מחיר יחידה חייב להיות חיובי או אפס"),
        boqNodeId: z.string().uuid("יש לבחור סעיף BOQ"),
      })
    )
    .min(1, "נדרשת לפחות שורת הזמנה אחת"),
})

const projectLookupSchema = z.object({ id: z.string().uuid() })
const supplierLookupSchema = z.object({ id: z.string().uuid() })
const boqNodeLookupSchema = z.object({
  id: z.string().uuid(),
  version_id: z.string().uuid(),
})
const planningVersionLookupSchema = z.object({
  id: z.string().uuid(),
  project_id: z.string().uuid(),
})
const poInsertSchema = z.object({ id: z.string().uuid() })

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
  if (!companyId) {
    return {
      ok: false as const,
      error: apiErrorPayload(
        "MISSING_COMPANY_CONTEXT",
        "Missing active company context. Select an active company first."
      ),
    }
  }

  return {
    ok: true as const,
    supabase,
    userId: user.id,
    companyId,
  }
}

export async function createProcurementPurchaseOrderAction(
  input: z.input<typeof createPurchaseOrderSchema>
): Promise<ActionResult<{ id: string }>> {
  try {
    const parsed = createPurchaseOrderSchema.safeParse(input)
    if (!parsed.success) {
      return apiErrorPayload(
        "VALIDATION_ERROR",
        parsed.error.issues.map((issue) => issue.message).join(" · ") || "Invalid input"
      )
    }

    const ctx = await resolveActionContext()
    if (!ctx.ok) return ctx.error

    const projectRes = await ctx.supabase
      .from("pbc_projects")
      .select("id")
      .eq("company_id", ctx.companyId)
      .eq("id", parsed.data.projectId)
      .maybeSingle()

    if (projectRes.error) {
      return apiErrorPayload("PROJECT_RESOLVE_FAILED", projectRes.error.message)
    }
    const parsedProject = projectLookupSchema.safeParse(projectRes.data)
    if (!parsedProject.success) {
      return apiErrorPayload("PROJECT_RESOLVE_FAILED", "Project not found for active company")
    }

    const supplierRes = await ctx.supabase
      .from("proc_suppliers")
      .select("id")
      .eq("company_id", ctx.companyId)
      .eq("id", parsed.data.supplierId)
      .maybeSingle()

    if (supplierRes.error) {
      return apiErrorPayload("SUPPLIER_RESOLVE_FAILED", supplierRes.error.message)
    }
    const parsedSupplier = supplierLookupSchema.safeParse(supplierRes.data)
    if (!parsedSupplier.success) {
      return apiErrorPayload("SUPPLIER_RESOLVE_FAILED", "Supplier not found for active company")
    }

    const boqNodeIds = Array.from(new Set(parsed.data.lines.map((line) => line.boqNodeId)))
    const boqNodesRes = await ctx.supabase
      .from("pbc_boq_nodes")
      .select("id, version_id")
      .eq("company_id", ctx.companyId)
      .in("id", boqNodeIds)

    if (boqNodesRes.error) {
      return apiErrorPayload("BOQ_RESOLVE_FAILED", boqNodesRes.error.message)
    }

    const parsedBoqNodes = z.array(boqNodeLookupSchema).safeParse(boqNodesRes.data ?? [])
    if (!parsedBoqNodes.success) {
      return apiErrorPayload("BOQ_RESOLVE_FAILED", "Invalid BOQ payload returned from database")
    }
    const boqNodes = parsedBoqNodes.data
    if (boqNodes.length !== boqNodeIds.length) {
      return apiErrorPayload(
        "BOQ_RESOLVE_FAILED",
        "One or more BOQ nodes are missing for the active company"
      )
    }

    const versionIds = Array.from(new Set(boqNodes.map((row) => row.version_id)))
    const versionsRes = await ctx.supabase
      .from("pbc_planning_versions")
      .select("id, project_id")
      .eq("company_id", ctx.companyId)
      .in("id", versionIds)

    if (versionsRes.error) {
      return apiErrorPayload("BOQ_RESOLVE_FAILED", versionsRes.error.message)
    }

    const parsedVersions = z.array(planningVersionLookupSchema).safeParse(versionsRes.data ?? [])
    if (!parsedVersions.success) {
      return apiErrorPayload(
        "BOQ_RESOLVE_FAILED",
        "Invalid planning versions payload returned from database"
      )
    }
    const versionProjectMap = new Map(
      parsedVersions.data.map((row) => [row.id, row.project_id])
    )

    const hasCrossProjectNode = boqNodes.some(
      (row) => versionProjectMap.get(row.version_id) !== parsed.data.projectId
    )
    if (hasCrossProjectNode) {
      return apiErrorPayload(
        "BOQ_RESOLVE_FAILED",
        "BOQ nodes must belong to the selected project and active company"
      )
    }

    const totalAmount = parsed.data.lines.reduce(
      (sum, row) => sum + row.requestedQuantity * row.unitPrice,
      0
    )

    const poInsertRes = await ctx.supabase
      .from("proc_purchase_orders")
      .insert({
        company_id: ctx.companyId,
        po_number: parsed.data.poNumber,
        pbc_project_id: parsed.data.projectId,
        supplier_id: parsed.data.supplierId,
        status: "DRAFT",
        notes: parsed.data.notes?.trim() || null,
        total_amount: totalAmount,
      })
      .select("id")
      .single()

    if (poInsertRes.error) {
      return apiErrorPayload("PO_CREATE_FAILED", poInsertRes.error.message)
    }

    const parsedPoInsert = poInsertSchema.safeParse(poInsertRes.data)
    if (!parsedPoInsert.success) {
      return apiErrorPayload("PO_CREATE_FAILED", "Purchase order created without returned id")
    }
    const poId = parsedPoInsert.data.id

    const linesPayload = parsed.data.lines.map((line, index) => ({
      company_id: ctx.companyId,
      po_id: poId,
      line_no: index + 1,
      description: line.description,
      requested_quantity: line.requestedQuantity,
      unit_price: line.unitPrice,
      pbc_boq_node_id: line.boqNodeId,
    }))

    const linesInsertRes = await ctx.supabase
      .from("proc_purchase_order_lines")
      .insert(linesPayload)

    if (linesInsertRes.error) {
      await ctx.supabase
        .from("proc_purchase_orders")
        .delete()
        .eq("id", poId)
        .eq("company_id", ctx.companyId)
      return apiErrorPayload("PO_LINES_CREATE_FAILED", linesInsertRes.error.message)
    }

    revalidatePath("/marker-ofek/procurement-v2")
    revalidatePath(`/marker-ofek/procurement-v2/purchase-orders/${poId}`)
    return { ok: true, data: { id: poId } }
  } catch (error) {
    return apiErrorPayload("PO_CREATE_FAILED", formatError(error))
  }
}
