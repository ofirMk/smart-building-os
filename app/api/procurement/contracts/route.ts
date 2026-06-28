/**
 * GET /api/procurement/contracts
 *
 * Phase 8.1 — Framework contract lookup for the "Select Contract" field in
 * the PO creation form.
 *
 * Returns ACTIVE (and optionally DRAFT) subcontractor framework contracts for
 * the active company, enriched with:
 *   • supplier name + supplier_number
 *   • balance summary (total_amount, released_amount, remaining_amount)
 *
 * ## Query params
 *   ?supplierId=UUID   — filter by specific supplier (optional)
 *   ?status=ACTIVE     — default; pass "ALL" to include DRAFT/COMPLETED
 *   ?q=text            — free-text search on contract_number or notes
 *
 * ## Balance computation
 *   released_amount = SUM(erp_purchase_orders.total_amount_net) WHERE
 *     contract_id = this contract AND status NOT IN (DRAFT, CANCELLED, REJECTED)
 *
 * The client uses this to display "₪X of ₪Y remaining" in the contract
 * combobox and the balance progress bar in Card B.
 */

import { type NextRequest, NextResponse } from "next/server"

import { requireProcurementApiContext } from "@/lib/erp/procurement-api"
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export type ContractListDto = {
  id: string
  contractNumber: string
  title: string | null
  status: string
  totalAmount: number
  /** Sum of total_amount_net on approved/sent/received POs linked to this contract */
  releasedAmount: number
  remainingAmount: number
  utilizationPct: number
  currency: string | null
  supplierId: string
  supplierName: string
  supplierNumber: string | null
  paymentTerms: string | null
  startDate: string | null
  endDate: string | null
  signedAt: string | null
}

// PO statuses that count toward the released (committed) amount.
const COMMITTED_STATUSES = [
  "PENDING",
  "PENDING_APPROVAL",
  "PENDING_PRICE_APPROVAL",
  "PENDING_CEO_APPROVAL",
  "APPROVED",
  "ISSUED",
  "SENT_TO_SUPPLIER",
  "ON_SHIP",
  "PARTIALLY_RECEIVED",
  "FULLY_RECEIVED",
  "RECEIVED",
  "CLOSED",
]

export async function GET(req: NextRequest) {
  const ctx = await requireProcurementApiContext(req)
  if (!ctx.ok) return ctx.response
  const { activeCompanyId } = ctx

  const { searchParams } = req.nextUrl
  const supplierIdFilter = searchParams.get("supplierId")
  const statusFilter = searchParams.get("status") ?? "ACTIVE"
  const q = searchParams.get("q")?.trim()

  // Use service role to avoid RLS issues on the contracts table
  // (contracts use composite FKs; the user client may fail if RLS is strict).
  const svc = createSupabaseServiceRoleClient()

  // ── 1. Fetch contracts ──────────────────────────────────────────────────
  let query = svc
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
       notes,
       subcontractor_id,
       erp_md_suppliers!subcontractor_id (id, name, supplier_number)`,
    )
    .eq("company_id", activeCompanyId)
    .order("signed_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })

  if (statusFilter !== "ALL") {
    // Default: ACTIVE only (framework contracts in effect)
    query = query.eq("status", statusFilter === "ACTIVE" ? "ACTIVE" : statusFilter)
  }

  if (supplierIdFilter) {
    query = query.eq("subcontractor_id", supplierIdFilter)
  }

  if (q) {
    query = query.or(`contract_number.ilike.%${q}%,notes.ilike.%${q}%`)
  }

  const { data: contracts, error } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (!contracts || contracts.length === 0) {
    return NextResponse.json({ data: [] })
  }

  // ── 2. Fetch released amounts (sum of POs per contract) ────────────────
  const contractIds = contracts.map((c) => c.id as string)

  const { data: releasedRows } = await svc
    .from("erp_purchase_orders")
    .select("contract_id, total_amount_net, status")
    .eq("company_id", activeCompanyId)
    .in("contract_id", contractIds)
    .in("status", COMMITTED_STATUSES)

  // Build a map: contractId → sum of committed net amounts
  const releasedByContract = new Map<string, number>()
  for (const row of releasedRows ?? []) {
    const cid = row.contract_id as string | null
    if (!cid) continue
    const prev = releasedByContract.get(cid) ?? 0
    releasedByContract.set(cid, prev + Number(row.total_amount_net ?? 0))
  }

  // ── 3. Map to DTOs ──────────────────────────────────────────────────────
  type SupplierJoin =
    | { id: string; name: string; supplier_number: string | null }
    | Array<{ id: string; name: string; supplier_number: string | null }>
    | null

  const data: ContractListDto[] = contracts.map((c) => {
    const supplierRaw = c.erp_md_suppliers as SupplierJoin
    const supplier = Array.isArray(supplierRaw) ? supplierRaw[0] : supplierRaw

    const totalAmount = Number(c.total_amount ?? 0)
    const releasedAmount = Math.round((releasedByContract.get(c.id as string) ?? 0) * 100) / 100
    const remainingAmount = Math.max(0, Math.round((totalAmount - releasedAmount) * 100) / 100)
    const utilizationPct =
      totalAmount > 0 ? Math.min(100, Math.round((releasedAmount / totalAmount) * 10000) / 100) : 0

    return {
      id: c.id as string,
      contractNumber: c.contract_number as string,
      title: null, // erp_subcontractor_contracts has no dedicated title column
      status: c.status as string,
      totalAmount,
      releasedAmount,
      remainingAmount,
      utilizationPct,
      currency: "ILS", // contracts are in company currency
      supplierId: (c.subcontractor_id as string) ?? "",
      supplierName: supplier?.name ?? "—",
      supplierNumber: supplier?.supplier_number ?? null,
      paymentTerms: (c.payment_terms as string | null) ?? null,
      startDate: (c.start_date as string | null) ?? null,
      endDate: (c.end_date as string | null) ?? null,
      signedAt: (c.signed_at as string | null) ?? null,
    }
  })

  return NextResponse.json({ data })
}
