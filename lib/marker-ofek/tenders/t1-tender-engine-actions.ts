"use server"

/**
 * Sprint T1 — Tender Engine Server Actions (MedaTech §7).
 *
 * Three actions wrapping the §7 RPCs:
 *   • markWinningQuoteAction      — §7.3.5
 *   • openRfqsFromBoqAction       — §7.3.2 G1
 *   • cloneRfqToSupplierAction    — §7.3.2 G2
 *
 * All actions use the authenticated server client so RLS + the per-RPC
 * `user_has_company_access()` guards apply. Each action revalidates the
 * tenders / pre-construction paths so dependent UIs refresh.
 */

import { revalidatePath } from "next/cache"

import { createSupabaseServerAuthClient } from "@/lib/supabase/server-auth"

export type RfqContractType =
  | "NEW_CONTRACT"
  | "FRAME_PO"
  | "PRICE_LIST"
  | "AD_HOC"

const VALID_CONTRACT_TYPES: ReadonlySet<RfqContractType> = new Set<RfqContractType>(
  ["NEW_CONTRACT", "FRAME_PO", "PRICE_LIST", "AD_HOC"],
)

function revalidateTenderPaths() {
  revalidatePath("/marker-ofek/tenders")
  revalidatePath("/marker-ofek/pre-construction/tender-pricing")
  revalidatePath("/marker-ofek/pre-construction/tender-intake")
}

// ---------------------------------------------------------------------------
// 1. Mark winning quote (§7.3.5)
// ---------------------------------------------------------------------------

export type MarkWinningQuoteResult =
  | {
      ok: true
      quoteId: string
      subTender: string
      projectId: string
      linesWon: number
      othersDemoted: number
    }
  | { ok: false; error: string }

export async function markWinningQuoteAction(input: {
  quoteId: string
}): Promise<MarkWinningQuoteResult> {
  try {
    if (!input.quoteId) return { ok: false, error: "quoteId is required" }
    const supabase = await createSupabaseServerAuthClient()
    const { data, error } = await supabase.rpc("erp_mark_winning_quote", {
      p_quote_id: input.quoteId,
    })
    if (error) return { ok: false, error: error.message ?? "RPC failed" }
    const row = data as {
      quote_id: string
      sub_tender: string
      project_id: string
      lines_won: number
      others_demoted: number
    } | null
    if (!row) return { ok: false, error: "RPC returned no payload" }
    revalidateTenderPaths()
    return {
      ok: true,
      quoteId: row.quote_id,
      subTender: row.sub_tender,
      projectId: row.project_id,
      linesWon: Number(row.lines_won ?? 0),
      othersDemoted: Number(row.others_demoted ?? 0),
    }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Unknown error",
    }
  }
}

// ---------------------------------------------------------------------------
// 2. Open RFQs from BOQ (§7.3.2 G1)
// ---------------------------------------------------------------------------

export type OpenRfqsFromBoqResult =
  | {
      ok: true
      rfqsCreated: number
      linesCreated: number
      rfqIds: string[]
      cap: number
    }
  | { ok: false; error: string }

export async function openRfqsFromBoqAction(input: {
  projectId: string
  planningVersionId: string
  subTenderCode: string
  contractType: RfqContractType
  supplierIds: string[]
  boqLineIds: string[]
}): Promise<OpenRfqsFromBoqResult> {
  try {
    if (!input.projectId) return { ok: false, error: "projectId is required" }
    if (!input.planningVersionId) {
      return { ok: false, error: "planningVersionId is required" }
    }
    if (!input.subTenderCode || !input.subTenderCode.trim()) {
      return { ok: false, error: "subTenderCode is required" }
    }
    if (!VALID_CONTRACT_TYPES.has(input.contractType)) {
      return {
        ok: false,
        error: `contractType must be one of: ${Array.from(VALID_CONTRACT_TYPES).join(", ")}`,
      }
    }
    if (!Array.isArray(input.supplierIds) || input.supplierIds.length === 0) {
      return { ok: false, error: "supplierIds must be a non-empty array" }
    }
    if (!Array.isArray(input.boqLineIds) || input.boqLineIds.length === 0) {
      return { ok: false, error: "boqLineIds must be a non-empty array" }
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

    const { data, error } = await supabase.rpc("erp_open_rfqs_from_boq", {
      p_company_id: companyId,
      p_project_id: input.projectId,
      p_version_id: input.planningVersionId,
      p_sub_tender_code: input.subTenderCode.trim(),
      p_contract_type: input.contractType,
      p_supplier_ids: input.supplierIds,
      p_boq_line_ids: input.boqLineIds,
    })
    if (error) return { ok: false, error: error.message ?? "RPC failed" }
    const row = data as {
      rfqs_created: number
      lines_created: number
      rfq_ids: string[]
      cap: number
    } | null
    if (!row) return { ok: false, error: "RPC returned no payload" }
    revalidateTenderPaths()
    return {
      ok: true,
      rfqsCreated: Number(row.rfqs_created ?? 0),
      linesCreated: Number(row.lines_created ?? 0),
      rfqIds: Array.isArray(row.rfq_ids) ? row.rfq_ids : [],
      cap: Number(row.cap ?? 5),
    }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Unknown error",
    }
  }
}

// ---------------------------------------------------------------------------
// 4. Award winning quote to a contract object (§7.3.5 + §2.1.2) — Sprint T3
// ---------------------------------------------------------------------------

export type AwardQuoteKind =
  | "subcontractor_contract"
  | "blanket_purchase_order"
  | "vendor_price_list"
  | "ad_hoc"

export type AwardQuoteToContractResult =
  | {
      ok: true
      created: boolean
      kind: AwardQuoteKind
      targetId: string | null
      targetNumber: string | null
      linesCreated: number
      contractType: RfqContractType | null
      totalAmount: number
      reason: string | null
    }
  | { ok: false; error: string }

export async function awardQuoteToContractAction(input: {
  quoteId: string
}): Promise<AwardQuoteToContractResult> {
  try {
    if (!input.quoteId) return { ok: false, error: "quoteId is required" }
    const supabase = await createSupabaseServerAuthClient()
    const { data, error } = await supabase.rpc("erp_award_quote_to_contract", {
      p_quote_id: input.quoteId,
    })
    if (error) return { ok: false, error: error.message ?? "RPC failed" }
    const row = data as {
      created: boolean
      kind: AwardQuoteKind
      target_id?: string | null
      target_number?: string | null
      lines_created?: number
      contract_type?: RfqContractType
      total_amount?: number
      reason?: string
    } | null
    if (!row) return { ok: false, error: "RPC returned no payload" }
    revalidateTenderPaths()
    revalidatePath("/marker-ofek/contracts")
    revalidatePath("/marker-ofek/contracts-engine")
    revalidatePath("/marker-ofek/finance/contracts")
    revalidatePath("/marker-ofek/procurement/blanket-purchase-orders")
    revalidatePath("/marker-ofek/procurement/price-lists")
    return {
      ok: true,
      created: Boolean(row.created),
      kind: row.kind,
      targetId: row.target_id ?? null,
      targetNumber: row.target_number ?? null,
      linesCreated: Number(row.lines_created ?? 0),
      contractType: row.contract_type ?? null,
      totalAmount: Number(row.total_amount ?? 0),
      reason: row.reason ?? null,
    }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Unknown error",
    }
  }
}

// ---------------------------------------------------------------------------
// 3. Clone RFQ to supplier (§7.3.2 G2)
// ---------------------------------------------------------------------------

export type CloneRfqToSupplierResult =
  | {
      ok: true
      created: boolean
      rfqId: string
      rfqNumber: string | null
      linesCopied: number
      reason: string | null
    }
  | { ok: false; error: string }

export async function cloneRfqToSupplierAction(input: {
  rfqId: string
  targetSupplierId: string
}): Promise<CloneRfqToSupplierResult> {
  try {
    if (!input.rfqId) return { ok: false, error: "rfqId is required" }
    if (!input.targetSupplierId) {
      return { ok: false, error: "targetSupplierId is required" }
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

    const { data, error } = await supabase.rpc("erp_clone_rfq_to_supplier", {
      p_company_id: companyId,
      p_rfq_id: input.rfqId,
      p_target_supplier_id: input.targetSupplierId,
    })
    if (error) return { ok: false, error: error.message ?? "RPC failed" }
    const row = data as {
      created: boolean
      rfq_id: string
      rfq_number?: string
      lines_copied?: number
      reason?: string
    } | null
    if (!row) return { ok: false, error: "RPC returned no payload" }
    revalidateTenderPaths()
    return {
      ok: true,
      created: Boolean(row.created),
      rfqId: row.rfq_id,
      rfqNumber: row.rfq_number ?? null,
      linesCopied: Number(row.lines_copied ?? 0),
      reason: row.reason ?? null,
    }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Unknown error",
    }
  }
}
