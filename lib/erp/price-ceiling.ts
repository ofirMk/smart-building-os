/* eslint-disable @typescript-eslint/no-explicit-any -- TODO(tech-debt): refactor DB row types; tracked for Sprint 3 cleanup. */
import { z } from "zod"

export const PRICE_OVERRIDE_EVENT = "PRICE_OVERRIDE_REQUESTED" as const
export const PENDING_PRICE_APPROVAL_STATUS = "PENDING_PRICE_APPROVAL" as const

export type EffectivePriceLookupResult = {
  effectivePrice: number
  source: string
  warningCode: string | null
  warningMessage: string | null
}

type EffectivePriceRpcRow = {
  unit_price: number | null
  price_source: string | null
  warning_code: string | null
  warning_message: string | null
}

export async function resolveEffectivePrice(input: {
  supabase: any
  companyId: string
  itemId: string
  supplierId: string
  quantity: number
  date: string
}): Promise<EffectivePriceLookupResult> {
  const { supabase, companyId, itemId, supplierId, quantity, date } = input

  const [itemLookup, supplierLookup] = await Promise.all([
    supabase
      .from("erp_md_items")
      .select("id")
      .eq("id", itemId)
      .eq("company_id", companyId)
      .maybeSingle(),
    supabase
      .from("erp_md_suppliers")
      .select("id")
      .eq("id", supplierId)
      .eq("company_id", companyId)
      .maybeSingle(),
  ])

  if (itemLookup.error) throw new Error(itemLookup.error.message)
  if (supplierLookup.error) throw new Error(supplierLookup.error.message)
  if (!itemLookup.data) throw new Error("Item not found for active company")
  if (!supplierLookup.data) throw new Error("Supplier not found for active company")

  const effective = await supabase.rpc("erp_get_effective_price", {
    p_item_id: itemId,
    p_supplier_id: supplierId,
    p_quantity: quantity,
    p_date: date,
  })
  if (effective.error) throw new Error(effective.error.message)

  const row = ((effective.data ?? [])[0] ?? null) as EffectivePriceRpcRow | null
  return {
    effectivePrice: Number(row?.unit_price ?? 0),
    source: row?.price_source ?? "FALLBACK",
    warningCode: row?.warning_code ?? null,
    warningMessage: row?.warning_message ?? null,
  }
}

export function validateEnteredPriceMax(enteredPrice: number, effectivePrice: number) {
  return z.number().min(0).max(effectivePrice).safeParse(enteredPrice)
}

export function isPriceCeilingExceeded(input: { enteredPrice: number; effectivePrice: number }): boolean {
  return input.effectivePrice > 0 && input.enteredPrice > input.effectivePrice
}

export function isManagerRole(role: string | null | undefined): boolean {
  return role === "admin" || role === "manager" || role === "property_manager"
}

export async function logManagerPriceOverride(input: {
  supabase: any
  userId: string
  projectId: string | null
  tableName: string
  documentId: string
  enteredPrice: number
  effectivePrice: number
  effectiveSource: string
}) {
  const { supabase, userId, projectId, tableName, documentId, enteredPrice, effectivePrice, effectiveSource } =
    input

  await supabase.from("mo_audit_logs").insert({
    user_id: userId,
    project_id: projectId,
    action_type: "UPDATE",
    table_name: tableName,
    old_data: {
      effectivePrice,
      source: effectiveSource,
    },
    new_data: {
      documentId,
      enteredPrice,
      effectivePrice,
      source: effectiveSource,
      overrideByManager: true,
    },
  })
}

export async function enqueuePriceOverrideNotifications(input: {
  supabase: any
  companyId: string
  entityName: "erp_purchase_order" | "erp_change_order"
  entityId: string
  projectId: string | null
  projectManagerId: string | null
  title: string
  body: string
  payload: Record<string, unknown>
}) {
  const {
    supabase,
    companyId,
    entityName,
    entityId,
    projectId,
    projectManagerId,
    title,
    body,
    payload,
  } = input

  const recipients = new Set<string>()
  if (!projectManagerId && projectId) {
    const projectManagerLookup = await supabase
      .from("erp_proj_projects")
      .select("project_manager_id")
      .eq("company_id", companyId)
      .eq("id", projectId)
      .maybeSingle()
    if (!projectManagerLookup.error && projectManagerLookup.data?.project_manager_id) {
      recipients.add(projectManagerLookup.data.project_manager_id)
    }
  }
  if (projectManagerId) recipients.add(projectManagerId)

  const managerProfiles = await supabase
    .from("profiles")
    .select("id,role")
    .in("role", ["admin", "manager", "property_manager"])
    .limit(5)
  if (!managerProfiles.error) {
    for (const row of managerProfiles.data ?? []) {
      if (row?.id) recipients.add(row.id)
    }
  }

  if (recipients.size === 0) return

  const rows = Array.from(recipients).map((recipientId) => ({
    company_id: companyId,
    entity_name: entityName,
    entity_id: entityId,
    channel: "SYSTEM",
    title,
    body,
    recipient_profile_id: recipientId,
    payload: {
      ...payload,
      eventName: PRICE_OVERRIDE_EVENT,
      projectId,
    },
  }))
  await supabase.from("erp_workflow_notifications").insert(rows)
}

