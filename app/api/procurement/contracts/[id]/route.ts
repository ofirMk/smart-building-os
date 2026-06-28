/**
 * GET /api/procurement/contracts/[id]
 *
 * Phase 8.1 — Contract detail: header + BoQ lines.
 *
 * Used by the PO form when the user selects a framework contract.
 * Returns the contract header fields needed for auto-fill (supplier,
 * payment terms) plus all BoQ line items so the user can select which
 * lines this Release Order covers.
 *
 * ## Response shape
 *   {
 *     data: {
 *       contract: ContractDetailDto,
 *       lines: ContractBoqLineDto[]
 *     }
 *   }
 */

import { type NextRequest, NextResponse } from "next/server"

import { requireProcurementApiContext } from "@/lib/erp/procurement-api"
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function normalizeParams(
  params: Promise<{ id: string }> | { id: string },
): Promise<{ id: string }> {
  return Promise.resolve(params)
}

export type ContractDetailDto = {
  id: string
  contractNumber: string
  status: string
  totalAmount: number
  releasedAmount: number
  remainingAmount: number
  utilizationPct: number
  supplierId: string
  supplierName: string
  supplierNumber: string | null
  paymentTerms: string | null
  startDate: string | null
  endDate: string | null
  signedAt: string | null
}

export type ContractBoqLineDto = {
  id: string
  lineNo: number
  sectionCode: string
  description: string
  uom: string
  quantity: number
  unitPrice: number
  /** Net locked price after discount: unit_price - discount_amount / quantity */
  effectiveUnitPrice: number
  totalLinePrice: number
  notes: string | null
  /** Linked item_id (if added via Phase 2 migration column) */
  itemId: string | null
}

const COMMITTED_STATUSES = [
  "PENDING", "PENDING_APPROVAL", "PENDING_PRICE_APPROVAL", "PENDING_CEO_APPROVAL",
  "APPROVED", "ISSUED", "SENT_TO_SUPPLIER", "ON_SHIP",
  "PARTIALLY_RECEIVED", "FULLY_RECEIVED", "RECEIVED", "CLOSED",
]

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } },
) {
  const { id: contractId } = await normalizeParams(params)

  const ctx = await requireProcurementApiContext(req)
  if (!ctx.ok) return ctx.response
  const { activeCompanyId } = ctx

  const svc = createSupabaseServiceRoleClient()

  // ── 1. Fetch contract header ─────────────────────────────────────────────
  const { data: contract, error: contractErr } = await svc
    .from("erp_subcontractor_contracts")
    .select(
      `id,
       contract_number,
       status,
       total_amount,
       payment_terms,
       start_date,
       end_date,
       signed_at,
       subcontractor_id,
       erp_md_suppliers!subcontractor_id (id, name, supplier_number)`,
    )
    .eq("id", contractId)
    .eq("company_id", activeCompanyId)
    .maybeSingle()

  if (contractErr) {
    return NextResponse.json({ error: contractErr.message }, { status: 500 })
  }
  if (!contract) {
    return NextResponse.json({ error: "חוזה לא נמצא" }, { status: 404 })
  }

  // ── 2. Fetch BoQ lines ───────────────────────────────────────────────────
  const { data: boqRows, error: boqErr } = await svc
    .from("erp_contract_boq_lines")
    .select(
      "id,line_no,section_code,description,uom,quantity,unit_price,discount_amount,total_line_price,notes",
    )
    .eq("contract_id", contractId)
    .eq("company_id", activeCompanyId)
    .order("line_no", { ascending: true })

  if (boqErr) {
    return NextResponse.json({ error: boqErr.message }, { status: 500 })
  }

  // ── 3. Compute balance ───────────────────────────────────────────────────
  const { data: poRows } = await svc
    .from("erp_purchase_orders")
    .select("total_amount_net, status")
    .eq("company_id", activeCompanyId)
    .eq("contract_id", contractId)
    .in("status", COMMITTED_STATUSES)

  const releasedAmount = Math.round(
    (poRows ?? []).reduce((sum, r) => sum + Number(r.total_amount_net ?? 0), 0) * 100,
  ) / 100

  const totalAmount = Number(contract.total_amount ?? 0)
  const remainingAmount = Math.max(0, Math.round((totalAmount - releasedAmount) * 100) / 100)
  const utilizationPct =
    totalAmount > 0 ? Math.min(100, Math.round((releasedAmount / totalAmount) * 10000) / 100) : 0

  // ── 4. Map supplier ──────────────────────────────────────────────────────
  type SupplierJoin =
    | { id: string; name: string; supplier_number: string | null }
    | Array<{ id: string; name: string; supplier_number: string | null }>
    | null
  const supplierRaw = contract.erp_md_suppliers as SupplierJoin
  const supplier = Array.isArray(supplierRaw) ? supplierRaw[0] : supplierRaw

  // ── 5. Build response ────────────────────────────────────────────────────
  const contractDto: ContractDetailDto = {
    id: contract.id as string,
    contractNumber: contract.contract_number as string,
    status: contract.status as string,
    totalAmount,
    releasedAmount,
    remainingAmount,
    utilizationPct,
    supplierId: contract.subcontractor_id as string,
    supplierName: supplier?.name ?? "—",
    supplierNumber: supplier?.supplier_number ?? null,
    paymentTerms: (contract.payment_terms as string | null) ?? null,
    startDate: (contract.start_date as string | null) ?? null,
    endDate: (contract.end_date as string | null) ?? null,
    signedAt: (contract.signed_at as string | null) ?? null,
  }

  const lines: ContractBoqLineDto[] = (boqRows ?? []).map((row) => {
    const qty = Number(row.quantity ?? 0)
    const unitPrice = Number(row.unit_price ?? 0)
    const discountAmount = Number(row.discount_amount ?? 0)
    // Effective price per unit after discount: (total_line_price / qty) when qty > 0
    const effectiveUnitPrice =
      qty > 0
        ? Math.round(((unitPrice * qty - discountAmount) / qty) * 100) / 100
        : unitPrice

    return {
      id: row.id as string,
      lineNo: Number(row.line_no ?? 0),
      sectionCode: row.section_code as string,
      description: row.description as string,
      uom: row.uom as string,
      quantity: qty,
      unitPrice,
      effectiveUnitPrice,
      totalLinePrice: Number(row.total_line_price ?? 0),
      notes: (row.notes as string | null) ?? null,
      itemId: (row as Record<string, unknown>).item_id as string | null ?? null,
    }
  })

  return NextResponse.json({ data: { contract: contractDto, lines } })
}
