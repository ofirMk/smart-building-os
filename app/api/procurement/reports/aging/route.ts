/**
 * GET /api/procurement/reports/aging
 *
 * Phase 9.3 — Open Orders Aging Report
 *
 * Buckets all open POs by their age since creation date:
 *   0–30 days, 31–60 days, 61–90 days, 90+ days
 *
 * "Open" = any status that is not CLOSED / CANCELLED / FULLY_RECEIVED / RECEIVED.
 *
 * ## Response
 *   buckets  — { "0-30": AgingBucket, "31-60": AgingBucket, "61-90": AgingBucket, "90+": AgingBucket }
 *   rows     — flat list of all open POs sorted by age desc
 *   summary  — total count, total exposure, oldest PO age
 *
 * ## Query params
 *   ?status=OPEN   — default; pass comma-separated statuses to override
 *   ?supplierId=UUID — filter by supplier
 *   ?projectId=UUID  — filter by project
 */

import { type NextRequest, NextResponse } from "next/server"

import { requireProcurementApiContext } from "@/lib/erp/procurement-api"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const OPEN_STATUSES = [
  "DRAFT",
  "PENDING",
  "PENDING_APPROVAL",
  "PENDING_PRICE_APPROVAL",
  "PENDING_CEO_APPROVAL",
  "APPROVED",
  "ISSUED",
  "SENT_TO_SUPPLIER",
  "ON_SHIP",
  "PARTIALLY_RECEIVED",
]

export type AgingRow = {
  id: string
  poNumber: string
  title: string
  status: string
  totalAmount: number
  currency: string
  createdAt: string
  issuedAt: string | null
  ageDays: number
  bucket: "0-30" | "31-60" | "61-90" | "90+"
  supplierId: string
  supplierName: string
  projectId: string
  projectName: string
  isReleaseOrder: boolean
}

export type AgingBucket = {
  label: string
  count: number
  totalExposure: number
  rows: AgingRow[]
}

export type AgingReportDto = {
  buckets: {
    "0-30": AgingBucket
    "31-60": AgingBucket
    "61-90": AgingBucket
    "90+": AgingBucket
  }
  totalOpenCount: number
  totalExposure: number
  oldestAgeDays: number
  asOf: string
}

function bucket(ageDays: number): AgingRow["bucket"] {
  if (ageDays <= 30) return "0-30"
  if (ageDays <= 60) return "31-60"
  if (ageDays <= 90) return "61-90"
  return "90+"
}

export async function GET(req: NextRequest) {
  const ctx = await requireProcurementApiContext(req)
  if (!ctx.ok) return ctx.response
  const { supabase, activeCompanyId } = ctx

  const statusesParam = req.nextUrl.searchParams.get("statuses")
  const statusFilter = statusesParam
    ? statusesParam.split(",").map((s) => s.trim()).filter(Boolean)
    : OPEN_STATUSES

  const supplierIdFilter = req.nextUrl.searchParams.get("supplierId")
  const projectIdFilter = req.nextUrl.searchParams.get("projectId")

  // ── Fetch open POs ─────────────────────────────────────────────────────
  let query = supabase
    .from("erp_purchase_orders")
    .select(
      "id,po_number,title,status,total_amount_gross,total_amount_net,currency," +
      "created_at,issued_at,supplier_id,project_id,is_release_order," +
      "erp_md_suppliers!supplier_id(id,name)," +
      "erp_proj_projects!project_id(id,name)",
    )
    .eq("company_id", activeCompanyId)
    .in("status", statusFilter)
    .order("created_at", { ascending: true })

  if (supplierIdFilter) query = query.eq("supplier_id", supplierIdFilter)
  if (projectIdFilter) query = query.eq("project_id", projectIdFilter)

  const { data, error } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const now = new Date()
  type Join<T> = T | T[] | null
  type Sup = { id: string; name: string }
  type Proj = { id: string; name: string }

  function pickOne<T>(val: T | T[] | null): T | null {
    if (!val) return null
    if (Array.isArray(val)) return val[0] ?? null
    return val
  }

  const rows: AgingRow[] = (data ?? []).map((row: Record<string, unknown>) => {
    const supplier = pickOne(row.erp_md_suppliers as Join<Sup>)
    const project = pickOne(row.erp_proj_projects as Join<Proj>)
    const createdAt = row.created_at as string
    const msAge = now.getTime() - new Date(createdAt).getTime()
    const ageDays = Math.floor(msAge / (1000 * 60 * 60 * 24))

    return {
      id: row.id as string,
      poNumber: row.po_number as string,
      title: row.title as string,
      status: row.status as string,
      totalAmount: Number(row.total_amount_gross ?? row.total_amount_net ?? 0),
      currency: (row.currency as string | null) ?? "ILS",
      createdAt,
      issuedAt: (row.issued_at as string | null) ?? null,
      ageDays,
      bucket: bucket(ageDays),
      supplierId: row.supplier_id as string,
      supplierName: supplier?.name ?? "—",
      projectId: row.project_id as string,
      projectName: project?.name ?? "—",
      isReleaseOrder: (row.is_release_order as boolean | null) ?? false,
    }
  })

  // Sort by age descending (oldest first)
  rows.sort((a, b) => b.ageDays - a.ageDays)

  // Build buckets
  const makeBucket = (label: string, key: AgingRow["bucket"]): AgingBucket => {
    const bucketRows = rows.filter((r) => r.bucket === key)
    return {
      label,
      count: bucketRows.length,
      totalExposure: Math.round(
        bucketRows.reduce((sum, r) => sum + r.totalAmount, 0) * 100,
      ) / 100,
      rows: bucketRows,
    }
  }

  const buckets: AgingReportDto["buckets"] = {
    "0-30": makeBucket("0–30 ימים", "0-30"),
    "31-60": makeBucket("31–60 ימים", "31-60"),
    "61-90": makeBucket("61–90 ימים", "61-90"),
    "90+": makeBucket("91+ ימים", "90+"),
  }

  const totalOpenCount = rows.length
  const totalExposure = Math.round(
    rows.reduce((sum, r) => sum + r.totalAmount, 0) * 100,
  ) / 100
  const oldestAgeDays = rows.length > 0 ? Math.max(...rows.map((r) => r.ageDays)) : 0

  const dto: AgingReportDto = {
    buckets,
    totalOpenCount,
    totalExposure,
    oldestAgeDays,
    asOf: now.toISOString(),
  }

  return NextResponse.json({ data: dto })
}
