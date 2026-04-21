import { type NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import { requireProcurementApiContext } from "@/lib/erp/procurement-api"
import type { SubcontractorBill } from "@/types/erp"

interface DeductionItem {
  itemId: string
  quantity: number
  unitPrice: number
}

type MaterialDeductionsBody = {
  projectId: string
  subcontractorId: string
  items?: DeductionItem[]
}

interface SubcontractorBillRow {
  id: string
  project_id: string
  supplier_id: string
  status: string
  submitted_amount: number | string | null
  source_type: string
  source_id: string
}

interface PurchaseOrderParentRow {
  id: string
  po_number: string | null
  issued_at: string | null
}

interface PurchaseOrderLineJoinedRow {
  id: string
  purchase_order_id: string
  description: string | null
  total_price: number | string | null
  erp_purchase_orders: PurchaseOrderParentRow | PurchaseOrderParentRow[] | null
}

interface ContractCommissionRow {
  procurement_commission_pct: number | string | null
  status?: string | null
  created_at?: string | null
}

const requestSchema = z.object({
  projectId: z.string().min(1),
  subcontractorId: z.string().min(1),
})

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function firstOrNull<T>(value: T | T[] | null | undefined): T | null {
  if (value === null || value === undefined) return null
  if (Array.isArray(value)) return (value[0] as T | undefined) ?? null
  return value
}

function parseNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value ?? fallback)
  return Number.isFinite(parsed) ? parsed : fallback
}

export async function GET(req: NextRequest) {
  const ctx = await requireProcurementApiContext(req)
  if (!ctx.ok) return ctx.response
  const { supabase, activeCompanyId } = ctx

  const projectId = req.nextUrl.searchParams.get("projectId")
  const supplierId = req.nextUrl.searchParams.get("supplierId")

  let query = supabase
    .from("erp_subcontractor_bills")
    .select(
      "id,project_id,supplier_id,status,submitted_amount,source_type,source_id"
    )
    .eq("company_id", activeCompanyId)
    .order("created_at", { ascending: false })

  if (projectId) query = query.eq("project_id", projectId)
  if (supplierId) query = query.eq("supplier_id", supplierId)

  const { data, error } = (await query) as {
    data: SubcontractorBillRow[] | null
    error: { message: string } | null
  }
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const mapped: SubcontractorBill[] = (data ?? []).map(
    (row: SubcontractorBillRow) => ({
      id: row.id,
      projectId: row.project_id,
      supplierId: row.supplier_id,
      status:
        row.status === "PAID"
          ? "PAID"
          : row.status === "APPROVED"
            ? "APPROVED"
            : row.status === "PENDING_APPROVAL"
              ? "PENDING_APPROVAL"
              : "DRAFT",
      amount: parseNumber(row.submitted_amount),
      isOffset: false,
      linkedPurchaseOrderId:
        row.source_type === "PURCHASE_ORDER" ? row.source_id : undefined,
    })
  )

  return NextResponse.json({ data: mapped })
}

export async function POST(req: NextRequest) {
  const ctx = await requireProcurementApiContext(req)
  if (!ctx.ok) return ctx.response
  const { supabase, activeCompanyId } = ctx

  const body = (await req.json().catch(() => null)) as MaterialDeductionsBody | null
  const parsed = requestSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid payload" },
      { status: 400 }
    )
  }

  const submittedItemsTotal = (body?.items ?? []).reduce(
    (sum: number, item: DeductionItem) => sum + item.quantity * item.unitPrice,
    0
  )

  if (
    !UUID_PATTERN.test(parsed.data.projectId) ||
    !UUID_PATTERN.test(parsed.data.subcontractorId)
  ) {
    return NextResponse.json({
      data: {
        sourceDocuments: [],
        baseAmount: 0,
        procurementCommissionPct: 0,
        procurementCommissionAmount: 0,
        totalDeduction: 0,
        submittedItemsTotal,
        suggestedLine: {
          taskDescription: "Material Deduction (Auto)",
          claimedAmount: 0,
          approvedAmount: 0,
          notes: "No offset sources",
        },
      },
    })
  }

  const poLinesRes = (await supabase
    .from("erp_purchase_order_lines")
    .select(
      "id,purchase_order_id,description,total_price,erp_purchase_orders!inner(id,po_number,issued_at)"
    )
    .eq("company_id", activeCompanyId)
    .eq("project_id", parsed.data.projectId)
    .eq("subcontractor_id", parsed.data.subcontractorId)
    .eq("is_offset", false)) as {
    data: PurchaseOrderLineJoinedRow[] | null
    error: { message: string } | null
  }
  if (poLinesRes.error) {
    return NextResponse.json({ error: poLinesRes.error.message }, { status: 500 })
  }

  const contractRes = (await supabase
    .from("erp_contracts")
    .select("procurement_commission_pct,status,created_at")
    .eq("company_id", activeCompanyId)
    .eq("project_id", parsed.data.projectId)
    .eq("supplier_id", parsed.data.subcontractorId)
    .order("status", { ascending: true })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()) as {
    data: ContractCommissionRow | null
    error: { message: string } | null
  }
  if (contractRes.error) {
    return NextResponse.json({ error: contractRes.error.message }, { status: 500 })
  }
  const commissionPct = parseNumber(contractRes.data?.procurement_commission_pct)

  const sourceDocuments = (poLinesRes.data ?? []).map(
    (row: PurchaseOrderLineJoinedRow) => {
      const parent = firstOrNull(row.erp_purchase_orders)
      return {
        lineId: String(row.id),
        poId: String(row.purchase_order_id),
        poNumber: String(parent?.po_number ?? ""),
        poDate: parent?.issued_at ?? null,
        description: String(row.description ?? ""),
        amount: parseNumber(row.total_price),
      }
    }
  )
  const baseAmount = sourceDocuments.reduce(
    (sum: number, row: { amount: number }) => sum + row.amount,
    0
  )
  const commissionAmount = Number(((baseAmount * commissionPct) / 100).toFixed(2))
  const totalDeduction = Number((baseAmount + commissionAmount).toFixed(2))

  return NextResponse.json({
    data: {
      sourceDocuments,
      baseAmount,
      procurementCommissionPct: commissionPct,
      procurementCommissionAmount: commissionAmount,
      totalDeduction,
      submittedItemsTotal,
      suggestedLine: {
        taskDescription: "Material Deduction (Auto)",
        claimedAmount: 0,
        approvedAmount: 0,
        notes: `Auto deduction: ${totalDeduction.toFixed(2)}`,
      },
    },
  })
}
