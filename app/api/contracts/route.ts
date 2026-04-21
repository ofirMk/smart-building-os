import { type NextRequest, NextResponse } from "next/server"

import {
  requireMasterDataApiContext,
  sanitizeOptionalString,
} from "@/lib/erp/master-data-api"
import { normalizeContractStatus } from "@/lib/erp/contracts-workflow"
import type { CreateContractInput, ErpContract, ErpContractStatus } from "@/types/erp"

type ContractRow = {
  id: string
  company_id: string
  project_id: string
  supplier_id: string
  contract_number: string
  title: string
  status: ErpContractStatus
  total_amount: number
  payment_terms_override: string | null
  start_date: string | null
  end_date: string | null
}

type ContractCreateBody = Partial<CreateContractInput>

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function normalizeStatus(value: unknown): ErpContractStatus {
  const status = normalizeContractStatus(value)
  if (status) return status
  return "DRAFT"
}

function toContractDto(row: ContractRow): ErpContract {
  return {
    id: row.id,
    companyId: row.company_id,
    projectId: row.project_id,
    supplierId: row.supplier_id,
    contractNumber: row.contract_number,
    title: row.title,
    status: row.status,
    totalAmount: Number(row.total_amount),
    paymentTermsOverride: row.payment_terms_override,
    startDate: row.start_date,
    endDate: row.end_date,
  }
}

export async function GET(req: NextRequest) {
  const gate = await requireMasterDataApiContext(req)
  if (!gate.ok) return gate.response

  const { supabase, activeCompanyId } = gate.ctx
  const q = sanitizeOptionalString(req.nextUrl.searchParams.get("q"))
  const projectId = sanitizeOptionalString(req.nextUrl.searchParams.get("projectId"))
  const supplierId = sanitizeOptionalString(req.nextUrl.searchParams.get("supplierId"))
  const status = sanitizeOptionalString(req.nextUrl.searchParams.get("status"))?.toUpperCase()

  let query = supabase
    .from("erp_contracts")
    .select("*")
    .eq("company_id", activeCompanyId)
    .order("contract_number", { ascending: true })

  if (
    status === "DRAFT" ||
    status === "PENDING_APPROVAL" ||
    status === "ACTIVE" ||
    status === "CLOSED"
  ) {
    query = query.eq("status", status)
  }
  if (projectId) query = query.eq("project_id", projectId)
  if (supplierId) query = query.eq("supplier_id", supplierId)
  if (q) query = query.or(`contract_number.ilike.%${q}%,title.ilike.%${q}%`)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data: ((data ?? []) as ContractRow[]).map(toContractDto) })
}

export async function POST(req: NextRequest) {
  const gate = await requireMasterDataApiContext(req)
  if (!gate.ok) return gate.response

  const { supabase, activeCompanyId } = gate.ctx
  const body = (await req.json().catch(() => null)) as ContractCreateBody | null

  const projectId = sanitizeOptionalString(body?.projectId)
  const supplierId = sanitizeOptionalString(body?.supplierId)
  const contractNumber = sanitizeOptionalString(body?.contractNumber)
  const title = sanitizeOptionalString(body?.title)
  const paymentTermsOverride = sanitizeOptionalString(body?.paymentTermsOverride)
  const startDate = sanitizeOptionalString(body?.startDate)
  const endDate = sanitizeOptionalString(body?.endDate)
  const status = normalizeStatus(body?.status)
  const totalAmount = Number(body?.totalAmount)
  const normalizedAmount =
    Number.isFinite(totalAmount) && totalAmount >= 0 ? Number(totalAmount.toFixed(2)) : 0

  if (!projectId || !supplierId || !contractNumber || !title) {
    return NextResponse.json(
      { error: "projectId, supplierId, contractNumber and title are required" },
      { status: 400 }
    )
  }

  const [projectResult, supplierResult] = await Promise.all([
    supabase
      .from("erp_proj_projects")
      .select("id")
      .eq("id", projectId)
      .eq("company_id", activeCompanyId)
      .maybeSingle(),
    supabase
      .from("erp_md_suppliers")
      .select("id")
      .eq("id", supplierId)
      .eq("company_id", activeCompanyId)
      .maybeSingle(),
  ])

  if (projectResult.error) {
    return NextResponse.json({ error: projectResult.error.message }, { status: 500 })
  }
  if (!projectResult.data) {
    return NextResponse.json({ error: "Project not found for active company" }, { status: 400 })
  }
  if (supplierResult.error) {
    return NextResponse.json({ error: supplierResult.error.message }, { status: 500 })
  }
  if (!supplierResult.data) {
    return NextResponse.json({ error: "Supplier not found for active company" }, { status: 400 })
  }

  const { data, error } = await supabase
    .from("erp_contracts")
    .insert({
      company_id: activeCompanyId,
      project_id: projectId,
      supplier_id: supplierId,
      contract_number: contractNumber,
      title,
      status,
      total_amount: normalizedAmount,
      payment_terms_override: paymentTermsOverride,
      start_date: startDate,
      end_date: endDate,
    })
    .select("*")
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ data: toContractDto(data as ContractRow) }, { status: 201 })
}
