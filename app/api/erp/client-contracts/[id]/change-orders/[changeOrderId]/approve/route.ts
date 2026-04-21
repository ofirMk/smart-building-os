import { type NextRequest, NextResponse } from "next/server"

import { normalizeRouteParams, requireClientContractsApiContext } from "@/lib/erp/client-contracts-api"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(
  req: NextRequest,
  {
    params,
  }: { params: Promise<{ id: string; changeOrderId: string }> | { id: string; changeOrderId: string } }
) {
  const { id: clientContractId, changeOrderId } = await normalizeRouteParams(params)
  const ctx = await requireClientContractsApiContext(req)
  if (!ctx.ok) return ctx.response
  const { supabase, activeCompanyId } = ctx

  const verifyChangeOrder = await supabase
    .from("erp_change_orders")
    .select("id,price_override_status,manager_approval_required")
    .eq("company_id", activeCompanyId)
    .eq("client_contract_id", clientContractId)
    .eq("id", changeOrderId)
    .maybeSingle()
  if (verifyChangeOrder.error) return NextResponse.json({ error: verifyChangeOrder.error.message }, { status: 500 })
  if (!verifyChangeOrder.data) return NextResponse.json({ error: "Change order not found" }, { status: 404 })
  if (verifyChangeOrder.data.price_override_status === "REQUESTED") {
    return NextResponse.json(
      { error: "לא ניתן לאשר פקודת שינוי לפני אישור חריגת מחיר", code: "PRICE_OVERRIDE_PENDING" },
      { status: 409 }
    )
  }
  if (verifyChangeOrder.data.manager_approval_required === true) {
    return NextResponse.json(
      { error: "Manager approval is required before approval transition", code: "MANAGER_APPROVAL_REQUIRED" },
      { status: 409 }
    )
  }

  const approved = await supabase.rpc("erp_approve_change_order", {
    p_company_id: activeCompanyId,
    p_change_order_id: changeOrderId,
  })
  if (approved.error) return NextResponse.json({ error: approved.error.message }, { status: 400 })

  const changeOrder = await supabase
    .from("erp_change_orders")
    .select("id,change_type,contract_line_id,qty_delta,new_unit_price")
    .eq("company_id", activeCompanyId)
    .eq("client_contract_id", clientContractId)
    .eq("id", changeOrderId)
    .maybeSingle()
  if (changeOrder.error) return NextResponse.json({ error: changeOrder.error.message }, { status: 500 })

  const nextBill = await supabase
    .from("erp_client_progress_bills")
    .select("id,status")
    .eq("company_id", activeCompanyId)
    .eq("client_contract_id", clientContractId)
    .eq("status", "DRAFT")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle()
  if (nextBill.error) return NextResponse.json({ error: nextBill.error.message }, { status: 500 })

  if (nextBill.data && changeOrder.data?.contract_line_id) {
    const contractLine = await supabase
      .from("erp_client_contract_lines")
      .select("id,quantity,unit_price")
      .eq("company_id", activeCompanyId)
      .eq("client_contract_id", clientContractId)
      .eq("id", changeOrder.data.contract_line_id)
      .maybeSingle()
    if (contractLine.error) return NextResponse.json({ error: contractLine.error.message }, { status: 500 })

    if (contractLine.data) {
      const existingBillLine = await supabase
        .from("erp_client_progress_bill_lines")
        .select("submitted_quantity,submitted_amount,submitted_percent")
        .eq("company_id", activeCompanyId)
        .eq("progress_bill_id", nextBill.data.id)
        .eq("contract_line_id", changeOrder.data.contract_line_id)
        .maybeSingle()
      if (existingBillLine.error) {
        return NextResponse.json({ error: existingBillLine.error.message }, { status: 500 })
      }

      const baseQty = Number(existingBillLine.data?.submitted_quantity ?? contractLine.data.quantity ?? 0)
      const qtyDelta =
        changeOrder.data.change_type === "QTY_CHANGE"
          ? Number(changeOrder.data.qty_delta ?? 0)
          : 0
      const submittedQuantity = Math.max(baseQty + qtyDelta, 0)
      const unitPrice =
        changeOrder.data.change_type === "PRICE_CHANGE" && changeOrder.data.new_unit_price !== null
          ? Number(changeOrder.data.new_unit_price)
          : Number(contractLine.data.unit_price ?? 0)
      const submittedAmount = Number((submittedQuantity * unitPrice).toFixed(2))
      const baselineQuantity = Number(contractLine.data.quantity ?? 0)
      const submittedPercent =
        baselineQuantity > 0 ? Number(((submittedQuantity / baselineQuantity) * 100).toFixed(4)) : 0

      const synced = await supabase
        .from("erp_client_progress_bill_lines")
        .upsert(
          {
            company_id: activeCompanyId,
            progress_bill_id: nextBill.data.id,
            contract_line_id: changeOrder.data.contract_line_id,
            submitted_quantity: submittedQuantity,
            submitted_amount: submittedAmount,
            submitted_percent: submittedPercent,
          },
          { onConflict: "company_id,progress_bill_id,contract_line_id" }
        )
      if (synced.error) return NextResponse.json({ error: synced.error.message }, { status: 500 })

      const totals = await supabase.rpc("erp_calculate_client_bill_totals", {
        p_company_id: activeCompanyId,
        p_progress_bill_id: nextBill.data.id,
      })
      if (totals.error) return NextResponse.json({ error: totals.error.message }, { status: 500 })
    }
  }

  return NextResponse.json({ data: approved.data })
}

