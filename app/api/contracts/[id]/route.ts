import { type NextRequest, NextResponse } from "next/server"

import {
  requireMasterDataApiContext,
  sanitizeOptionalString,
} from "@/lib/erp/master-data-api"
import {
  canTransitionContractStatus,
  normalizeContractStatus,
  resolveActorRoleFromRequest,
} from "@/lib/erp/contracts-workflow"
import type { AppUserRole } from "@/lib/auth/user-role"
import type { ErpContract, ErpContractStatus, UpdateContractInput } from "@/types/erp"

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

type ContractUpdateBody = Partial<UpdateContractInput>

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function normalizeParams(
  params: Promise<{ id: string }> | { id: string }
): Promise<{ id: string }> {
  return Promise.resolve(params)
}

function normalizeStatus(value: unknown): ErpContractStatus | null {
  return normalizeContractStatus(value)
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

async function loadContract(req: NextRequest, contractId: string) {
  const gate = await requireMasterDataApiContext(req)
  if (!gate.ok) return gate

  const { supabase, activeCompanyId } = gate.ctx
  const { data, error } = await supabase
    .from("erp_contracts")
    .select("*")
    .eq("id", contractId)
    .eq("company_id", activeCompanyId)
    .maybeSingle()

  if (error) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: error.message }, { status: 500 }),
    }
  }
  if (!data) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Contract not found" }, { status: 404 }),
    }
  }

  return { ok: true as const, data: toContractDto(data as ContractRow) }
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  const { id } = await normalizeParams(params)
  const loaded = await loadContract(req, id)
  if (!loaded.ok) return loaded.response
  return NextResponse.json({ data: loaded.data })
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  const { id } = await normalizeParams(params)
  const gate = await requireMasterDataApiContext(req)
  if (!gate.ok) return gate.response

  const { supabase, activeCompanyId } = gate.ctx
  const body = (await req.json().catch(() => null)) as ContractUpdateBody | null

  const loadedCurrent = await loadContract(req, id)
  if (!loadedCurrent.ok) return loadedCurrent.response
  const currentContract = loadedCurrent.data

  const patch: Record<string, string | number | null> = {}
  const projectId = sanitizeOptionalString(body?.projectId)
  const supplierId = sanitizeOptionalString(body?.supplierId)
  const contractNumber = sanitizeOptionalString(body?.contractNumber)
  const title = sanitizeOptionalString(body?.title)
  const status = normalizeStatus(body?.status)

  if (body?.status !== undefined && !status) {
    return NextResponse.json({ error: "Invalid status value" }, { status: 400 })
  }
  if (status) {
    let actorRole = resolveActorRoleFromRequest(req)
    if (!actorRole) {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (user?.id) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", user.id)
          .maybeSingle()
        actorRole = ((profile as { role?: AppUserRole } | null)?.role ?? null)
      }
    }
    const transition = canTransitionContractStatus({
      from: currentContract.status,
      to: status,
      actorRole,
    })
    if (!transition.ok) {
      return NextResponse.json({ error: transition.reason }, { status: 403 })
    }
  }

  if (projectId !== null) patch.project_id = projectId
  if (supplierId !== null) patch.supplier_id = supplierId
  if (contractNumber !== null) patch.contract_number = contractNumber
  if (title !== null) patch.title = title
  if (status) patch.status = status
  if (body?.paymentTermsOverride !== undefined) {
    patch.payment_terms_override = sanitizeOptionalString(body.paymentTermsOverride)
  }
  if (body?.startDate !== undefined) {
    patch.start_date = sanitizeOptionalString(body.startDate)
  }
  if (body?.endDate !== undefined) {
    patch.end_date = sanitizeOptionalString(body.endDate)
  }
  if (body?.totalAmount !== undefined) {
    const totalAmount = Number(body.totalAmount)
    if (!Number.isFinite(totalAmount) || totalAmount < 0) {
      return NextResponse.json({ error: "Invalid totalAmount value" }, { status: 400 })
    }
    patch.total_amount = Number(totalAmount.toFixed(2))
  }

  if (projectId) {
    const projectResult = await supabase
      .from("erp_proj_projects")
      .select("id")
      .eq("id", projectId)
      .eq("company_id", activeCompanyId)
      .maybeSingle()
    if (projectResult.error) {
      return NextResponse.json({ error: projectResult.error.message }, { status: 500 })
    }
    if (!projectResult.data) {
      return NextResponse.json({ error: "Project not found for active company" }, { status: 400 })
    }
  }

  if (supplierId) {
    const supplierResult = await supabase
      .from("erp_md_suppliers")
      .select("id")
      .eq("id", supplierId)
      .eq("company_id", activeCompanyId)
      .maybeSingle()
    if (supplierResult.error) {
      return NextResponse.json({ error: supplierResult.error.message }, { status: 500 })
    }
    if (!supplierResult.data) {
      return NextResponse.json({ error: "Supplier not found for active company" }, { status: 400 })
    }
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "No valid fields supplied for update" }, { status: 400 })
  }

  const { error } = await supabase
    .from("erp_contracts")
    .update(patch)
    .eq("id", id)
    .eq("company_id", activeCompanyId)

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  const loaded = await loadContract(req, id)
  if (!loaded.ok) return loaded.response
  return NextResponse.json({ data: loaded.data })
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  const { id } = await normalizeParams(params)
  const gate = await requireMasterDataApiContext(req)
  if (!gate.ok) return gate.response

  const { supabase, activeCompanyId } = gate.ctx
  const { data, error } = await supabase
    .from("erp_contracts")
    .delete()
    .select("id")
    .eq("id", id)
    .eq("company_id", activeCompanyId)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  if (!data) return NextResponse.json({ error: "Contract not found" }, { status: 404 })
  return NextResponse.json({ ok: true })
}
