import { type NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import { requireProcurementApiContext } from "@/lib/erp/procurement-api"

const bulkLinkSchema = z.object({
  projectId: z.string().uuid(),
  subcontractorId: z.string().uuid(),
  subcontractorBillId: z.string().uuid().nullable().optional(),
})

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(req: NextRequest) {
  const ctx = await requireProcurementApiContext(req)
  if (!ctx.ok) return ctx.response
  const { supabase, activeCompanyId } = ctx

  const body = await req.json().catch(() => null)
  const parsed = bulkLinkSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid payload" },
      { status: 400 }
    )
  }

  const poRows = await supabase
    .from("erp_purchase_orders")
    .select("id")
    .eq("company_id", activeCompanyId)
    .eq("project_id", parsed.data.projectId)
    .neq("status", "CANCELLED")
  if (poRows.error) {
    return NextResponse.json({ error: poRows.error.message }, { status: 500 })
  }

  const poIds = (poRows.data ?? []).map((row: { id: string }) => row.id)
  if (poIds.length === 0) {
    return NextResponse.json({ data: { linkedCount: 0 } })
  }

  const updateRows = await supabase
    .from("erp_purchase_order_lines")
    .update({
      is_offset: true,
      linked_subcontractor_bill_id: parsed.data.subcontractorBillId ?? null,
    })
    .eq("company_id", activeCompanyId)
    .eq("project_id", parsed.data.projectId)
    .eq("subcontractor_id", parsed.data.subcontractorId)
    .eq("is_offset", false)
    .in("purchase_order_id", poIds)
    .select("id")
  if (updateRows.error) {
    return NextResponse.json({ error: updateRows.error.message }, { status: 500 })
  }

  return NextResponse.json({
    data: {
      linkedCount: (updateRows.data ?? []).length,
    },
  })
}
