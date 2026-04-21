import { type NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import {
  normalizeRouteParams,
  requireClientContractsApiContext,
} from "@/lib/erp/client-contracts-api"

const linkedLineSchema = z.object({
  contractId: z.string().uuid(),
  contractNumber: z.string(),
  supplierId: z.string().uuid(),
  lineId: z.string().uuid(),
  description: z.string(),
  subcontractorUnitPrice: z.coerce.number(),
  subcontractorQuantity: z.coerce.number(),
  subcontractorTotalPrice: z.coerce.number(),
})

const linkedClientLineSchema = z.object({
  clientLineId: z.string().uuid(),
  boqRef: z.string(),
  clientUnitPrice: z.coerce.number(),
  links: z.array(linkedLineSchema),
})

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  const { id: projectId } = await normalizeRouteParams(params)
  const ctx = await requireClientContractsApiContext(req)
  if (!ctx.ok) return ctx.response
  const { supabase, activeCompanyId } = ctx

  const clientLinesRes = await supabase
    .from("erp_client_contract_lines")
    .select("id,boq_ref,unit_price,erp_client_contracts!inner(project_id)")
    .eq("company_id", activeCompanyId)
    .eq("erp_client_contracts.project_id", projectId)
    .not("boq_ref", "is", null)
  if (clientLinesRes.error) {
    return NextResponse.json({ error: clientLinesRes.error.message }, { status: 500 })
  }

  const clientLines = (clientLinesRes.data ?? []) as Array<{
    id: string
    boq_ref?: string | null
    unit_price?: number | null
  }>
  if (clientLines.length === 0) {
    return NextResponse.json({ data: [] })
  }

  const clientLineIdsByBoqRef = new Map<string, Array<{ id: string; clientUnitPrice: number }>>()
  for (const row of clientLines) {
    const boqRef = String(row.boq_ref ?? "").trim()
    if (!boqRef) continue
    const current = clientLineIdsByBoqRef.get(boqRef) ?? []
    current.push({
      id: row.id,
      clientUnitPrice: z.coerce.number().catch(0).parse(row.unit_price ?? 0),
    })
    clientLineIdsByBoqRef.set(boqRef, current)
  }
  if (clientLineIdsByBoqRef.size === 0) {
    return NextResponse.json({ data: [] })
  }

  const subcontractorLinesRes = await supabase
    .from("erp_contract_lines")
    .select(
      "id,description,quantity,unit_price,total_price,erp_contracts!inner(id,contract_number,supplier_id,project_id),erp_proj_boq_lines!erp_contract_lines_company_boq_line_fk(item_number)"
    )
    .eq("company_id", activeCompanyId)
    .eq("erp_contracts.project_id", projectId)
  if (subcontractorLinesRes.error) {
    return NextResponse.json({ error: subcontractorLinesRes.error.message }, { status: 500 })
  }

  const linksByClientLineId = new Map<
    string,
    Array<{
      contractId: string
      contractNumber: string
      supplierId: string
      lineId: string
      description: string
      subcontractorUnitPrice: number
      subcontractorQuantity: number
      subcontractorTotalPrice: number
    }>
  >()

  const subcontractorRows = (subcontractorLinesRes.data ?? []) as Array<{
    id: string
    description?: string | null
    quantity?: number | null
    unit_price?: number | null
    total_price?: number | null
    erp_contracts?:
      | {
          id?: string
          contract_number?: string | null
          supplier_id?: string | null
          project_id?: string
        }
      | Array<{
          id?: string
          contract_number?: string | null
          supplier_id?: string | null
          project_id?: string
        }>
      | null
    erp_proj_boq_lines?:
      | {
          item_number?: string | null
        }
      | Array<{
          item_number?: string | null
        }>
      | null
  }>

  for (const row of subcontractorRows) {
    const contractRaw = Array.isArray(row.erp_contracts) ? row.erp_contracts[0] : row.erp_contracts
    const boqRaw = Array.isArray(row.erp_proj_boq_lines)
      ? row.erp_proj_boq_lines[0]
      : row.erp_proj_boq_lines
    const boqRef = String(boqRaw?.item_number ?? "").trim()
    if (!boqRef) continue
    const matchedClientLines = clientLineIdsByBoqRef.get(boqRef)
    if (!matchedClientLines || matchedClientLines.length === 0) continue

    const contractId = String(contractRaw?.id ?? "")
    const supplierId = String(contractRaw?.supplier_id ?? "")
    if (!contractId || !supplierId) continue

    const normalizedLine = {
      contractId,
      contractNumber: String(contractRaw?.contract_number ?? ""),
      supplierId,
      lineId: row.id,
      description: String(row.description ?? ""),
      subcontractorUnitPrice: z.coerce.number().catch(0).parse(row.unit_price ?? 0),
      subcontractorQuantity: z.coerce.number().catch(0).parse(row.quantity ?? 0),
      subcontractorTotalPrice: z.coerce.number().catch(0).parse(row.total_price ?? 0),
    }

    for (const clientLine of matchedClientLines) {
      const current = linksByClientLineId.get(clientLine.id) ?? []
      current.push(normalizedLine)
      linksByClientLineId.set(clientLine.id, current)
    }
  }

  const payload = clientLines
    .map((row) => {
      const boqRef = String(row.boq_ref ?? "").trim()
      if (!boqRef) return null
      return {
        clientLineId: row.id,
        boqRef,
        clientUnitPrice: z.coerce.number().catch(0).parse(row.unit_price ?? 0),
        links: linksByClientLineId.get(row.id) ?? [],
      }
    })
    .filter((row): row is NonNullable<typeof row> => row !== null)

  return NextResponse.json({ data: linkedClientLineSchema.array().parse(payload) })
}
