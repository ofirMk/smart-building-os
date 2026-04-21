import { type NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import { requireProcurementApiContext } from "@/lib/erp/procurement-api"

const guardRequestSchema = z.object({
  projectId: z.string().uuid(),
  subcontractorId: z.string().uuid(),
})

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(req: NextRequest) {
  const ctx = await requireProcurementApiContext(req)
  if (!ctx.ok) return ctx.response
  const { supabase, activeCompanyId } = ctx

  const body = await req.json().catch(() => null)
  const parsed = guardRequestSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid payload" },
      { status: 400 }
    )
  }

  const poRows = await supabase
    .from("erp_purchase_orders")
    .select("id, po_number, status")
    .eq("company_id", activeCompanyId)
    .eq("project_id", parsed.data.projectId)
    .neq("status", "CANCELLED")
  if (poRows.error) {
    return NextResponse.json({ error: poRows.error.message }, { status: 500 })
  }
  const poById = new Map<string, { po_number: string; status: string }>()
  for (const row of poRows.data ?? []) {
    poById.set(row.id as string, {
      po_number: String((row as { po_number?: string }).po_number ?? ""),
      status: String((row as { status?: string }).status ?? ""),
    })
  }
  const poIds = [...poById.keys()]
  if (poIds.length === 0) {
    return NextResponse.json({
      data: {
        hasBlockingOffsets: false,
        unoffsetPoNumbers: [],
        unoffsetLineIds: [],
        exposureAmount: 0,
      },
    })
  }

  const lineRows = await supabase
    .from("erp_purchase_order_lines")
    .select("id, purchase_order_id, total_price, is_offset")
    .eq("company_id", activeCompanyId)
    .eq("project_id", parsed.data.projectId)
    .eq("subcontractor_id", parsed.data.subcontractorId)
    .in("purchase_order_id", poIds)
    .eq("is_offset", false)
  if (lineRows.error) {
    return NextResponse.json({ error: lineRows.error.message }, { status: 500 })
  }

  const unoffsetPoNumbers = Array.from(
    new Set(
      (lineRows.data ?? [])
        .map((line: { purchase_order_id?: string }) =>
          poById.get(String(line.purchase_order_id ?? ""))?.po_number ?? null
        )
        .filter((num: string | null): num is string => Boolean(num))
    )
  )
  const unoffsetLineIds = (lineRows.data ?? []).map((line: { id?: string }) => String(line.id ?? ""))
  const exposureAmount = (lineRows.data ?? []).reduce(
    (sum: number, line: { total_price?: number }) => sum + Number(line.total_price ?? 0),
    0
  )

  const payload = {
    hasBlockingOffsets: unoffsetLineIds.length > 0,
    unoffsetPoNumbers,
    unoffsetLineIds,
    exposureAmount: Math.round(exposureAmount * 100) / 100,
  }

  return NextResponse.json({ data: payload })
}
