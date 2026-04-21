import { type NextRequest, NextResponse } from "next/server"

import {
  requireMasterDataApiContext,
  sanitizeOptionalString,
} from "@/lib/erp/master-data-api"

type ProductFamilyUpdateBody = {
  familyCode?: unknown
  familyName?: unknown
}

function normalizeParams(
  params: Promise<{ id: string }> | { id: string }
): Promise<{ id: string }> {
  return Promise.resolve(params)
}

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  const { id } = await normalizeParams(params)
  const gate = await requireMasterDataApiContext(req)
  if (!gate.ok) return gate.response
  const { supabase, activeCompanyId } = gate.ctx

  const { data, error } = await supabase
    .from("erp_md_product_families")
    .select("id,company_id,family_code,name")
    .eq("id", id)
    .eq("company_id", activeCompanyId)
    .maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: "Product family not found" }, { status: 404 })

  return NextResponse.json({
    data: {
      id: data.id,
      companyId: data.company_id,
      familyCode: data.family_code,
      familyName: data.name,
    },
  })
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  const { id } = await normalizeParams(params)
  const gate = await requireMasterDataApiContext(req)
  if (!gate.ok) return gate.response
  const { supabase, activeCompanyId } = gate.ctx

  const body = (await req.json().catch(() => null)) as ProductFamilyUpdateBody | null
  const patch: Record<string, string> = {}
  const familyCode = sanitizeOptionalString(body?.familyCode)?.toUpperCase()
  const familyName = sanitizeOptionalString(body?.familyName)
  if (familyCode) patch.family_code = familyCode
  if (familyName) patch.name = familyName
  if (Object.keys(patch).length === 0) {
    return NextResponse.json(
      { error: "No valid fields supplied for update" },
      { status: 400 }
    )
  }

  const { error } = await supabase
    .from("erp_md_product_families")
    .update(patch)
    .eq("id", id)
    .eq("company_id", activeCompanyId)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  return GET(req, { params: Promise.resolve({ id }) })
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  const { id } = await normalizeParams(params)
  const gate = await requireMasterDataApiContext(req)
  if (!gate.ok) return gate.response
  const { supabase, activeCompanyId } = gate.ctx

  const { error } = await supabase
    .from("erp_md_product_families")
    .delete()
    .eq("id", id)
    .eq("company_id", activeCompanyId)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  return NextResponse.json({ ok: true })
}
