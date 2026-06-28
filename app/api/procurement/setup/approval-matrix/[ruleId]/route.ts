/**
 * GET    /api/procurement/setup/approval-matrix/[ruleId]  → fetch one rule
 * PATCH  /api/procurement/setup/approval-matrix/[ruleId]  → update rule
 * DELETE /api/procurement/setup/approval-matrix/[ruleId]  → delete rule
 */

import { type NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import { requireMasterDataApiContext } from "@/lib/erp/master-data-api"

// ─── Validation ────────────────────────────────────────────────────────────────

const conditionSchema = z
  .object({
    amount_min: z.number().min(0).optional(),
    amount_max: z.number().min(0).optional(),
    cost_center_codes: z.array(z.string()).optional(),
    project_ids: z.array(z.string().uuid()).optional(),
    supplier_ids: z.array(z.string()).optional(),
    urgency_levels: z.array(z.string()).optional(),
    po_type_codes: z.array(z.string()).optional(),
  })
  .optional()

const levelSchema = z.object({
  level: z.number().int().min(1),
  role: z.string().optional(),
  user_id: z.string().uuid().optional(),
  amount_limit: z.number().min(0).optional(),
  label: z.string().optional(),
})

const patchRuleSchema = z
  .object({
    rule_name: z.string().min(1).max(200),
    description: z.string().max(500),
    priority_order: z.number().int().min(0),
    is_active: z.boolean(),
    condition_json: conditionSchema,
    approval_levels_json: z.array(levelSchema).min(1),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: "At least one field required" })

type Params = { params: Promise<{ ruleId: string }> | { ruleId: string } }

// ─── GET ───────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest, { params }: Params) {
  const gate = await requireMasterDataApiContext(req)
  if (!gate.ok) return gate.response
  const { supabase, activeCompanyId } = gate.ctx
  const { ruleId } = await Promise.resolve(params)

  const { data, error } = await supabase
    .from("erp_approval_matrix_rules")
    .select("*")
    .eq("id", ruleId)
    .eq("company_id", activeCompanyId)
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: error.code === "PGRST116" ? 404 : 500 })
  }

  return NextResponse.json({ data })
}

// ─── PATCH ─────────────────────────────────────────────────────────────────────

export async function PATCH(req: NextRequest, { params }: Params) {
  const gate = await requireMasterDataApiContext(req)
  if (!gate.ok) return gate.response
  const { supabase, activeCompanyId } = gate.ctx
  const { ruleId } = await Promise.resolve(params)

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const parsed = patchRuleSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })
  }

  const { data: updated, error } = await supabase
    .from("erp_approval_matrix_rules")
    .update({ ...parsed.data, updated_at: new Date().toISOString() })
    .eq("id", ruleId)
    .eq("company_id", activeCompanyId)
    .select("id, rule_name, priority_order, is_active, updated_at")
    .single()

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json(
        { error: "PRIORITY_ORDER_CONFLICT", message: "כבר קיים כלל עם אותה עדיפות" },
        { status: 409 }
      )
    }
    return NextResponse.json({ error: error.message }, { status: error.code === "PGRST116" ? 404 : 500 })
  }

  return NextResponse.json({ data: updated })
}

// ─── DELETE ────────────────────────────────────────────────────────────────────

export async function DELETE(req: NextRequest, { params }: Params) {
  const gate = await requireMasterDataApiContext(req)
  if (!gate.ok) return gate.response
  const { supabase, activeCompanyId } = gate.ctx
  const { ruleId } = await Promise.resolve(params)

  // Prevent deleting the catch-all fallback rule (priority 9999)
  const { data: existing } = await supabase
    .from("erp_approval_matrix_rules")
    .select("priority_order")
    .eq("id", ruleId)
    .eq("company_id", activeCompanyId)
    .single()

  if ((existing as { priority_order: number } | null)?.priority_order === 9999) {
    return NextResponse.json(
      { error: "CANNOT_DELETE_FALLBACK", message: "לא ניתן למחוק כלל ברירת מחדל" },
      { status: 409 }
    )
  }

  const { error } = await supabase
    .from("erp_approval_matrix_rules")
    .delete()
    .eq("id", ruleId)
    .eq("company_id", activeCompanyId)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return new NextResponse(null, { status: 204 })
}
