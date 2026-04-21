import { type NextRequest, NextResponse } from "next/server"

import {
  mapProgressBillRow,
  normalizeRouteParams,
  requireClientContractsApiContext,
} from "@/lib/erp/client-contracts-api"
import { generateClientProgressBillExcel } from "@/lib/erp/excel-export-engine"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type BillLineRow = {
  contract_line_id: string
  submitted_percent: number | null
  submitted_amount: number | null
}

type ContractLineRow = {
  id: string
  item_id: string | null
  boq_ref: string | null
  line_number: number
  description: string | null
  quantity: number
  unit_price: number
  last_approved_pct: number | null
}

function toNumber(value: number | null | undefined): number {
  if (value === null || value === undefined) return 0
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function asFileName(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, "-")
}

export async function GET(
  req: NextRequest,
  {
    params,
  }: { params: Promise<{ id: string; billId: string }> | { id: string; billId: string } }
) {
  const { id: clientContractId, billId } = await normalizeRouteParams(params)
  const ctx = await requireClientContractsApiContext(req)
  if (!ctx.ok) return ctx.response
  const { supabase, activeCompanyId } = ctx

  const contractResult = await supabase
    .from("erp_client_contracts")
    .select("id,contract_number,title")
    .eq("company_id", activeCompanyId)
    .eq("id", clientContractId)
    .maybeSingle()
  if (contractResult.error) {
    return NextResponse.json({ error: contractResult.error.message }, { status: 500 })
  }
  if (!contractResult.data) {
    return NextResponse.json({ error: "Client contract not found" }, { status: 404 })
  }

  const billResult = await supabase
    .from("erp_client_progress_bills")
    .select("*")
    .eq("company_id", activeCompanyId)
    .eq("client_contract_id", clientContractId)
    .eq("id", billId)
    .maybeSingle()
  if (billResult.error) {
    return NextResponse.json({ error: billResult.error.message }, { status: 500 })
  }
  if (!billResult.data) {
    return NextResponse.json({ error: "Progress bill not found" }, { status: 404 })
  }

  const currentLinesResult = await supabase
    .from("erp_client_progress_bill_lines")
    .select("contract_line_id,submitted_percent,submitted_amount")
    .eq("company_id", activeCompanyId)
    .eq("progress_bill_id", billId)
  if (currentLinesResult.error) {
    return NextResponse.json({ error: currentLinesResult.error.message }, { status: 500 })
  }

  const contractLinesResult = await supabase
    .from("erp_client_contract_lines")
    .select("id,item_id,boq_ref,line_number,description,quantity,unit_price,last_approved_pct")
    .eq("company_id", activeCompanyId)
    .eq("client_contract_id", clientContractId)
    .order("line_number", { ascending: true })
  if (contractLinesResult.error) {
    return NextResponse.json({ error: contractLinesResult.error.message }, { status: 500 })
  }

  const currentLineMap = new Map<string, BillLineRow>()
  for (const row of (currentLinesResult.data ?? []) as BillLineRow[]) {
    currentLineMap.set(row.contract_line_id, row)
  }

  const bill = mapProgressBillRow(billResult.data)
  const exportLines = ((contractLinesResult.data ?? []) as ContractLineRow[]).map((line) => {
    const contractLineId = String(line.id)
    const current = currentLineMap.get(contractLineId)
    const previousCumulativePct = Math.max(0, Math.min(100, toNumber(line.last_approved_pct)))
    const currentPeriodPct = Math.max(0, Math.min(100, toNumber(current?.submitted_percent)))
    const totalPct = Math.max(0, Math.min(100, previousCumulativePct + currentPeriodPct))
    const contractQty = toNumber(line.quantity)
    const unitPrice = toNumber(line.unit_price)
    const computedAmountForPayment = contractQty * unitPrice * (currentPeriodPct / 100)
    const amountForPayment = toNumber(current?.submitted_amount) || computedAmountForPayment

    return {
      itemId:
        line.boq_ref?.trim() || line.item_id
          ? String(line.boq_ref?.trim() ?? line.item_id)
          : `LINE-${toNumber(line.line_number) || 0}`,
      description: String(line.description ?? ""),
      contractQty,
      unitPrice,
      previousCumulativePct,
      currentPeriodPct,
      totalPct,
      amountForPayment,
    }
  })

  const workbookData = await generateClientProgressBillExcel({
    contractNumber: String(contractResult.data.contract_number ?? clientContractId),
    contractTitle: String(contractResult.data.title ?? ""),
    bill,
    lines: exportLines,
  })

  const fileName = asFileName(
    `client-progress-bill-${contractResult.data.contract_number ?? clientContractId}-${bill.billNumber}.xlsx`
  )

  return new NextResponse(Buffer.from(workbookData), {
    status: 200,
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="${fileName}"`,
      "cache-control": "no-store",
    },
  })
}
