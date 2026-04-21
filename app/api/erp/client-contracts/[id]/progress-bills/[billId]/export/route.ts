import { type NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import { normalizeRouteParams, requireClientContractsApiContext } from "@/lib/erp/client-contracts-api"
import { generateClientProgressBillExcel } from "@/lib/erp/client-billing-excel"

const lineSchema = z.object({
  submitted_amount: z.coerce.number().default(0),
  submitted_percent: z.coerce.number().default(0),
  erp_client_contract_lines: z
    .object({
      line_number: z.coerce.number().default(0),
      description: z.string().nullable().default(""),
      quantity: z.coerce.number().default(0),
      unit_price: z.coerce.number().default(0),
      last_approved_pct: z.coerce.number().nullable().default(0),
    })
    .nullable()
    .default(null),
})

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

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

  const billRes = await supabase
    .from("erp_client_progress_bills")
    .select("id,bill_number,period_start,period_end,client_contract_id")
    .eq("company_id", activeCompanyId)
    .eq("client_contract_id", clientContractId)
    .eq("id", billId)
    .maybeSingle()
  if (billRes.error) return NextResponse.json({ error: billRes.error.message }, { status: 500 })
  if (!billRes.data) return NextResponse.json({ error: "Progress bill not found" }, { status: 404 })

  const contractRes = await supabase
    .from("erp_client_contracts")
    .select("id,project_id")
    .eq("company_id", activeCompanyId)
    .eq("id", clientContractId)
    .maybeSingle()
  if (contractRes.error) return NextResponse.json({ error: contractRes.error.message }, { status: 500 })
  if (!contractRes.data) return NextResponse.json({ error: "Client contract not found" }, { status: 404 })

  const projectRes = await supabase
    .from("erp_proj_projects")
    .select("name")
    .eq("company_id", activeCompanyId)
    .eq("id", contractRes.data.project_id)
    .maybeSingle()
  if (projectRes.error) return NextResponse.json({ error: projectRes.error.message }, { status: 500 })

  const linesRes = await supabase
    .from("erp_client_progress_bill_lines")
    .select(
      "submitted_amount,submitted_percent,erp_client_contract_lines!inner(line_number,description,quantity,unit_price,last_approved_pct)"
    )
    .eq("company_id", activeCompanyId)
    .eq("progress_bill_id", billId)
    .order("created_at", { ascending: true })
  if (linesRes.error) return NextResponse.json({ error: linesRes.error.message }, { status: 500 })

  const excelLines = (linesRes.data ?? []).map((raw: unknown) => {
    const parsed = lineSchema.parse(raw)
    const contractLine = parsed.erp_client_contract_lines
    const previousPct = z.coerce.number().parse(contractLine?.last_approved_pct ?? 0)
    const totalPct = z.coerce.number().parse(parsed.submitted_percent)
    const currentPct = Math.max(totalPct - previousPct, 0)
    const contractQty = z.coerce.number().parse(contractLine?.quantity ?? 0)
    const unitPrice = z.coerce.number().parse(contractLine?.unit_price ?? 0)
    const fallbackAmount = contractQty * unitPrice * (currentPct / 100)

    return {
      itemNo: String(z.coerce.number().parse(contractLine?.line_number ?? 0)),
      description: String(contractLine?.description ?? ""),
      contractQty,
      unitPrice,
      previousCumulativePct: previousPct,
      currentPeriodPct: currentPct,
      totalPct,
      amountForPayment: z.coerce.number().parse(parsed.submitted_amount || fallbackAmount),
    }
  })

  const workbook = await generateClientProgressBillExcel(billId, {
    projectName: String(projectRes.data?.name ?? "Project"),
    billNumber: String(billRes.data.bill_number ?? billId),
    periodStart: (billRes.data.period_start as string | null) ?? null,
    periodEnd: (billRes.data.period_end as string | null) ?? null,
    lines: excelLines,
  })

  const filename = `client-progress-bill-${String(billRes.data.bill_number ?? billId).replace(/[^a-zA-Z0-9-_]/g, "_")}.xlsx`
  return new NextResponse(new Uint8Array(workbook), {
    status: 200,
    headers: {
      "content-type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="${filename}"`,
      "cache-control": "no-store",
    },
  })
}
