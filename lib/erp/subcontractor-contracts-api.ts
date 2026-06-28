/* eslint-disable @typescript-eslint/no-explicit-any -- DB row types not yet generated */
import type { NextRequest, NextResponse } from "next/server"

import { requireMasterDataApiContext } from "@/lib/erp/master-data-api"

// ─── Context helper (same shape as procurement-api / client-contracts-api) ──

export type SubcontractorContractsApiContext =
  | { ok: true; supabase: any; activeCompanyId: string; userId: string; userRole: string | null }
  | { ok: false; response: NextResponse }

export async function requireSubcontractorContractsApiContext(
  req: NextRequest
): Promise<SubcontractorContractsApiContext> {
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

// ─── Row mappers ──────────────────────────────────────────────────────────────

export function mapSubcontractorContractRow(row: any) {
  return {
    id: row.id as string,
    companyId: row.company_id as string,
    projectId: row.project_id as string,
    subcontractorId: row.subcontractor_id as string,
    contractNumber: row.contract_number as string,
    contractType: row.contract_type as string,
    totalAmount: Number(row.total_amount ?? 0),
    insurancePct: Number(row.insurance_pct ?? 0),
    retentionPct: Number(row.retention_pct ?? 0),
    paymentTerms: (row.payment_terms as string | null) ?? null,
    escalationIncluded: Boolean(row.escalation_included),
    status: row.status as string,
    signedAt: (row.signed_at as string | null) ?? null,
    // W2 additions
    pricingMethod: (row.pricing_method as string | null) ?? null,
    advancePaymentAmount: Number(row.advance_payment_amount ?? 0),
    advanceRecoveryMethod: (row.advance_recovery_method as string | null) ?? null,
    advanceRecoveryPct: Number(row.advance_recovery_pct ?? 0),
    advancePaymentPct: Number(row.advance_payment_pct ?? 0),
    rawMaterialOffsetCommissionPct: Number(row.raw_material_offset_commission_pct ?? 0),
    maxRetentionAmount:
      row.max_retention_amount != null ? Number(row.max_retention_amount) : null,
    escalationSettingsJsonb: (row.escalation_settings_jsonb as Record<string, unknown> | null) ?? null,
    // Phase 10.1 additions
    actualStartDate: (row.actual_start_date as string | null) ?? null,
    actualEndDate: (row.actual_end_date as string | null) ?? null,
    warrantyEndDate: (row.warranty_end_date as string | null) ?? null,
    approvalChainCode: (row.approval_chain_code as string | null) ?? null,
    notes: (row.notes as string | null) ?? null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  }
}

export type MappedSubcontractorContract = ReturnType<typeof mapSubcontractorContractRow>

export function mapBoqLineRow(row: any) {
  return {
    id: row.id as string,
    companyId: row.company_id as string,
    contractId: row.contract_id as string,
    lineNo: Number(row.line_no),
    sectionCode: row.section_code as string,
    description: row.description as string,
    uom: row.uom as string,
    quantity: Number(row.quantity ?? 0),
    unitPrice: Number(row.unit_price ?? 0),
    discountAmount: Number(row.discount_amount ?? 0),
    totalLinePrice: Number(row.total_line_price ?? 0),
    escalationIncluded: Boolean(row.escalation_included),
    notes: (row.notes as string | null) ?? null,
  }
}

export type MappedBoqLine = ReturnType<typeof mapBoqLineRow>

export function mapBillRow(row: any) {
  return {
    id: row.id as string,
    companyId: row.company_id as string,
    projectId: row.project_id as string,
    contractId: row.contract_id as string,
    billNumber: Number(row.bill_number),
    executionMonth: row.execution_month as string,
    billDate: row.bill_date as string,
    cumulativeExecutedAmount: Number(row.cumulative_executed_amount ?? 0),
    retentionDeductionAmount: Number(row.retention_deduction_amount ?? 0),
    insuranceDeductionAmount: Number(row.insurance_deduction_amount ?? 0),
    escalationAmount: Number(row.escalation_amount ?? 0),
    advanceRecoveryAmount: Number(row.advance_recovery_amount ?? 0),
    rawMaterialOffsetAmount: Number(row.raw_material_offset_amount ?? 0),
    previousBilledAmount: Number(row.previous_billed_amount ?? 0),
    amountToPay: Number(row.amount_to_pay ?? 0),
    vatPct: Number(row.vat_pct ?? 17),
    vatAmount: Number(row.vat_amount ?? 0),
    grandTotalAmount: Number(row.grand_total_amount ?? 0),
    status: row.status as string,
    isFinal: Boolean(row.is_final),
    linkedVendorInvoiceId: (row.linked_vendor_invoice_id as string | null) ?? null,
    waterfallComputedAt: (row.waterfall_computed_at as string | null) ?? null,
    notes: (row.notes as string | null) ?? null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  }
}

export type MappedBill = ReturnType<typeof mapBillRow>

export function mapBillLineRow(row: any) {
  return {
    id: row.id as string,
    companyId: row.company_id as string,
    billId: row.bill_id as string,
    boqLineId: row.boq_line_id as string,
    cumulativeQty: Number(row.cumulative_qty ?? 0),
    cumulativePct: Number(row.cumulative_pct ?? 0),
    cumulativeAmount: Number(row.cumulative_amount ?? 0),
    submittedQty: row.submitted_qty != null ? Number(row.submitted_qty) : null,
    submittedAmount: row.submitted_amount != null ? Number(row.submitted_amount) : null,
    approvedQty: row.approved_qty != null ? Number(row.approved_qty) : null,
    approvedAmount: row.approved_amount != null ? Number(row.approved_amount) : null,
    notes: (row.notes as string | null) ?? null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  }
}

export type MappedBillLine = ReturnType<typeof mapBillLineRow>
