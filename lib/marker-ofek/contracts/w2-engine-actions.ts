"use server"

/**
 * Sprint W2 Phase 2 — Server Actions for the contracts engine.
 *
 * Two mutating actions:
 *   • `createChangeOrderAction` — wraps `erp_create_change_order` RPC.
 *   • `approveBillAction`       — wraps `erp_update_bill_by_approved` RPC
 *                                  (and re-runs the waterfall).
 *
 * Both actions are RSC-friendly (use the authenticated server client so RLS
 * applies) and return a small jsonb result. They re-validate the
 * contracts-engine path so the UI refreshes after a successful call.
 */

import { revalidatePath } from "next/cache"

import { createSupabaseServerAuthClient } from "@/lib/supabase/server-auth"

import type {
  BillLineApprovalPayload,
  ChangeOrderKind,
} from "./w2-engine-types"

export type ChangeOrderActionResult =
  | {
      ok: true
      amendmentId: string
      amendmentNumber: number
      kind: ChangeOrderKind
      status: string
      valueDelta: number
      requiresApproval: boolean
    }
  | { ok: false; error: string }

/**
 * Create a change order on a subcontractor contract. The RPC enforces:
 *   - non-zero unit_price for NEW_LINE rows;
 *   - references_boq_line_id presence for QTY/PRICE deltas;
 *   - approval-required flag from system parameter.
 */
export async function createChangeOrderAction(input: {
  contractId: string
  kind: ChangeOrderKind
  payload: Record<string, unknown>
}): Promise<ChangeOrderActionResult> {
  try {
    if (!input.contractId) {
      return { ok: false, error: "contractId is required" }
    }
    const supabase = await createSupabaseServerAuthClient()
    const { data, error } = await supabase.rpc("erp_create_change_order", {
      p_contract_id: input.contractId,
      p_kind: input.kind,
      p_payload: input.payload,
    })
    if (error) {
      return { ok: false, error: error.message ?? "RPC failed" }
    }
    const row = data as {
      amendment_id: string
      amendment_number: number
      kind: ChangeOrderKind
      status: string
      value_delta: number
      requires_approval: boolean
    } | null
    if (!row) return { ok: false, error: "RPC returned no payload" }

    revalidatePath("/marker-ofek/contracts-engine")
    return {
      ok: true,
      amendmentId: row.amendment_id,
      amendmentNumber: row.amendment_number,
      kind: row.kind,
      status: row.status,
      valueDelta: Number(row.value_delta ?? 0),
      requiresApproval: Boolean(row.requires_approval),
    }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Unknown error",
    }
  }
}

export type ApproveBillActionResult =
  | {
      ok: true
      billId: string
      entryMode: "DETAILED" | "AGGREGATE"
      rowsUpdated: number
    }
  | { ok: false; error: string }

/**
 * §3.2.2.1 — Set approved_qty/approved_amount on bill lines. The RPC enforces
 * AGGREGATE-mode rule (single-row payload only) and recomputes the waterfall.
 */
export async function approveBillAction(input: {
  billId: string
  lines: BillLineApprovalPayload[]
}): Promise<ApproveBillActionResult> {
  try {
    if (!input.billId) return { ok: false, error: "billId is required" }
    if (!Array.isArray(input.lines) || input.lines.length === 0) {
      return { ok: false, error: "lines must be a non-empty array" }
    }
    const supabase = await createSupabaseServerAuthClient()
    const { data, error } = await supabase.rpc(
      "erp_update_bill_by_approved",
      {
        p_bill_id: input.billId,
        p_lines: input.lines as unknown as object,
      },
    )
    if (error) return { ok: false, error: error.message ?? "RPC failed" }
    const row = data as {
      bill_id: string
      entry_mode: "DETAILED" | "AGGREGATE"
      rows_updated: number
    } | null
    if (!row) return { ok: false, error: "RPC returned no payload" }

    revalidatePath("/marker-ofek/contracts-engine")
    return {
      ok: true,
      billId: row.bill_id,
      entryMode: row.entry_mode,
      rowsUpdated: Number(row.rows_updated ?? 0),
    }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Unknown error",
    }
  }
}

// ---------------------------------------------------------------------------
// W2.5 — §5.5.3 Auto-import of approved change orders / full contracts into
// the active planning edition's BOQ. The RPCs are additive and idempotent.
// ---------------------------------------------------------------------------

export type ImportToBoqResult =
  | { ok: true; rowsTouched: number }
  | { ok: false; error: string }

/**
 * §5.5.3 — Project an APPROVED change order onto a planning version's BOQ.
 * NEW_LINE → insert; QTY_CHANGE / PRICE_CHANGE → update or insert delta row.
 * Idempotent re-imports refresh the existing row's qty/price.
 */
export async function importChangeOrderToBoqAction(input: {
  changeOrderId: string
  planningVersionId: string
}): Promise<ImportToBoqResult> {
  try {
    if (!input.changeOrderId) {
      return { ok: false, error: "changeOrderId is required" }
    }
    if (!input.planningVersionId) {
      return { ok: false, error: "planningVersionId is required" }
    }
    const supabase = await createSupabaseServerAuthClient()
    const { data: userData } = await supabase.auth.getUser()
    if (!userData?.user) {
      return { ok: false, error: "Not authenticated" }
    }
    // The RPC resolves company access from the auth.uid via user_has_company_access.
    // company_id is passed explicitly to allow service accounts and avoid an
    // extra round-trip; here we read it from the current session metadata.
    const companyId =
      (userData.user.app_metadata?.company_id as string | undefined) ??
      (userData.user.user_metadata?.company_id as string | undefined)
    if (!companyId) {
      return { ok: false, error: "No company context on session" }
    }
    const { data, error } = await supabase.rpc(
      "erp_import_change_order_to_boq",
      {
        p_company_id: companyId,
        p_change_order_id: input.changeOrderId,
        p_version_id: input.planningVersionId,
      },
    )
    if (error) return { ok: false, error: error.message ?? "RPC failed" }
    revalidatePath("/marker-ofek/contracts-engine")
    revalidatePath("/marker-ofek/projects")
    return { ok: true, rowsTouched: Number(data ?? 0) }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Unknown error",
    }
  }
}

/**
 * §5.5.3 — Bulk-import all lines of an ACTIVE/APPROVED client contract into a
 * planning version's BOQ. Skips lines already imported (idempotent).
 */
export async function importContractToBoqAction(input: {
  contractId: string
  planningVersionId: string
}): Promise<ImportToBoqResult> {
  try {
    if (!input.contractId) {
      return { ok: false, error: "contractId is required" }
    }
    if (!input.planningVersionId) {
      return { ok: false, error: "planningVersionId is required" }
    }
    const supabase = await createSupabaseServerAuthClient()
    const { data: userData } = await supabase.auth.getUser()
    if (!userData?.user) {
      return { ok: false, error: "Not authenticated" }
    }
    const companyId =
      (userData.user.app_metadata?.company_id as string | undefined) ??
      (userData.user.user_metadata?.company_id as string | undefined)
    if (!companyId) {
      return { ok: false, error: "No company context on session" }
    }
    const { data, error } = await supabase.rpc("erp_import_contract_to_boq", {
      p_company_id: companyId,
      p_contract_id: input.contractId,
      p_version_id: input.planningVersionId,
    })
    if (error) return { ok: false, error: error.message ?? "RPC failed" }
    revalidatePath("/marker-ofek/contracts-engine")
    revalidatePath("/marker-ofek/projects")
    return { ok: true, rowsTouched: Number(data ?? 0) }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Unknown error",
    }
  }
}
