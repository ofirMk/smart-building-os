/**
 * GET  /api/procurement/setup/approval-matrix
 *   → list all rules for the active company (ordered by priority_order)
 *
 * POST /api/procurement/setup/approval-matrix
 *   → create a new rule
 *   Body: { rule_name, description?, priority_order, is_active?, condition_json, approval_levels_json }
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
  .default({})

const levelSchema = z.object({
  level: z.number().int().min(1),
  role: z.string().optional(),
  user_id: z.string().uuid().optional(),
  amount_limit: z.number().min(0).optional(),
  label: z.string().optional(),
})

const createRuleSchema = z.object({
  rule_name: z.string().min(1).max(200),
  description: z.string().max(500).optional(),
  priority_order: z.number().int().min(0),
  is_active: z.boolean().optional().default(true),
  condition_json: conditionSchema,
  approval_levels_json: z.array(levelSchema).min(1),
})

// ─── GET ───────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const gate = await requireMasterDataApiContext(req)
  if (!gate.ok) return gate.response
  const { supabase, activeCompanyId } = gate.ctx

  const { data, error } = await supabase
    .from("erp_approval_matrix_rules")
    .select("id, rule_name, description, priority_order, is_active, condition_json, approval_levels_json, created_at, updated_at")
    .eq("company_id", activeCompanyId)
    .order("priority_order", { ascending: true })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data })
}

// ─── POST ──────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const gate = await requireMasterDataApiContext(req)
  if (!gate.ok) return gate.response
  const { supabase, activeCompanyId } = gate.ctx

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const parsed = createRuleSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })
  }

  const { data: inserted, error } = await supabase
    .from("erp_approval_matrix_rules")
    .insert({
      company_id: activeCompanyId,
      ...parsed.data,
    })
    .select("id, rule_name, priority_order, is_active")
    .single()

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json(
        { error: "PRIORITY_ORDER_CONFLICT", message: "כבר קיים כלל עם אותה עדיפות" },
        { status: 409 }
      )
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data: inserted }, { status: 201 })
}
