import { type NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import {
  assertMobileProjectAccess,
  requireMobileFieldApiContext,
} from "@/lib/erp/mobile-field-api"

const createExceptionSchema = z.object({
  projectId: z.string().uuid(),
  title: z.string().trim().min(2),
  details: z.string().trim().min(3),
  parentContractId: z.string().uuid().optional().nullable(),
  photoLabel: z.string().trim().optional().nullable(),
})

function buildFieldChangeOrderNumber(): string {
  const now = new Date()
  const y = now.getUTCFullYear()
  const m = String(now.getUTCMonth() + 1).padStart(2, "0")
  const d = String(now.getUTCDate()).padStart(2, "0")
  const hh = String(now.getUTCHours()).padStart(2, "0")
  const mm = String(now.getUTCMinutes()).padStart(2, "0")
  const ss = String(now.getUTCSeconds()).padStart(2, "0")
  return `FIELD-${y}${m}${d}-${hh}${mm}${ss}`
}

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(req: NextRequest) {
  const ctx = await requireMobileFieldApiContext(req)
  if (!ctx.ok) return ctx.response
  const { supabase, activeCompanyId, userId, siteManagerOnly } = ctx

  const body = await req.json().catch(() => null)
  const parsed = createExceptionSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid payload" },
      { status: 400 }
    )
  }

  const access = await assertMobileProjectAccess({
    supabase,
    activeCompanyId,
    projectId: parsed.data.projectId,
    userId,
    siteManagerOnly,
  })
  if (!access.ok) return access.response

  let parentContractId = parsed.data.parentContractId ?? null
  if (parentContractId) {
    const verify = await supabase
      .from("erp_client_contracts")
      .select("id")
      .eq("company_id", activeCompanyId)
      .eq("project_id", parsed.data.projectId)
      .eq("id", parentContractId)
      .maybeSingle()
    if (verify.error) {
      return NextResponse.json({ error: verify.error.message }, { status: 500 })
    }
    if (!verify.data) {
      return NextResponse.json(
        { error: "Parent contract does not belong to selected project" },
        { status: 400 }
      )
    }
  } else {
    const latestContract = await supabase
      .from("erp_client_contracts")
      .select("id")
      .eq("company_id", activeCompanyId)
      .eq("project_id", parsed.data.projectId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
    if (latestContract.error) {
      return NextResponse.json({ error: latestContract.error.message }, { status: 500 })
    }
    if (!latestContract.data) {
      return NextResponse.json(
        { error: "No parent contract found for this project" },
        { status: 409 }
      )
    }
    parentContractId = String(latestContract.data.id)
  }

  const noteLines = [
    `Field Exception: ${parsed.data.title}`,
    parsed.data.details,
    parsed.data.photoLabel ? `Photo: ${parsed.data.photoLabel}` : null,
    `Reported by: ${userId}`,
  ].filter(Boolean)

  const inserted = await supabase
    .from("erp_change_orders")
    .insert({
      company_id: activeCompanyId,
      client_contract_id: parentContractId,
      change_order_number: buildFieldChangeOrderNumber(),
      change_type: "NEW_LINE",
      status: "DRAFT",
      new_line_description: parsed.data.title,
      notes: noteLines.join("\n"),
      is_extra_work: true,
    })
    .select("id, change_order_number, status, client_contract_id")
    .single()
  if (inserted.error) {
    return NextResponse.json({ error: inserted.error.message }, { status: 500 })
  }

  return NextResponse.json({
    data: {
      id: String(inserted.data.id),
      changeOrderNumber: String(inserted.data.change_order_number),
      status: String(inserted.data.status),
      parentContractId: String(inserted.data.client_contract_id),
    },
  })
}
