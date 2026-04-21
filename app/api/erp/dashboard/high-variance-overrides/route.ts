import { type NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import { requireMasterDataApiContext } from "@/lib/erp/master-data-api"
import { loadHighVarianceOverrides } from "@/lib/erp/high-variance-overrides-logic"

const querySchema = z.object({
  days: z.coerce.number().int().min(1).max(365).default(30),
})

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  const gate = await requireMasterDataApiContext(req)
  if (!gate.ok) return gate.response
  const { supabase, activeCompanyId } = gate.ctx

  const url = new URL(req.url)
  const parsed = querySchema.safeParse({ days: url.searchParams.get("days") ?? undefined })
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid query" },
      { status: 400 }
    )
  }

  try {
    const rows = await loadHighVarianceOverrides({
      supabase,
      companyId: activeCompanyId,
      sinceDays: parsed.data.days,
    })
    return NextResponse.json({ data: rows })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "load failed" },
      { status: 500 }
    )
  }
}
