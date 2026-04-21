import { type NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import {
  normalizeRouteParams,
  requireClientContractsApiContext,
} from "@/lib/erp/client-contracts-api"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const syncExecutionSchema = z.object({
  lastApprovedProgress: z
    .array(
      z.object({
        id: z.string().uuid(),
        qty: z.coerce.number().min(0),
        pct: z.coerce.number().min(0).max(100),
        amount: z.coerce.number().min(0).optional(),
      })
    )
    .default([]),
})

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  const { id: clientContractId } = await normalizeRouteParams(params)
  const ctx = await requireClientContractsApiContext(req)
  if (!ctx.ok) return ctx.response
  const { supabase, activeCompanyId } = ctx

  const body = await req.json().catch(() => null)
  const parsed = syncExecutionSchema.safeParse(body ?? {})
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid payload" },
      { status: 400 }
    )
  }

  const contractRes = await supabase
    .from("erp_client_contracts")
    .select("id")
    .eq("company_id", activeCompanyId)
    .eq("id", clientContractId)
    .maybeSingle()
  if (contractRes.error) {
    return NextResponse.json({ error: contractRes.error.message }, { status: 500 })
  }
  if (!contractRes.data) {
    return NextResponse.json(
      { error: "Client contract not found for active company" },
      { status: 404 }
    )
  }

  if (parsed.data.lastApprovedProgress.length === 0) {
    return NextResponse.json({ data: { success: true, updatedRows: 0 } })
  }

  const lineIds = parsed.data.lastApprovedProgress.map((line) => line.id)
  const linesRes = await supabase
    .from("erp_client_contract_lines")
    .select("id")
    .eq("company_id", activeCompanyId)
    .eq("client_contract_id", clientContractId)
    .in("id", lineIds)
  if (linesRes.error) {
    return NextResponse.json({ error: linesRes.error.message }, { status: 500 })
  }

  const existingLines = (linesRes.data ?? []) as Array<{ id?: string | null }>
  const foundIds = new Set(existingLines.map((row) => String(row.id ?? "")))
  const missingIds = lineIds.filter((id) => !foundIds.has(id))
  if (missingIds.length > 0) {
    return NextResponse.json(
      {
        error: "Some contract lines do not belong to this contract/company",
        data: { missingIds },
      },
      { status: 409 }
    )
  }

  const upsertPayload = parsed.data.lastApprovedProgress.map((line) => ({
    id: line.id,
    company_id: activeCompanyId,
    client_contract_id: clientContractId,
    last_approved_qty: line.qty,
    last_approved_pct: line.pct,
    last_approved_amount: line.amount ?? 0,
  }))
  const upserted = await supabase
    .from("erp_client_contract_lines")
    .upsert(upsertPayload, {
      onConflict: "id",
      ignoreDuplicates: false,
    })
  if (upserted.error) {
    return NextResponse.json({ error: upserted.error.message }, { status: 500 })
  }

  return NextResponse.json({
    data: {
      success: true,
      updatedRows: parsed.data.lastApprovedProgress.length,
    },
  })
}
