import { type NextRequest, NextResponse } from "next/server"

import {
  requireMasterDataApiContext,
  sanitizeOptionalString,
} from "@/lib/erp/master-data-api"

type ProductFamilyCreateBody = {
  familyCode?: unknown
  familyName?: unknown
}

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  const gate = await requireMasterDataApiContext(req)
  if (!gate.ok) return gate.response
  const { supabase, activeCompanyId } = gate.ctx

  const q = sanitizeOptionalString(req.nextUrl.searchParams.get("q"))
  let query = supabase
    .from("erp_md_product_families")
    .select("id,company_id,family_code,name")
    .eq("company_id", activeCompanyId)
    .order("family_code", { ascending: true })
  if (q) query = query.or(`family_code.ilike.%${q}%,name.ilike.%${q}%`)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({
    data: (data ?? []).map((row) => ({
      id: row.id,
      companyId: row.company_id,
      familyCode: row.family_code,
      familyName: row.name,
    })),
  })
}

export async function POST(req: NextRequest) {
  const gate = await requireMasterDataApiContext(req)
  if (!gate.ok) return gate.response
  const { supabase, activeCompanyId } = gate.ctx

  const body = (await req.json().catch(() => null)) as ProductFamilyCreateBody | null
  const familyCode = sanitizeOptionalString(body?.familyCode)?.toUpperCase()
  const familyName = sanitizeOptionalString(body?.familyName)
  if (!familyCode || !familyName) {
    return NextResponse.json(
      { error: "familyCode and familyName are required" },
      { status: 400 }
    )
  }

  const { data, error } = await supabase
    .from("erp_md_product_families")
    .insert({
      company_id: activeCompanyId,
      family_code: familyCode,
      name: familyName,
    })
    .select("id,company_id,family_code,name")
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json(
    {
      data: {
        id: data.id,
        companyId: data.company_id,
        familyCode: data.family_code,
        familyName: data.name,
      },
    },
    { status: 201 }
  )
}
