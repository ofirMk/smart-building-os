import { type NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import {
  mapProgressBillRow,
  normalizeRouteParams,
  requireClientContractsApiContext,
} from "@/lib/erp/client-contracts-api"

const updateBillSchema = z.object({
  status: z.enum(["DRAFT", "SUBMITTED", "PARTIALLY_APPROVED", "APPROVED"]).optional(),
  periodStart: z.string().trim().nullable().optional(),
  periodEnd: z.string().trim().nullable().optional(),
})

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(
  req: NextRequest,
  {
    params,
  }: { params: Promise<{ id: string; billId: string }> | { id: string; billId: string } }
) {
  const { id: clientContractId, billId } = await normalizeRouteParams(params)
  const ctx = await requireClientContractsApiContext(req)
  if (!ctx.ok) return ctx.response
  const { supabase, activeCompanyId } = ctx

  const loaded = await supabase
    .from("erp_client_progress_bills")
    .select("*")
    .eq("company_id", activeCompanyId)
    .eq("client_contract_id", clientContractId)
    .eq("id", billId)
    .maybeSingle()
  if (loaded.error) return NextResponse.json({ error: loaded.error.message }, { status: 500 })
  if (!loaded.data) return NextResponse.json({ error: "Progress bill not found" }, { status: 404 })
  return NextResponse.json({ data: mapProgressBillRow(loaded.data) })
}

export async function PUT(
  req: NextRequest,
  {
    params,
  }: { params: Promise<{ id: string; billId: string }> | { id: string; billId: string } }
) {
  const { id: clientContractId, billId } = await normalizeRouteParams(params)
  const ctx = await requireClientContractsApiContext(req)
  if (!ctx.ok) return ctx.response
  const { supabase, activeCompanyId } = ctx

  const body = await req.json().catch(() => null)
  const parsed = updateBillSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid payload" }, { status: 400 })

  const currentBill = await supabase
    .from("erp_client_progress_bills")
    .select("id,status,submitted_at,approved_at")
    .eq("company_id", activeCompanyId)
    .eq("client_contract_id", clientContractId)
    .eq("id", billId)
    .maybeSingle()
  if (currentBill.error) return NextResponse.json({ error: currentBill.error.message }, { status: 500 })
  if (!currentBill.data) return NextResponse.json({ error: "Progress bill not found" }, { status: 404 })

  const patch: Record<string, string | null> = {}
  if (parsed.data.status !== undefined) {
    patch.status = parsed.data.status
    const nextStatus = parsed.data.status
    const nowIso = new Date().toISOString()
    if (
      (nextStatus === "SUBMITTED" || nextStatus === "PARTIALLY_APPROVED" || nextStatus === "APPROVED") &&
      !currentBill.data.submitted_at
    ) {
      patch.submitted_at = nowIso
    }
    if (nextStatus === "APPROVED" && !currentBill.data.approved_at) {
      patch.approved_at = nowIso
    }
  }
  if (parsed.data.periodStart !== undefined) patch.period_start = parsed.data.periodStart
  if (parsed.data.periodEnd !== undefined) patch.period_end = parsed.data.periodEnd
  if (Object.keys(patch).length === 0) return NextResponse.json({ error: "No fields supplied" }, { status: 400 })

  const updated = await supabase
    .from("erp_client_progress_bills")
    .update(patch)
    .eq("company_id", activeCompanyId)
    .eq("client_contract_id", clientContractId)
    .eq("id", billId)
    .select("*")
    .maybeSingle()
  if (updated.error) return NextResponse.json({ error: updated.error.message }, { status: 400 })
  if (!updated.data) return NextResponse.json({ error: "Progress bill not found" }, { status: 404 })
  return NextResponse.json({ data: mapProgressBillRow(updated.data) })
}

