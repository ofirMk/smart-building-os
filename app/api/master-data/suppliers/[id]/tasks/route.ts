/**
 * `/api/master-data/suppliers/[id]/tasks` — Priority parity
 *
 * GET — list of supplier tasks (משימות לספק).
 * POST — create new task.
 */

import { type NextRequest, NextResponse } from "next/server"
import { requireMasterDataApiContext } from "@/lib/erp/master-data-api"
import type { ErpSupplierTask } from "@/types/erp"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function normalizeParams(
  params: Promise<{ id: string }> | { id: string },
): Promise<{ id: string }> {
  return Promise.resolve(params)
}

type TaskStatus = "OPEN" | "DONE" | "CANCELLED"

function mapTask(row: Record<string, unknown>): ErpSupplierTask {
  return {
    id: row.id as string,
    companyId: row.company_id as string,
    supplierId: row.supplier_id as string,
    taskDate: row.task_date as string,
    assignedTo: (row.assigned_to as string | null) ?? null,
    summary: (row.summary as string | null) ?? null,
    status: ((row.status as string) ?? "OPEN") as TaskStatus,
    isCompleted: (row.is_completed as boolean) ?? false,
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } },
) {
  const { id: supplierId } = await normalizeParams(params)
  const gate = await requireMasterDataApiContext(req)
  if (!gate.ok) return gate.response

  const { supabase, activeCompanyId } = gate.ctx
  const showAll = req.nextUrl.searchParams.get("all") === "1"

  let query = supabase
    .from("erp_supplier_tasks")
    .select("*")
    .eq("company_id", activeCompanyId)
    .eq("supplier_id", supplierId)
    .order("task_date", { ascending: false })

  if (!showAll) {
    query = query.neq("status", "CANCELLED")
  }

  const { data, error } = await query

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json((data ?? []).map((r) => mapTask(r as Record<string, unknown>)))
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } },
) {
  const { id: supplierId } = await normalizeParams(params)
  const gate = await requireMasterDataApiContext(req)
  if (!gate.ok) return gate.response

  const { supabase, activeCompanyId } = gate.ctx
  const body = await req.json()

  const { data, error } = await supabase
    .from("erp_supplier_tasks")
    .insert({
      company_id: activeCompanyId,
      supplier_id: supplierId,
      task_date: body.taskDate ?? new Date().toISOString().slice(0, 10),
      assigned_to: body.assignedTo ?? null,
      summary: body.summary ?? null,
      status: body.status ?? "OPEN",
      is_completed: body.isCompleted ?? false,
    })
    .select("*")
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 422 })

  return NextResponse.json(mapTask(data as Record<string, unknown>), { status: 201 })
}
