/* eslint-disable @typescript-eslint/no-explicit-any -- TODO(tech-debt): refactor DB row types; tracked for Sprint 3 cleanup. */
import type {
  ErpChangeOrder,
  ErpClientContract,
  ErpClientContractLine,
  ErpClientProgressBill,
  ErpClientProgressBillLine,
} from "@/types/erp"
import { requireMasterDataApiContext } from "@/lib/erp/master-data-api"
import type { NextRequest, NextResponse } from "next/server"

export async function requireClientContractsApiContext(
  req: NextRequest
): Promise<
  | { ok: true; supabase: any; activeCompanyId: string; userId: string; userRole: string | null }
  | { ok: false; response: NextResponse }
> {
  const gate = await requireMasterDataApiContext(req)
  if (!gate.ok) return { ok: false, response: gate.response }
  return {
    ok: true,
    supabase: gate.ctx.supabase,
    activeCompanyId: gate.ctx.activeCompanyId,
    userId: gate.ctx.userId,
    userRole: gate.ctx.userRole,
  }
}

export function normalizeRouteParams<T extends Record<string, string>>(
  params: Promise<T> | T
): Promise<T> {
  return Promise.resolve(params)
}

export function mapClientContractRow(row: any): ErpClientContract {
  return {
    id: row.id,
    companyId: row.company_id,
    projectId: row.project_id,
    supplierId: row.supplier_id ?? null,
    contractNumber: row.contract_number,
    clientName: row.client_name,
    title: row.title,
    status: row.status,
    indexationPct: Number(row.indexation_pct),
    retentionPct: Number(row.retention_pct),
    advancePaymentAmount: Number(row.advance_payment_amount),
    advanceRepaymentPct: Number(row.advance_repayment_pct),
    totalAmount: Number(row.total_amount),
    startDate: row.start_date,
    endDate: row.end_date,
  }
}

export function mapClientContractLineRow(row: any): ErpClientContractLine {
  return {
    id: row.id,
    companyId: row.company_id,
    clientContractId: row.client_contract_id,
    supplierId: row.supplier_id ?? null,
    itemId: row.item_id ?? null,
    lineNumber: Number(row.line_number),
    boqRef: row.boq_ref,
    description: row.description,
    quantity: Number(row.quantity),
    unitPrice: Number(row.unit_price),
    expectedUnitCost:
      row.expected_unit_cost === null || row.expected_unit_cost === undefined
        ? null
        : Number(row.expected_unit_cost),
    expectedTotalCost: Number(row.expected_total_cost ?? 0),
    profitabilityPct: Number(row.profitability_pct ?? 0),
    totalPrice: Number(row.total_price),
    lastApprovedPct: Number(row.last_approved_pct ?? 0),
    lastApprovedQty: Number(row.last_approved_qty ?? 0),
    lastApprovedAmount: Number(row.last_approved_amount ?? 0),
    retainageExempt: row.retainage_exempt === true,
    isAdvanceLine: row.is_advance_line === true,
    priceOverrideStatus: (row.price_override_status ?? "NONE") as "NONE" | "REQUESTED" | "APPROVED",
  }
}

export function mapChangeOrderRow(row: any): ErpChangeOrder {
  return {
    id: row.id,
    companyId: row.company_id,
    clientContractId: row.client_contract_id,
    contractLineId: row.contract_line_id,
    priceItemId: row.price_item_id ?? null,
    priceSupplierId: row.price_supplier_id ?? null,
    supplierId: row.supplier_id ?? null,
    changeOrderNumber: row.change_order_number,
    changeType: row.change_type,
    newLineDescription: row.new_line_description,
    qtyDelta: row.qty_delta !== null ? Number(row.qty_delta) : null,
    newUnitPrice: row.new_unit_price !== null ? Number(row.new_unit_price) : null,
    status: row.status,
    priceOverrideStatus: row.price_override_status ?? "NONE",
    notes: row.notes,
    isExtraWork: row.is_extra_work === true,
    isAdditionalWork: row.is_additional_work === true,
    isLocked: row.is_locked === true,
    managerApprovalRequired: row.manager_approval_required === true,
    managerApprovalReason: row.manager_approval_reason ?? null,
    effectivePriceSnapshot:
      row.effective_price_snapshot === null || row.effective_price_snapshot === undefined
        ? null
        : Number(row.effective_price_snapshot),
  }
}

export function mapProgressBillRow(row: any): ErpClientProgressBill {
  return {
    id: row.id,
    companyId: row.company_id,
    clientContractId: row.client_contract_id,
    billNumber: row.bill_number,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    status: row.status,
    submittedTotalAmount: Number(row.submitted_total_amount),
    approvedTotalAmount: Number(row.approved_total_amount),
    indexedSubmittedAmount: Number(row.indexed_submitted_amount),
    indexedApprovedAmount: Number(row.indexed_approved_amount),
    retentionDeductedAmount: Number(row.retention_deducted_amount),
    advanceRepaymentAmount: Number(row.advance_repayment_amount),
    netApprovedPayable: Number(row.net_approved_payable),
  }
}

export function mapProgressBillLineRow(row: any): ErpClientProgressBillLine {
  return {
    id: row.id,
    companyId: row.company_id,
    progressBillId: row.progress_bill_id,
    contractLineId: row.contract_line_id,
    submittedQuantity: Number(row.submitted_quantity ?? row.submitted_qty ?? 0),
    submittedAmount: Number(row.submitted_amount),
    submittedPercent: Number(row.submitted_percent ?? 0),
    approvedQuantity:
      row.approved_quantity === null || row.approved_quantity === undefined
        ? null
        : Number(row.approved_quantity),
    approvedAmount:
      row.approved_amount === null || row.approved_amount === undefined
        ? null
        : Number(row.approved_amount),
    approvedPercent:
      row.approved_percent === null || row.approved_percent === undefined
        ? null
        : Number(row.approved_percent),
    approvedManualOverride: row.approved_manual_override === true,
  }
}

