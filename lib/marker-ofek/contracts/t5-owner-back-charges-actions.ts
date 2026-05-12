"use server"

/**
 * Sprint T5 — Owner-side back-charges + raw-material offset assignment.
 *
 * Three thin server actions that wrap the T5 RPCs/tables. The UI surface
 * (a list view + create form) is intentionally deferred to a follow-up;
 * once these actions exist, plugging them into the contracts-engine page
 * is straightforward.
 */

import { revalidatePath } from "next/cache"

import { createSupabaseServerAuthClient } from "@/lib/supabase/server-auth"

export type OwnerBackChargeType =
  | "MATERIAL_ISSUED"
  | "EQUIPMENT_RENTAL"
  | "REWORK"
  | "WASTE_REMOVAL"
  | "DAMAGE"
  | "PENALTY"
  | "ADMINISTRATIVE"
  | "OTHER"

export type OwnerBackChargeStatus = "PENDING" | "APPROVED" | "DEDUCTED"

export interface OwnerBackChargeRow {
  id: string
  clientContractId: string
  chargeNumber: number
  chargeType: OwnerBackChargeType
  chargeDate: string
  amount: number
  description: string
  status: OwnerBackChargeStatus
  deductedInBillId: string | null
  notes: string | null
}

type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string }

async function getCompanyContext() {
  const supabase = await createSupabaseServerAuthClient()
  const { data: userData } = await supabase.auth.getUser()
  if (!userData?.user) return { ok: false as const, error: "Not authenticated" }
  const companyId =
    (userData.user.app_metadata?.company_id as string | undefined) ??
    (userData.user.user_metadata?.company_id as string | undefined)
  if (!companyId) {
    return { ok: false as const, error: "No company context on session" }
  }
  return { ok: true as const, supabase, companyId }
}

function revalidateContractsPaths() {
  revalidatePath("/marker-ofek/contracts-engine")
  revalidatePath("/marker-ofek/finance/contracts")
}

// ---------------------------------------------------------------------------
// 1. Create a new owner back-charge (PENDING by default)
// ---------------------------------------------------------------------------
export async function createOwnerBackChargeAction(input: {
  clientContractId: string
  chargeNumber: number
  chargeType?: OwnerBackChargeType
  chargeDate?: string
  amount: number
  description: string
  sourceDocRef?: string | null
  notes?: string | null
}): Promise<ActionResult<{ id: string }>> {
  try {
    if (!input.clientContractId)
      return { ok: false, error: "clientContractId is required" }
    if (!input.description?.trim())
      return { ok: false, error: "description is required" }
    if (!Number.isFinite(input.amount) || input.amount <= 0) {
      return { ok: false, error: "amount must be positive" }
    }

    const ctx = await getCompanyContext()
    if (!ctx.ok) return { ok: false, error: ctx.error }
    const { supabase, companyId } = ctx

    const { data, error } = await supabase
      .from("erp_owner_back_charges")
      .insert({
        company_id: companyId,
        client_contract_id: input.clientContractId,
        charge_number: input.chargeNumber,
        charge_type: input.chargeType ?? "OTHER",
        charge_date: input.chargeDate ?? new Date().toISOString().slice(0, 10),
        amount: input.amount,
        description: input.description,
        source_doc_ref: input.sourceDocRef ?? null,
        notes: input.notes ?? null,
        status: "PENDING",
      })
      .select("id")
      .single()

    if (error) return { ok: false, error: error.message }
    revalidateContractsPaths()
    return { ok: true, data: { id: (data as { id: string }).id } }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Unknown error",
    }
  }
}

// ---------------------------------------------------------------------------
// 2. Apply an existing back-charge to a bill (PENDING|APPROVED → APPROVED + bill_id)
// ---------------------------------------------------------------------------
export async function applyOwnerBackChargeToBillAction(input: {
  chargeId: string
  billId: string
}): Promise<
  ActionResult<{
    updated: boolean
    reason: string | null
    amount: number
  }>
> {
  try {
    if (!input.chargeId || !input.billId) {
      return { ok: false, error: "chargeId and billId are required" }
    }
    const ctx = await getCompanyContext()
    if (!ctx.ok) return { ok: false, error: ctx.error }
    const { supabase } = ctx

    const { data, error } = await supabase.rpc(
      "erp_apply_owner_back_charge_to_bill",
      {
        p_charge_id: input.chargeId,
        p_bill_id: input.billId,
      },
    )
    if (error) return { ok: false, error: error.message }
    const row = data as {
      updated: boolean
      reason?: string
      amount?: number
    } | null
    if (!row) return { ok: false, error: "RPC returned no payload" }

    revalidateContractsPaths()
    return {
      ok: true,
      data: {
        updated: Boolean(row.updated),
        reason: row.reason ?? null,
        amount: Number(row.amount ?? 0),
      },
    }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Unknown error",
    }
  }
}

// ---------------------------------------------------------------------------
// 3. Assign a raw-material offset to a client bill
// ---------------------------------------------------------------------------
export async function assignRawMaterialOffsetToClientBillAction(input: {
  offsetId: string
  billId: string
}): Promise<
  ActionResult<{
    offsetAmount: number
    commissionAmount: number
  }>
> {
  try {
    if (!input.offsetId || !input.billId) {
      return { ok: false, error: "offsetId and billId are required" }
    }
    const ctx = await getCompanyContext()
    if (!ctx.ok) return { ok: false, error: ctx.error }
    const { supabase } = ctx

    const { data, error } = await supabase.rpc(
      "erp_assign_raw_material_offset_to_client_bill",
      {
        p_offset_id: input.offsetId,
        p_bill_id: input.billId,
      },
    )
    if (error) return { ok: false, error: error.message }
    const row = data as {
      offset_amount?: number
      commission_amount?: number
    } | null
    if (!row) return { ok: false, error: "RPC returned no payload" }

    revalidateContractsPaths()
    return {
      ok: true,
      data: {
        offsetAmount: Number(row.offset_amount ?? 0),
        commissionAmount: Number(row.commission_amount ?? 0),
      },
    }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Unknown error",
    }
  }
}

// ---------------------------------------------------------------------------
// 4. Read helper — list back-charges for a client contract
// ---------------------------------------------------------------------------
export async function listOwnerBackChargesAction(input: {
  clientContractId: string
}): Promise<ActionResult<OwnerBackChargeRow[]>> {
  try {
    const ctx = await getCompanyContext()
    if (!ctx.ok) return { ok: false, error: ctx.error }
    const { supabase } = ctx

    const { data, error } = await supabase
      .from("erp_owner_back_charges")
      .select(
        "id, client_contract_id, charge_number, charge_type, charge_date, amount, description, status, deducted_in_bill_id, notes",
      )
      .eq("client_contract_id", input.clientContractId)
      .order("charge_number", { ascending: false })

    if (error) return { ok: false, error: error.message }
    const rows = (data ?? []).map((r) => ({
      id: (r as { id: string }).id,
      clientContractId: (r as { client_contract_id: string }).client_contract_id,
      chargeNumber: Number((r as { charge_number: number }).charge_number),
      chargeType: (r as { charge_type: OwnerBackChargeType }).charge_type,
      chargeDate: (r as { charge_date: string }).charge_date,
      amount: Number((r as { amount: number }).amount),
      description: (r as { description: string }).description,
      status: (r as { status: OwnerBackChargeStatus }).status,
      deductedInBillId:
        (r as { deducted_in_bill_id: string | null }).deducted_in_bill_id,
      notes: (r as { notes: string | null }).notes,
    }))
    return { ok: true, data: rows }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Unknown error",
    }
  }
}
