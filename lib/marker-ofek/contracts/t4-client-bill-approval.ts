"use server"

/**
 * Sprint T4 — Owner-side bill line approval (MedaTech §3.2.2.1).
 *
 * Provides the symmetric counterpart to the subcontractor side:
 *   • `loadClientBillLinesForApproval` — fetch lines for the dual-pane editor
 *   • `approveClientBillAction`        — write approved_qty/approved_amount
 *                                         per line + recompute the §3.2.2
 *                                         waterfall (T2) in the same call.
 *
 * AGGREGATE mode (§3.2.2.2) is supported: callers pass a single payload row
 * with `bill_line_id = "00000000-..."` and the action persists the value
 * into `aggregate_approved_amount` on the bill header instead of touching
 * lines.
 */

import { revalidatePath } from "next/cache"

import { createSupabaseServerAuthClient } from "@/lib/supabase/server-auth"
import type {
  BillLineApprovalPayload,
  BillLineForApproval,
} from "@/lib/marker-ofek/contracts/w2-engine-types"

const AGGREGATE_PAYLOAD_SENTINEL = "00000000-0000-0000-0000-000000000000"

/**
 * Load the bill lines needed by the dual-pane editor for an owner-side bill.
 * Mirrors `loadBillLinesForApproval` on the subcontractor side.
 *
 * Returns an empty array on any failure so the UI degrades cleanly.
 */
export async function loadClientBillLinesForApproval(
  billId: string,
): Promise<BillLineForApproval[]> {
  try {
    const supabase = await createSupabaseServerAuthClient()
    const { data, error } = await supabase
      .from("erp_client_progress_bill_lines")
      .select(
        `id,
         contract_line_id,
         submitted_qty,
         submitted_amount,
         submitted_quantity,
         approved_qty,
         approved_amount,
         approved_quantity,
         erp_client_contract_lines:contract_line_id (
           line_number,
           description
         )`,
      )
      .eq("progress_bill_id", billId)
      .order("id", { ascending: true })

    if (error || !data) return []

    return (data as unknown as Array<{
      id: string
      contract_line_id: string
      submitted_qty: number | null
      submitted_amount: number | null
      submitted_quantity: number | null
      approved_qty: number | null
      approved_amount: number | null
      approved_quantity: number | null
      erp_client_contract_lines:
        | { line_number: number | null; description: string | null }
        | { line_number: number | null; description: string | null }[]
        | null
    }>).map((row) => {
      const line = Array.isArray(row.erp_client_contract_lines)
        ? row.erp_client_contract_lines[0]
        : row.erp_client_contract_lines
      const submittedAmount =
        row.submitted_amount ?? 0
      return {
        id: row.id,
        boqLineId: row.contract_line_id,
        boqLineNo: line?.line_number ?? null,
        boqDescription: line?.description ?? null,
        submittedQty: row.submitted_quantity ?? row.submitted_qty ?? null,
        submittedAmount,
        approvedQty: row.approved_quantity ?? row.approved_qty ?? null,
        approvedAmount: row.approved_amount ?? null,
        cumulativeAmount: submittedAmount,
      }
    })
  } catch {
    return []
  }
}

export type ApproveClientBillResult =
  | {
      ok: true
      billId: string
      entryMode: "DETAILED" | "AGGREGATE"
      rowsUpdated: number
    }
  | { ok: false; error: string }

/**
 * §3.2.2.1 — Approve a client bill. Writes the approved_* columns then
 * triggers the full T2 waterfall RPC (`erp_compute_client_bill_waterfall`)
 * to refresh all dependent totals on the header.
 *
 * AGGREGATE behavior: a single payload row with
 * `bill_line_id = AGGREGATE_PAYLOAD_SENTINEL` causes the action to set
 * `bill_entry_mode='AGGREGATE'` and `aggregate_approved_amount` on the
 * header, without touching per-line approved columns (mirrors §3.2.2.2).
 */
export async function approveClientBillAction(input: {
  billId: string
  lines: BillLineApprovalPayload[]
}): Promise<ApproveClientBillResult> {
  try {
    if (!input.billId) return { ok: false, error: "billId is required" }
    if (!Array.isArray(input.lines) || input.lines.length === 0) {
      return { ok: false, error: "lines must be a non-empty array" }
    }
    const supabase = await createSupabaseServerAuthClient()
    const { data: userData } = await supabase.auth.getUser()
    if (!userData?.user) return { ok: false, error: "Not authenticated" }
    const companyId =
      (userData.user.app_metadata?.company_id as string | undefined) ??
      (userData.user.user_metadata?.company_id as string | undefined)
    if (!companyId) {
      return { ok: false, error: "No company context on session" }
    }

    // AGGREGATE path — single sentinel payload row.
    const isAggregate =
      input.lines.length === 1 &&
      input.lines[0]?.bill_line_id === AGGREGATE_PAYLOAD_SENTINEL

    let rowsUpdated = 0

    if (isAggregate) {
      const aggValue = Number(input.lines[0]?.approved_amount ?? 0)
      const { error: hdrErr } = await supabase
        .from("erp_client_progress_bills")
        .update({
          bill_entry_mode: "AGGREGATE",
          aggregate_approved_amount: aggValue,
        })
        .eq("id", input.billId)
        .eq("company_id", companyId)
      if (hdrErr) return { ok: false, error: hdrErr.message }
      rowsUpdated = 1
    } else {
      // DETAILED path — one UPDATE per line. Loops are acceptable for the
      // typical 10–200 line range; if scale grows, swap to a single
      // values() join.
      for (const line of input.lines) {
        const patch: Record<string, number | null> = {
          approved_amount: Number(line.approved_amount ?? 0),
        }
        if (line.approved_qty !== undefined && line.approved_qty !== null) {
          patch.approved_quantity = Number(line.approved_qty)
          patch.approved_qty = Number(line.approved_qty)
        }
        const { error: lineErr } = await supabase
          .from("erp_client_progress_bill_lines")
          .update(patch)
          .eq("id", line.bill_line_id)
          .eq("company_id", companyId)
        if (lineErr) return { ok: false, error: lineErr.message }
        rowsUpdated += 1
      }
      // Ensure header mode reflects DETAILED if it was AGGREGATE before.
      await supabase
        .from("erp_client_progress_bills")
        .update({ bill_entry_mode: "DETAILED" })
        .eq("id", input.billId)
        .eq("company_id", companyId)
    }

    // Recompute the T2 waterfall in the same call so the UI's downstream
    // ClientBillWaterfallCard sees the new totals after revalidate.
    const { error: rpcErr } = await supabase.rpc(
      "erp_compute_client_bill_waterfall",
      {
        p_company_id: companyId,
        p_bill_id: input.billId,
      },
    )
    if (rpcErr) return { ok: false, error: rpcErr.message }

    revalidatePath("/marker-ofek/contracts-engine")
    revalidatePath("/marker-ofek/finance/contracts")

    return {
      ok: true,
      billId: input.billId,
      entryMode: isAggregate ? "AGGREGATE" : "DETAILED",
      rowsUpdated,
    }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Unknown error",
    }
  }
}
