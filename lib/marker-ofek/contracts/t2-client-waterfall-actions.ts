"use server"

/**
 * Sprint T2 — Owner-side full waterfall server action (MedaTech §3.2.2).
 *
 * Wraps the new `erp_compute_client_bill_waterfall` RPC with auth + path
 * revalidation. The legacy `erp_calculate_client_bill_totals` is unchanged
 * and remains available for callers that only need the simpler breakdown.
 */

import { revalidatePath } from "next/cache"

import { createSupabaseServerAuthClient } from "@/lib/supabase/server-auth"

export interface ClientBillWaterfallSummary {
  billId: string
  contractId: string
  entryMode: "DETAILED" | "AGGREGATE"
  cumulativeExecuted: number
  escalation: number
  retentionThisBill: number
  insuranceThisBill: number
  advanceRecovery: number
  rawMaterialOffset: number
  rawMaterialCommission: number
  backChargesTotal: number
  previousBilled: number
  amountToPay: number
  vatPct: number
  vat: number
  grandTotal: number
  computedAt: string
}

export type RecomputeClientBillWaterfallResult =
  | { ok: true; summary: ClientBillWaterfallSummary }
  | { ok: false; error: string }

export async function recomputeClientBillWaterfallAction(input: {
  billId: string
}): Promise<RecomputeClientBillWaterfallResult> {
  try {
    if (!input.billId) return { ok: false, error: "billId is required" }
    const supabase = await createSupabaseServerAuthClient()
    const { data: userData } = await supabase.auth.getUser()
    if (!userData?.user) return { ok: false, error: "Not authenticated" }
    const companyId =
      (userData.user.app_metadata?.company_id as string | undefined) ??
      (userData.user.user_metadata?.company_id as string | undefined)
    if (!companyId) {
      return { ok: false, error: "No company context on session" }
    }

    const { data, error } = await supabase.rpc(
      "erp_compute_client_bill_waterfall",
      {
        p_company_id: companyId,
        p_bill_id: input.billId,
      },
    )
    if (error) return { ok: false, error: error.message ?? "RPC failed" }

    const row = data as {
      bill_id: string
      contract_id: string
      entry_mode: "DETAILED" | "AGGREGATE"
      cumulative_executed: number
      escalation: number
      retention_this_bill: number
      insurance_this_bill: number
      advance_recovery: number
      raw_material_offset: number
      raw_material_commission: number
      back_charges_total: number
      previous_billed: number
      amount_to_pay: number
      vat_pct: number
      vat: number
      grand_total: number
      computed_at: string
    } | null

    if (!row) return { ok: false, error: "RPC returned no payload" }

    revalidatePath("/marker-ofek/contracts-engine")
    revalidatePath("/marker-ofek/finance/contracts")

    return {
      ok: true,
      summary: {
        billId: row.bill_id,
        contractId: row.contract_id,
        entryMode: row.entry_mode,
        cumulativeExecuted: Number(row.cumulative_executed ?? 0),
        escalation: Number(row.escalation ?? 0),
        retentionThisBill: Number(row.retention_this_bill ?? 0),
        insuranceThisBill: Number(row.insurance_this_bill ?? 0),
        advanceRecovery: Number(row.advance_recovery ?? 0),
        rawMaterialOffset: Number(row.raw_material_offset ?? 0),
        rawMaterialCommission: Number(row.raw_material_commission ?? 0),
        backChargesTotal: Number(row.back_charges_total ?? 0),
        previousBilled: Number(row.previous_billed ?? 0),
        amountToPay: Number(row.amount_to_pay ?? 0),
        vatPct: Number(row.vat_pct ?? 17),
        vat: Number(row.vat ?? 0),
        grandTotal: Number(row.grand_total ?? 0),
        computedAt: row.computed_at,
      },
    }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Unknown error",
    }
  }
}
