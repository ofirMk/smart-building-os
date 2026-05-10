/* eslint-disable @typescript-eslint/no-explicit-any -- TODO(tech-debt): refactor DB row types; tracked for Sprint 3 cleanup. */
import { type NextRequest, NextResponse } from "next/server"

import { requireMasterDataApiContext } from "@/lib/erp/master-data-api"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function normalizeParams(
  params: Promise<{ id: string }> | { id: string }
): Promise<{ id: string }> {
  return Promise.resolve(params)
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  const { id: projectId } = await normalizeParams(params)
  const gate = await requireMasterDataApiContext(req)
  if (!gate.ok) return gate.response
  const { supabase, companyId } = gate.ctx

  const project = await supabase
    .from("erp_proj_projects")
    .select("id")
    .eq("company_id", companyId)
    .eq("id", projectId)
    .maybeSingle()
  if (project.error) return NextResponse.json({ error: project.error.message }, { status: 500 })
  if (!project.data) return NextResponse.json({ error: "Project not found" }, { status: 404 })

  const [budgetRowsRes, actualRowsRes, progressTotalsRes, contractRowsRes, changeOrdersRes, subcontractorTotalsRes] =
    await Promise.all([
      supabase
        .from("erp_project_budget_lines")
        .select("budget_sub_chapter,resource_id,total_budget")
        .eq("company_id", companyId)
        .eq("project_id", projectId),
      supabase
        .from("erp_subcontractor_bills")
        .select("budget_sub_chapter,resource_id,submitted_amount,approved_amount")
        .eq("company_id", companyId)
        .eq("project_id", projectId),
      supabase
        .from("erp_client_progress_bills")
        .select("submitted_total_amount,approved_total_amount")
        .eq("company_id", companyId)
        .in(
          "client_contract_id",
          (
            await supabase
              .from("erp_client_contracts")
              .select("id")
              .eq("company_id", companyId)
              .eq("project_id", projectId)
          ).data?.map((row: any) => row.id) ?? ["00000000-0000-0000-0000-000000000000"]
        ),
      supabase
        .from("erp_client_contracts")
        .select("id,total_amount")
        .eq("company_id", companyId)
        .eq("project_id", projectId),
      supabase
        .from("erp_change_orders")
        .select("change_type,qty_delta,new_unit_price,contract_line_id,status,erp_client_contract_lines(quantity,unit_price,client_contract_id)")
        .eq("company_id", companyId)
        .eq("status", "APPROVED"),
      supabase
        .from("erp_subcontractor_bills")
        .select("submitted_amount,approved_amount")
        .eq("company_id", companyId)
        .eq("project_id", projectId),
    ])

  if (budgetRowsRes.error) return NextResponse.json({ error: budgetRowsRes.error.message }, { status: 500 })
  if (actualRowsRes.error) return NextResponse.json({ error: actualRowsRes.error.message }, { status: 500 })
  if (progressTotalsRes.error) return NextResponse.json({ error: progressTotalsRes.error.message }, { status: 500 })
  if (contractRowsRes.error) return NextResponse.json({ error: contractRowsRes.error.message }, { status: 500 })
  if (changeOrdersRes.error) return NextResponse.json({ error: changeOrdersRes.error.message }, { status: 500 })
  if (subcontractorTotalsRes.error) {
    return NextResponse.json({ error: subcontractorTotalsRes.error.message }, { status: 500 })
  }

  const contractIds = new Set((contractRowsRes.data ?? []).map((row: any) => row.id as string))
  const budgetMap = new Map<string, { resource: string; subChapter: string; budget: number; actual: number }>()
  for (const row of budgetRowsRes.data ?? []) {
    const key = `${row.resource_id}:${row.budget_sub_chapter}`
    budgetMap.set(key, {
      resource: row.resource_id as string,
      subChapter: row.budget_sub_chapter as string,
      budget: Number(row.total_budget ?? 0),
      actual: 0,
    })
  }
  for (const row of actualRowsRes.data ?? []) {
    const key = `${row.resource_id}:${row.budget_sub_chapter}`
    const current = budgetMap.get(key) ?? {
      resource: row.resource_id as string,
      subChapter: row.budget_sub_chapter as string,
      budget: 0,
      actual: 0,
    }
    current.actual += Number(row.submitted_amount ?? 0)
    budgetMap.set(key, current)
  }

  const submittedTotal = (progressTotalsRes.data ?? []).reduce(
    (sum: number, row: any) => sum + Number(row.submitted_total_amount ?? 0),
    0
  )
  const approvedTotal = (progressTotalsRes.data ?? []).reduce(
    (sum: number, row: any) => sum + Number(row.approved_total_amount ?? 0),
    0
  )
  const approvalVariance = submittedTotal - approvedTotal

  const originalContractAmount = (contractRowsRes.data ?? []).reduce(
    (sum: number, row: any) => sum + Number(row.total_amount ?? 0),
    0
  )
  const totalChangeOrdersAmount = (changeOrdersRes.data ?? []).reduce((sum: number, row: any) => {
    const linkedLine = Array.isArray(row.erp_client_contract_lines)
      ? row.erp_client_contract_lines[0]
      : row.erp_client_contract_lines
    const linkedContractId = linkedLine?.client_contract_id as string | undefined
    if (linkedContractId && !contractIds.has(linkedContractId)) return sum
    const qtyDelta = Number(row.qty_delta ?? 0)
    const newUnitPrice = Number(row.new_unit_price ?? 0)
    const sourceQty = Number(linkedLine?.quantity ?? 0)
    const sourceUnitPrice = Number(linkedLine?.unit_price ?? 0)
    if (row.change_type === "NEW_LINE") return sum + qtyDelta * newUnitPrice
    if (row.change_type === "QTY_CHANGE") return sum + qtyDelta * sourceUnitPrice
    if (row.change_type === "PRICE_CHANGE") {
      return sum + Math.max(newUnitPrice - sourceUnitPrice, 0) * sourceQty
    }
    return sum
  }, 0)

  const subcontractorSubmitted = (subcontractorTotalsRes.data ?? []).reduce(
    (sum: number, row: any) => sum + Number(row.submitted_amount ?? 0),
    0
  )
  const subcontractorApproved = (subcontractorTotalsRes.data ?? []).reduce(
    (sum: number, row: any) => sum + Number(row.approved_amount ?? 0),
    0
  )

  return NextResponse.json({
    data: {
      budgetVsActual: Array.from(budgetMap.values()).sort((a, b) =>
        `${a.resource}:${a.subChapter}`.localeCompare(`${b.resource}:${b.subChapter}`)
      ),
      approvalVariance: {
        submittedTotal,
        approvedTotal,
        variance: approvalVariance,
      },
      changeOrderImpact: {
        originalContractAmount,
        totalChangeOrdersAmount,
        revisedContractAmount: originalContractAmount + totalChangeOrdersAmount,
      },
      subcontractorTotals: {
        submitted: subcontractorSubmitted,
        approved: subcontractorApproved,
      },
    },
  })
}
