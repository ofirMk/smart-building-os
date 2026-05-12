/**
 * Sprint W2 — Contracts Engine server-side data access (RSC-safe).
 *
 * Fetches a sample/live waterfall summary and exposes a thin wrapper around
 * the `erp_compute_subcontractor_bill_waterfall` RPC.
 *
 * No mutations here — this module is read-only and safe to import from RSC.
 * Mutations live in `billing-sync-actions.ts` etc.
 */

import "server-only"

import { createSupabaseServerAuthClient } from "@/lib/supabase/server-auth"
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role"

import type {
  AmendmentStatus,
  BillLineForApproval,
  ChangeOrderCategory,
  ChangeOrderKind,
  ChangeOrderRow,
  PricingMethod,
  WaterfallSummary,
} from "./w2-engine-types"

export type EngineSampleContract = {
  contractId: string
  contractNumber: string
  subcontractorName: string | null
  projectName: string | null
  pricingMethod: PricingMethod
  totalAmount: number
  retentionPct: number
  insurancePct: number
  rawMaterialCommissionPct: number
  advancePaymentAmount: number
}

export type EngineSnapshot = {
  /** First active subcontractor contract the user can see (or null). */
  sampleContract: EngineSampleContract | null
  /** Latest waterfall summary for that contract's most recent bill, if any. */
  liveWaterfall: WaterfallSummary | null
  /** Always-on illustrative waterfall — used when no live bill exists. */
  illustrativeWaterfall: WaterfallSummary
  /** The 3 W2 system parameters, resolved per the user's company. */
  systemParameters: {
    changeOrderRequiresApproval: boolean
    rawMaterialOffsetTriggerStage: string
    ownerInvoiceBaseMode: string
  }
}

/**
 * Hardcoded illustrative waterfall for the demo screen — used when the DB has
 * no live bills yet. Numbers chosen to look credible against a ~₪1.2M
 * mid-stage subcontractor on a residential project.
 */
const ILLUSTRATIVE_WATERFALL: WaterfallSummary = {
  bill_id: "00000000-0000-0000-0000-000000000000",
  cumulative_executed: 1_180_000,
  escalation: 23_600,
  retention_this_bill: 50_000,
  insurance_this_bill: 11_800,
  advance_recovery: 70_000,
  raw_material_offset: 38_000,
  raw_material_commission: 1_900,
  previous_billed: 820_000,
  amount_to_pay: 211_900,
  vat: 36_023,
  grand_total: 247_923,
  computed_at: new Date().toISOString(),
  pricing_method: "BOQ",
}

/**
 * Build a snapshot used by the demo workspace screen. Best-effort — any DB
 * failure falls back to the illustrative summary and silently swallows.
 */
export async function loadContractsEngineSnapshot(): Promise<EngineSnapshot> {
  const fallback: EngineSnapshot = {
    sampleContract: null,
    liveWaterfall: null,
    illustrativeWaterfall: ILLUSTRATIVE_WATERFALL,
    systemParameters: {
      changeOrderRequiresApproval: false,
      rawMaterialOffsetTriggerStage: "VENDOR_INVOICE",
      ownerInvoiceBaseMode: "APPROVED",
    },
  }

  try {
    const supabase = await createSupabaseServerAuthClient()

    /** Pick a contract the current user can see. */
    const { data: contractRow } = await supabase
      .from("erp_subcontractor_contracts")
      .select(
        "id, contract_number, total_amount, retention_pct, insurance_pct, raw_material_offset_commission_pct, advance_payment_amount, pricing_method, project_id, subcontractor_id",
      )
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()

    if (!contractRow) return fallback

    const admin = createSupabaseServiceRoleClient()
    const [projectRes, supplierRes, billRes] = await Promise.all([
      admin
        .from("erp_proj_projects")
        .select("id, project_name")
        .eq("id", contractRow.project_id as string)
        .maybeSingle(),
      admin
        .from("erp_md_suppliers")
        .select("id, name")
        .eq("id", contractRow.subcontractor_id as string)
        .maybeSingle(),
      admin
        .from("erp_subcontractor_bills")
        .select(
          "id, cumulative_executed_amount, escalation_amount, retention_deduction_amount, insurance_deduction_amount, advance_recovery_amount, raw_material_offset_amount, raw_material_commission_amount, previous_billed_amount, amount_to_pay, vat_amount, grand_total_amount, waterfall_computed_at",
        )
        .eq("contract_id", contractRow.id as string)
        .order("bill_number", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ])

    /** System parameters lookup — we read raw rows; defaults applied below. */
    const { data: paramRows } = await admin
      .from("erp_system_parameters")
      .select("param_key, param_value")
      .in("param_key", [
        "CONTRACT_CHANGE_ORDER_REQUIRES_APPROVAL",
        "RAW_MATERIAL_OFFSET_TRIGGER_STAGE",
        "CONTRACT_INVOICE_OWNER_BASE_MODE",
      ])

    const paramMap = new Map<string, string>()
    type ParamRow = { param_key: string; param_value: string | null }
    for (const row of (paramRows ?? []) as ParamRow[]) {
      if (row.param_value != null) paramMap.set(row.param_key, row.param_value)
    }

    const sampleContract: EngineSampleContract = {
      contractId: String(contractRow.id),
      contractNumber: String(contractRow.contract_number ?? ""),
      subcontractorName: (supplierRes.data?.name as string | undefined) ?? null,
      projectName:
        (projectRes.data?.project_name as string | undefined) ?? null,
      pricingMethod:
        ((contractRow.pricing_method as PricingMethod | undefined) ?? "BOQ"),
      totalAmount: Number(contractRow.total_amount ?? 0),
      retentionPct: Number(contractRow.retention_pct ?? 0),
      insurancePct: Number(contractRow.insurance_pct ?? 0),
      rawMaterialCommissionPct: Number(
        contractRow.raw_material_offset_commission_pct ?? 0,
      ),
      advancePaymentAmount: Number(contractRow.advance_payment_amount ?? 0),
    }

    const liveWaterfall: WaterfallSummary | null = billRes.data
      ? {
          bill_id: String(billRes.data.id),
          cumulative_executed: Number(
            billRes.data.cumulative_executed_amount ?? 0,
          ),
          escalation: Number(billRes.data.escalation_amount ?? 0),
          retention_this_bill: Number(
            billRes.data.retention_deduction_amount ?? 0,
          ),
          insurance_this_bill: Number(
            billRes.data.insurance_deduction_amount ?? 0,
          ),
          advance_recovery: Number(billRes.data.advance_recovery_amount ?? 0),
          raw_material_offset: Number(
            billRes.data.raw_material_offset_amount ?? 0,
          ),
          raw_material_commission: Number(
            billRes.data.raw_material_commission_amount ?? 0,
          ),
          previous_billed: Number(billRes.data.previous_billed_amount ?? 0),
          amount_to_pay: Number(billRes.data.amount_to_pay ?? 0),
          vat: Number(billRes.data.vat_amount ?? 0),
          grand_total: Number(billRes.data.grand_total_amount ?? 0),
          computed_at:
            (billRes.data.waterfall_computed_at as string | undefined) ??
            new Date().toISOString(),
          pricing_method: sampleContract.pricingMethod,
        }
      : null

    return {
      sampleContract,
      liveWaterfall,
      illustrativeWaterfall: ILLUSTRATIVE_WATERFALL,
      systemParameters: {
        changeOrderRequiresApproval:
          (paramMap.get("CONTRACT_CHANGE_ORDER_REQUIRES_APPROVAL") ??
            "false") === "true",
        rawMaterialOffsetTriggerStage:
          paramMap.get("RAW_MATERIAL_OFFSET_TRIGGER_STAGE") ??
          "VENDOR_INVOICE",
        ownerInvoiceBaseMode:
          paramMap.get("CONTRACT_INVOICE_OWNER_BASE_MODE") ?? "APPROVED",
      },
    }
  } catch {
    return fallback
  }
}

/**
 * Idempotent server-side call to the waterfall RPC. Returns the JSONB summary
 * or null on failure.
 */
export async function recomputeBillWaterfall(
  billId: string,
): Promise<WaterfallSummary | null> {
  try {
    const supabase = await createSupabaseServerAuthClient()
    const { data, error } = await supabase.rpc(
      "erp_compute_subcontractor_bill_waterfall",
      { p_bill_id: billId },
    )
    if (error || !data) return null
    return data as unknown as WaterfallSummary
  } catch {
    return null
  }
}

/**
 * §3.2.1.1 — Load the change-order timeline for a given subcontractor contract.
 * Returns an ordered list of amendments (newest first). Best-effort — DB
 * outage returns an empty list to keep the UI rendering.
 */
export async function loadChangeOrderTimeline(
  contractId: string,
): Promise<ChangeOrderRow[]> {
  try {
    const supabase = await createSupabaseServerAuthClient()
    type AmendmentRow = {
      id: string
      amendment_number: number
      change_order_kind: ChangeOrderKind | null
      status: AmendmentStatus
      description: string
      value_delta: number | null
      category: ChangeOrderCategory | null
      references_boq_line_id: string | null
      qty_delta: number | null
      price_delta: number | null
      requires_approval: boolean | null
      created_at: string
      approved_at: string | null
    }
    const { data, error } = await supabase
      .from("erp_contract_amendments")
      .select(
        "id, amendment_number, change_order_kind, status, description, value_delta, category, references_boq_line_id, qty_delta, price_delta, requires_approval, created_at, approved_at",
      )
      .eq("contract_id", contractId)
      .order("amendment_number", { ascending: false })
    if (error || !data) return []
    return (data as AmendmentRow[]).map((row) => ({
      id: row.id,
      amendmentNumber: row.amendment_number,
      kind: row.change_order_kind,
      status: row.status,
      description: row.description,
      valueDelta: Number(row.value_delta ?? 0),
      category: row.category,
      referencesBoqLineId: row.references_boq_line_id,
      qtyDelta: row.qty_delta == null ? null : Number(row.qty_delta),
      priceDelta: row.price_delta == null ? null : Number(row.price_delta),
      requiresApproval: Boolean(row.requires_approval),
      createdAt: row.created_at,
      approvedAt: row.approved_at,
    }))
  } catch {
    return []
  }
}

/**
 * §3.2.2.1 — Load the bill lines needed by the dual-pane (submitted vs
 * approved) editor. Joins BOQ for line number + description.
 */
export async function loadBillLinesForApproval(
  billId: string,
): Promise<BillLineForApproval[]> {
  try {
    const admin = createSupabaseServiceRoleClient()
    type Row = {
      id: string
      boq_line_id: string
      submitted_qty: number | null
      submitted_amount: number | null
      approved_qty: number | null
      approved_amount: number | null
      cumulative_amount: number | null
      erp_contract_boq_lines: { line_no: number | null; description: string | null } | null
    }
    const { data, error } = await admin
      .from("erp_subcontractor_bill_lines")
      .select(
        "id, boq_line_id, submitted_qty, submitted_amount, approved_qty, approved_amount, cumulative_amount, erp_contract_boq_lines!inner(line_no, description)",
      )
      .eq("bill_id", billId)
    if (error || !data) return []
    return (data as unknown as Row[]).map((row) => ({
      id: row.id,
      boqLineId: row.boq_line_id,
      boqLineNo: row.erp_contract_boq_lines?.line_no ?? null,
      boqDescription: row.erp_contract_boq_lines?.description ?? null,
      submittedQty: row.submitted_qty == null ? null : Number(row.submitted_qty),
      submittedAmount:
        row.submitted_amount == null ? null : Number(row.submitted_amount),
      approvedQty: row.approved_qty == null ? null : Number(row.approved_qty),
      approvedAmount:
        row.approved_amount == null ? null : Number(row.approved_amount),
      cumulativeAmount: Number(row.cumulative_amount ?? 0),
    }))
  } catch {
    return []
  }
}
