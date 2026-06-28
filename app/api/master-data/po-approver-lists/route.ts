/**
 * GET /api/master-data/po-approver-lists
 *
 * מחזיר רשימות מאשרי הזמנות רכש עבור החברה הפעילה.
 * תומך ב:
 *   ?code=XX    — שליפת רשימה ספציפית לפי קוד
 *   ?withItems=true — מוסיף גם את שורות המאשרים (nested)
 *
 * Priority mapping: PORDAPPLIST (header) + PORDAPPROVERS (items)
 */

import { type NextRequest, NextResponse } from "next/server"
import { requireProcurementApiContext } from "@/lib/erp/procurement-api"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export type PoApproverListItemDto = {
  id: string
  approverName: string
  altApproverName: string | null
  approvalAmount: number | null
  currencyCode: string | null
  sortOrder: number
}

export type PoApproverListDto = {
  id: string
  code: string
  description: string
  currencyCode: string | null
  minAmount: number | null
  isActive: boolean
  items?: PoApproverListItemDto[]
}

export async function GET(req: NextRequest) {
  const ctx = await requireProcurementApiContext(req)
  if (!ctx.ok) return ctx.response
  const { supabase, activeCompanyId } = ctx

  const { searchParams } = new URL(req.url)
  const code = searchParams.get("code")?.trim() || null
  const withItems = searchParams.get("withItems") === "true"

  // ── 1. Header query ──────────────────────────────────────────────
  let headerQ = supabase
    .from("erp_md_po_approver_lists")
    .select("id,code,description,currency_code,min_amount,is_active")
    .eq("company_id", activeCompanyId)
    .eq("is_active", true)
    .order("code", { ascending: true })

  if (code) {
    headerQ = headerQ.eq("code", code)
  }

  const { data: lists, error: listsError } = await headerQ
  if (listsError) {
    return NextResponse.json({ error: listsError.message }, { status: 500 })
  }

  const results = (lists ?? []) as { id: string; code: string; description: string; currency_code: string | null; min_amount: number | null; is_active: boolean }[]

  if (!withItems || results.length === 0) {
    const dto: PoApproverListDto[] = results.map((r) => ({
      id: r.id,
      code: r.code,
      description: r.description,
      currencyCode: r.currency_code ?? null,
      minAmount: r.min_amount != null ? Number(r.min_amount) : null,
      isActive: Boolean(r.is_active),
    }))
    return NextResponse.json({ data: dto })
  }

  // ── 2. Items query (withItems=true) ──────────────────────────────
  const listIds = results.map((r) => r.id)

  const { data: items, error: itemsError } = await supabase
    .from("erp_md_po_approver_list_items")
    .select("id,list_id,approver_name,alt_approver_name,approval_amount,currency_code,sort_order")
    .eq("company_id", activeCompanyId)
    .in("list_id", listIds)
    .order("list_id", { ascending: true })
    .order("sort_order", { ascending: true })

  if (itemsError) {
    return NextResponse.json({ error: itemsError.message }, { status: 500 })
  }

  // ── 3. Merge & return ────────────────────────────────────────────
  const itemsByList = new Map<string, PoApproverListItemDto[]>()
  for (const item of (items ?? []) as { id: string; list_id: string; approver_name: string; alt_approver_name: string | null; approval_amount: number | null; currency_code: string | null; sort_order: number }[]) {
    const listId = item.list_id
    if (!itemsByList.has(listId)) itemsByList.set(listId, [])
    itemsByList.get(listId)!.push({
      id: item.id,
      approverName: item.approver_name,
      altApproverName: item.alt_approver_name ?? null,
      approvalAmount: item.approval_amount != null ? Number(item.approval_amount) : null,
      currencyCode: item.currency_code ?? null,
      sortOrder: item.sort_order ?? 0,
    })
  }

  const dto: PoApproverListDto[] = results.map((r) => ({
    id: r.id,
    code: r.code,
    description: r.description,
    currencyCode: r.currency_code ?? null,
    minAmount: r.min_amount != null ? Number(r.min_amount) : null,
    isActive: Boolean(r.is_active),
    items: itemsByList.get(r.id) ?? [],
  }))

  return NextResponse.json({ data: dto })
}
