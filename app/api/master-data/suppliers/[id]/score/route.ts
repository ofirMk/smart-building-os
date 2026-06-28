/**
 * GET /api/master-data/suppliers/[id]/score
 *
 * Phase 7.1 — Vendor Scorecard API.
 *
 * ## Behaviour
 *   1. Fetches (or recomputes) the vendor scorecard for the given supplier.
 *   2. Returns fresh metrics computed from historical GR + PO data.
 *   3. Caches the result in `erp_md_supplier_scores` (upsert on each call).
 *
 * ## Query params
 *   ?refresh=true  — force recompute even if a cached score exists.
 *   ?months=N      — rolling window in months (default 12, max 60).
 *
 * ## Response
 *   200 — { ok: true, data: SupplierScore }
 *   404 — supplier not found or doesn't belong to active company
 *   500 — unexpected error
 */

import { type NextRequest, NextResponse } from "next/server"

import { apiErrorResponse } from "@/lib/api/api-error"
import { requireMasterDataApiContext } from "@/lib/erp/master-data-api"
import {
  computeAndCacheScore,
  readCachedScore,
  type SupplierScore,
} from "@/lib/procurement/vendor-scoring"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function normalizeParams(
  params: Promise<{ id: string }> | { id: string },
): Promise<{ id: string }> {
  return Promise.resolve(params)
}

export type SupplierScoreResponse = {
  ok: true
  data: SupplierScore
  /** true when the score was freshly computed, false when served from cache */
  computed: boolean
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } },
) {
  const { id: supplierId } = await normalizeParams(params)

  const ctx = await requireMasterDataApiContext(req)
  if (!ctx.ok) return ctx.response
  const { ctx: apiCtx } = ctx
  const { supabase, activeCompanyId } = apiCtx

  // Validate supplier belongs to this company (RLS client).
  const { data: supplier, error: supplierErr } = await supabase
    .from("erp_md_suppliers")
    .select("id, qualification_status")
    .eq("id", supplierId)
    .eq("company_id", activeCompanyId)
    .maybeSingle()

  if (supplierErr) {
    return apiErrorResponse(500, "SUPPLIER_QUERY_FAILED", supplierErr.message)
  }

  if (!supplier) {
    return apiErrorResponse(404, "SUPPLIER_NOT_FOUND", `ספק ${supplierId} לא נמצא`)
  }

  // Parse query params.
  const forceRefresh = req.nextUrl.searchParams.get("refresh") === "true"
  const monthsParam = parseInt(req.nextUrl.searchParams.get("months") ?? "12", 10)
  const periodMonths = Math.min(60, Math.max(1, Number.isFinite(monthsParam) ? monthsParam : 12))

  // Try cache first unless refresh is requested.
  if (!forceRefresh) {
    const cached = await readCachedScore({
      supplierId,
      companyId: activeCompanyId,
    })

    if (cached) {
      const response: SupplierScoreResponse = { ok: true, data: cached, computed: false }
      return NextResponse.json(response)
    }
  }

  // Compute (and cache) fresh score.
  const result = await computeAndCacheScore({
    supplierId,
    companyId: activeCompanyId,
    periodMonths,
  })

  if (!result.ok) {
    return apiErrorResponse(500, "SCORE_COMPUTATION_FAILED", result.error)
  }

  const response: SupplierScoreResponse = { ok: true, data: result.score, computed: true }
  return NextResponse.json(response)
}
