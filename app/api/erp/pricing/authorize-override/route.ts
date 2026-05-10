/* eslint-disable @typescript-eslint/no-explicit-any -- TODO(tech-debt): refactor DB row types; tracked for Sprint 3 cleanup. */
import { type NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import { requireMasterDataApiContext } from "@/lib/erp/master-data-api"
import { formatPricingDeltaPercent, sendExecutiveVarianceWhatsAppAlert } from "@/lib/erp/notifications"
import { isManagerRole, logManagerPriceOverride } from "@/lib/erp/price-ceiling"

const ENTITY_VALUES = [
  "PURCHASE_ORDER",
  "CHANGE_ORDER",
  "CLIENT_CONTRACT",
  "CLIENT_CONTRACT_LINE",
] as const

const authorizeSchema = z
  .object({
    entity: z.enum(ENTITY_VALUES).optional(),
    entityType: z.enum(ENTITY_VALUES).optional(),
    entityId: z.string().uuid(),
    lineId: z.string().uuid().optional().nullable(),
    projectId: z.string().uuid().optional().nullable(),
    itemId: z.string().uuid().optional().nullable(),
    authorizedPrice: z.coerce.number().min(0).optional(),
    enteredPrice: z.coerce.number().min(0).optional(),
    effectivePrice: z.coerce.number().min(0).optional(),
    effectiveSource: z.string().trim().min(1).optional(),
    notes: z.string().trim().max(500).optional().nullable(),
  })
  .superRefine((value, ctx) => {
    if (!value.entity && !value.entityType) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["entity"],
        message: "entity is required",
      })
    }
  })

const TABLE_NAME_MAP: Record<(typeof ENTITY_VALUES)[number], string> = {
  PURCHASE_ORDER: "erp_purchase_orders",
  CHANGE_ORDER: "erp_change_orders",
  CLIENT_CONTRACT: "erp_client_contracts",
  CLIENT_CONTRACT_LINE: "erp_client_contract_lines",
}

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

async function resolveProjectId(args: {
  entity: (typeof ENTITY_VALUES)[number]
  entityId: string
  supabase: any
  activeCompanyId: string
}): Promise<string | null> {
  if (args.entity === "PURCHASE_ORDER") {
    const row = await args.supabase
      .from("erp_purchase_orders")
      .select("project_id")
      .eq("company_id", args.activeCompanyId)
      .eq("id", args.entityId)
      .maybeSingle()
    return (row.data as { project_id?: string | null } | null)?.project_id ?? null
  }
  if (args.entity === "CHANGE_ORDER") {
    const row = await args.supabase
      .from("erp_change_orders")
      .select("erp_client_contracts!inner(project_id)")
      .eq("company_id", args.activeCompanyId)
      .eq("id", args.entityId)
      .maybeSingle()
    const contract = (row.data as { erp_client_contracts?: { project_id?: string | null } | null } | null)
      ?.erp_client_contracts
    return contract?.project_id ?? null
  }
  if (args.entity === "CLIENT_CONTRACT_LINE") {
    const row = await args.supabase
      .from("erp_client_contract_lines")
      .select("erp_client_contracts!inner(project_id)")
      .eq("company_id", args.activeCompanyId)
      .eq("id", args.entityId)
      .maybeSingle()
    const contract = (row.data as { erp_client_contracts?: { project_id?: string | null } | null } | null)
      ?.erp_client_contracts
    return contract?.project_id ?? null
  }
  if (args.entity === "CLIENT_CONTRACT") {
    const row = await args.supabase
      .from("erp_client_contracts")
      .select("project_id")
      .eq("company_id", args.activeCompanyId)
      .eq("id", args.entityId)
      .maybeSingle()
    return (row.data as { project_id?: string | null } | null)?.project_id ?? null
  }
  return null
}

async function resolveOverrideItemId(args: {
  entity: (typeof ENTITY_VALUES)[number]
  entityId: string
  lineId: string | null
  explicitItemId: string | null
  supabase: any
  activeCompanyId: string
}): Promise<string | null> {
  if (args.explicitItemId) return args.explicitItemId

  if (args.entity === "PURCHASE_ORDER" && args.lineId) {
    const line = await args.supabase
      .from("erp_purchase_order_lines")
      .select("item_sku")
      .eq("company_id", args.activeCompanyId)
      .eq("id", args.lineId)
      .maybeSingle()
    const itemSku = (line.data as { item_sku?: string | null } | null)?.item_sku ?? null
    if (!itemSku) return null
    const item = await args.supabase
      .from("erp_md_items")
      .select("id")
      .eq("company_id", args.activeCompanyId)
      .eq("item_number", itemSku)
      .maybeSingle()
    return (item.data as { id?: string | null } | null)?.id ?? null
  }
  if (args.entity === "CHANGE_ORDER") {
    const changeOrder = await args.supabase
      .from("erp_change_orders")
      .select("price_item_id")
      .eq("company_id", args.activeCompanyId)
      .eq("id", args.entityId)
      .maybeSingle()
    return (changeOrder.data as { price_item_id?: string | null } | null)?.price_item_id ?? null
  }
  if (args.entity === "CLIENT_CONTRACT_LINE") {
    const line = await args.supabase
      .from("erp_client_contract_lines")
      .select("item_id")
      .eq("company_id", args.activeCompanyId)
      .eq("id", args.lineId ?? args.entityId)
      .maybeSingle()
    return (line.data as { item_id?: string | null } | null)?.item_id ?? null
  }
  return null
}

async function resolveAuthorizedPriceAndQuantity(args: {
  entity: (typeof ENTITY_VALUES)[number]
  entityId: string
  lineId: string | null
  enteredPrice: number
  authorizedPrice: number
  supabase: any
  activeCompanyId: string
}): Promise<{ authorizedPrice: number; quantity: number }> {
  let quantity = 1
  let fallbackPrice = 0

  if (args.entity === "PURCHASE_ORDER" && args.lineId) {
    const line = await args.supabase
      .from("erp_purchase_order_lines")
      .select("quantity,unit_price")
      .eq("company_id", args.activeCompanyId)
      .eq("id", args.lineId)
      .maybeSingle()
    quantity = Number((line.data as { quantity?: number | null } | null)?.quantity ?? 1)
    fallbackPrice = Number((line.data as { unit_price?: number | null } | null)?.unit_price ?? 0)
  } else if (args.entity === "CHANGE_ORDER") {
    const changeOrder = await args.supabase
      .from("erp_change_orders")
      .select("qty_delta,new_unit_price")
      .eq("company_id", args.activeCompanyId)
      .eq("id", args.entityId)
      .maybeSingle()
    quantity = Math.max(1, Math.abs(Number((changeOrder.data as { qty_delta?: number | null } | null)?.qty_delta ?? 1)))
    fallbackPrice = Number((changeOrder.data as { new_unit_price?: number | null } | null)?.new_unit_price ?? 0)
  } else if (args.entity === "CLIENT_CONTRACT_LINE") {
    const line = await args.supabase
      .from("erp_client_contract_lines")
      .select("quantity,unit_price")
      .eq("company_id", args.activeCompanyId)
      .eq("id", args.lineId ?? args.entityId)
      .maybeSingle()
    quantity = Number((line.data as { quantity?: number | null } | null)?.quantity ?? 1)
    fallbackPrice = Number((line.data as { unit_price?: number | null } | null)?.unit_price ?? 0)
  }

  const directPrice = args.authorizedPrice > 0 ? args.authorizedPrice : args.enteredPrice
  const resolvedPrice = directPrice > 0 ? directPrice : fallbackPrice
  return {
    authorizedPrice: Math.max(0, Number.isFinite(resolvedPrice) ? resolvedPrice : 0),
    quantity: Math.max(1, Number.isFinite(quantity) ? quantity : 1),
  }
}

export async function POST(req: NextRequest) {
  const gate = await requireMasterDataApiContext(req)
  if (!gate.ok) return gate.response
  const { supabase, activeCompanyId, userId, userRole } = gate.ctx

  if (!isManagerRole(userRole)) {
    return NextResponse.json(
      { error: "Manager role required to authorize price overrides", code: "FORBIDDEN" },
      { status: 403 }
    )
  }

  const body = await req.json().catch(() => null)
  const parsed = authorizeSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid payload" },
      { status: 400 }
    )
  }

  const entity = parsed.data.entity ?? parsed.data.entityType!
  const rpc = await supabase.rpc("erp_authorize_price_override", {
    p_company_id: activeCompanyId,
    p_entity: entity,
    p_entity_id: parsed.data.entityId,
    p_line_id: parsed.data.lineId ?? null,
  })
  if (rpc.error) {
    return NextResponse.json({ error: rpc.error.message }, { status: 400 })
  }

  try {
    await logManagerPriceOverride({
      supabase,
      userId,
      projectId: parsed.data.projectId ?? null,
      tableName: TABLE_NAME_MAP[entity],
      documentId: parsed.data.lineId ?? parsed.data.entityId,
      enteredPrice: parsed.data.authorizedPrice ?? parsed.data.enteredPrice ?? 0,
      effectivePrice: parsed.data.effectivePrice ?? 0,
      effectiveSource: parsed.data.effectiveSource ?? "MANAGER_OVERRIDE",
    })
  } catch (error) {
    console.warn("Failed to log manager price override audit:", error)
  }

  try {
    const { authorizedPrice, quantity } = await resolveAuthorizedPriceAndQuantity({
      entity,
      entityId: parsed.data.entityId,
      lineId: parsed.data.lineId ?? null,
      enteredPrice: Number(parsed.data.enteredPrice ?? 0),
      authorizedPrice: Number(parsed.data.authorizedPrice ?? 0),
      supabase,
      activeCompanyId,
    })
    const resolvedItemId = await resolveOverrideItemId({
      entity,
      entityId: parsed.data.entityId,
      lineId: parsed.data.lineId ?? null,
      explicitItemId: parsed.data.itemId ?? null,
      supabase,
      activeCompanyId,
    })

    if (authorizedPrice > 0 && resolvedItemId) {
      const statsRes = await supabase.rpc("erp_get_historical_price_stats", {
        p_item_id: resolvedItemId,
        p_company_id: activeCompanyId,
      })
      if (statsRes.error) {
        console.warn("Historical stats lookup failed:", statsRes.error.message)
      } else {
        const stats = (statsRes.data?.[0] as { avg_price?: number | null } | undefined) ?? {}
        const avgPrice = Number(stats.avg_price ?? 0)
        if (avgPrice > 0) {
          const varianceRatio = (authorizedPrice - avgPrice) / avgPrice
          const variancePct = varianceRatio * 100
          if (authorizedPrice > avgPrice * 1.2) {
            const resolvedProjectId =
              parsed.data.projectId ??
              (await resolveProjectId({
                entity,
                entityId: parsed.data.entityId,
                supabase,
                activeCompanyId,
              }))
            const [profileRes, projectRes, itemRes] = await Promise.all([
              supabase.from("profiles").select("full_name").eq("id", userId).maybeSingle(),
              resolvedProjectId
                ? supabase
                    .from("erp_proj_projects")
                    .select("name,project_number")
                    .eq("id", resolvedProjectId)
                    .eq("company_id", activeCompanyId)
                    .maybeSingle()
                : Promise.resolve({ data: null }),
              supabase
                .from("erp_md_items")
                .select("item_name,item_number")
                .eq("id", resolvedItemId)
                .eq("company_id", activeCompanyId)
                .maybeSingle(),
            ])

            const projectName =
              (projectRes.data as { name?: string | null; project_number?: string | null } | null)?.name?.trim() ||
              (projectRes.data as { project_number?: string | null } | null)?.project_number?.trim() ||
              "Unknown Project"
            const itemName =
              (itemRes.data as { item_name?: string | null; item_number?: string | null } | null)?.item_name?.trim() ||
              (itemRes.data as { item_number?: string | null } | null)?.item_number?.trim() ||
              "Unknown Item"
            const managerName =
              (profileRes.data as { full_name?: string | null } | null)?.full_name?.trim() || "Unknown Manager"
            const totalImpact = (authorizedPrice - avgPrice) * quantity
            const alert = await sendExecutiveVarianceWhatsAppAlert({
              Project: projectName,
              Item: itemName,
              Manager: managerName,
              "Variance%": Number(variancePct.toFixed(2)),
              TotalImpact: Number(totalImpact.toFixed(2)),
            })
            if (!alert.sent) {
              console.warn("High-variance override alert not sent:", alert.reason)
            }
          }
        }
      }
    }
  } catch (error) {
    console.warn("Failed to evaluate high-variance override alert:", error)
  }

  const enteredPrice = Number(parsed.data.authorizedPrice ?? parsed.data.enteredPrice ?? 0)
  const effectivePrice = Number(parsed.data.effectivePrice ?? 0)
  const varianceRatio = effectivePrice > 0 ? (enteredPrice - effectivePrice) / effectivePrice : 0
  return NextResponse.json({
    data: {
      ...(typeof rpc.data === "object" && rpc.data !== null ? rpc.data : { status: "APPROVED" }),
      variancePct: formatPricingDeltaPercent(varianceRatio),
    },
  })
}
