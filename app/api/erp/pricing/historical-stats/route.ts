import { type NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import { requireMasterDataApiContext } from "@/lib/erp/master-data-api"

const requestSchema = z.object({
  itemId: z.string().uuid(),
})

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(req: NextRequest) {
  const gate = await requireMasterDataApiContext(req)
  if (!gate.ok) return gate.response
  const { supabase, activeCompanyId } = gate.ctx

  const body = await req.json().catch(() => null)
  const parsed = requestSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid payload" },
      { status: 400 }
    )
  }

  const stats = await supabase.rpc("erp_get_historical_price_stats", {
    p_item_id: parsed.data.itemId,
    p_company_id: activeCompanyId,
  })
  if (stats.error) {
    return NextResponse.json({ error: stats.error.message }, { status: 400 })
  }

  const row = ((stats.data ?? [])[0] ?? {}) as {
    avg_price?: number | null
    min_price?: number | null
    max_price?: number | null
    last_paid_price?: number | null
    sample_count?: number | null
  }

  return NextResponse.json({
    data: {
      avgPrice: Number(row.avg_price ?? 0),
      minPrice: Number(row.min_price ?? 0),
      maxPrice: Number(row.max_price ?? 0),
      lastPaidPrice: Number(row.last_paid_price ?? 0),
      sampleCount: Number(row.sample_count ?? 0),
    },
  })
}
