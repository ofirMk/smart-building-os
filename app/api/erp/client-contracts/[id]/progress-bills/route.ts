/* eslint-disable @typescript-eslint/no-explicit-any -- TODO(tech-debt): refactor DB row types; tracked for Sprint 3 cleanup. */
import { type NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import {
  mapProgressBillRow,
  normalizeRouteParams,
  requireClientContractsApiContext,
} from "@/lib/erp/client-contracts-api"

const createBillSchema = z.object({
  billNumber: z.string().trim().min(1),
  periodStart: z.string().trim().optional().nullable(),
  periodEnd: z.string().trim().optional().nullable(),
  status: z.enum(["DRAFT", "SUBMITTED", "PARTIALLY_APPROVED", "APPROVED"]).optional(),
})

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  const { id: clientContractId } = await normalizeRouteParams(params)
  const ctx = await requireClientContractsApiContext(req)
  if (!ctx.ok) return ctx.response
  const { supabase, activeCompanyId } = ctx

  const loaded = await supabase
    .from("erp_client_progress_bills")
    .select("*")
    .eq("company_id", activeCompanyId)
    .eq("client_contract_id", clientContractId)
    .order("created_at", { ascending: false })
  if (loaded.error) return NextResponse.json({ error: loaded.error.message }, { status: 500 })
  return NextResponse.json({ data: (loaded.data ?? []).map(mapProgressBillRow) })
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  const { id: clientContractId } = await normalizeRouteParams(params)
  const ctx = await requireClientContractsApiContext(req)
  if (!ctx.ok) return ctx.response
  const { supabase, activeCompanyId } = ctx

  const body = await req.json().catch(() => null)
  const parsed = createBillSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid payload" }, { status: 400 })

  const inserted = await supabase
    .from("erp_client_progress_bills")
    .insert({
      company_id: activeCompanyId,
      client_contract_id: clientContractId,
      bill_number: parsed.data.billNumber,
      period_start: parsed.data.periodStart ?? null,
      period_end: parsed.data.periodEnd ?? null,
      status: parsed.data.status ?? "DRAFT",
      submitted_at:
        parsed.data.status === "SUBMITTED" ||
        parsed.data.status === "PARTIALLY_APPROVED" ||
        parsed.data.status === "APPROVED"
          ? new Date().toISOString()
          : null,
      approved_at: parsed.data.status === "APPROVED" ? new Date().toISOString() : null,
    })
    .select("*")
    .single()
  if (inserted.error) return NextResponse.json({ error: inserted.error.message }, { status: 400 })

  const contractLookup = await supabase
    .from("erp_client_contracts")
    .select("id,project_id,supplier_id,advance_repayment_pct")
    .eq("company_id", activeCompanyId)
    .eq("id", clientContractId)
    .maybeSingle()
  if (contractLookup.error) return NextResponse.json({ error: contractLookup.error.message }, { status: 500 })

  if (contractLookup.data?.project_id && contractLookup.data?.supplier_id) {
    const supplierLookup = await supabase
      .from("erp_md_suppliers")
      .select("id,supplier_type")
      .eq("company_id", activeCompanyId)
      .eq("id", contractLookup.data.supplier_id)
      .maybeSingle()
    if (supplierLookup.error) return NextResponse.json({ error: supplierLookup.error.message }, { status: 500 })

    if (supplierLookup.data?.supplier_type === "SUBCONTRACTOR") {
      const commissionPct = Number(contractLookup.data.advance_repayment_pct ?? 0)

      const [poLinesRes, grLinesRes, invoiceLinesRes] = await Promise.all([
        supabase
          .from("erp_purchase_order_lines")
          .select("id,purchase_order_id,budget_sub_chapter,resource_id,total_price,erp_purchase_orders!inner(id,po_number,issued_at)")
          .eq("company_id", activeCompanyId)
          .eq("project_id", contractLookup.data.project_id)
          .eq("erp_purchase_orders.supplier_id", contractLookup.data.supplier_id),
        supabase
          .from("erp_goods_receipt_lines")
          .select("id,goods_receipt_id,budget_sub_chapter,resource_id,total_price,erp_goods_receipts!inner(id,gr_number,receipt_date,erp_purchase_orders!inner(supplier_id))")
          .eq("company_id", activeCompanyId)
          .eq("project_id", contractLookup.data.project_id)
          .eq("erp_goods_receipts.erp_purchase_orders.supplier_id", contractLookup.data.supplier_id),
        supabase
          .from("erp_vendor_invoice_lines")
          .select("id,vendor_invoice_id,budget_sub_chapter,resource_id,total_price,erp_vendor_invoices!inner(id,invoice_number,invoice_date,supplier_id)")
          .eq("company_id", activeCompanyId)
          .eq("project_id", contractLookup.data.project_id)
          .eq("erp_vendor_invoices.supplier_id", contractLookup.data.supplier_id),
      ])

      if (poLinesRes.error) return NextResponse.json({ error: poLinesRes.error.message }, { status: 500 })
      if (grLinesRes.error) return NextResponse.json({ error: grLinesRes.error.message }, { status: 500 })
      if (invoiceLinesRes.error) {
        return NextResponse.json({ error: invoiceLinesRes.error.message }, { status: 500 })
      }

      type SubBillSeed = {
        sourceType: "PURCHASE_ORDER" | "GOODS_RECEIPT" | "VENDOR_INVOICE"
        sourceId: string
        sourceLineId: string
        sourceNumber: string | null
        sourceDate: string | null
        budgetSubChapter: string
        resourceId: string
        amount: number
      }
      const seeds: SubBillSeed[] = [
        ...(poLinesRes.data ?? []).map((row: any) => ({
          sourceType: "PURCHASE_ORDER" as const,
          sourceId: row.purchase_order_id as string,
          sourceLineId: row.id as string,
          sourceNumber: row.erp_purchase_orders?.po_number ?? null,
          sourceDate: row.erp_purchase_orders?.issued_at ?? null,
          budgetSubChapter: row.budget_sub_chapter as string,
          resourceId: row.resource_id as string,
          amount: Number(row.total_price ?? 0),
        })),
        ...(grLinesRes.data ?? []).map((row: any) => ({
          sourceType: "GOODS_RECEIPT" as const,
          sourceId: row.goods_receipt_id as string,
          sourceLineId: row.id as string,
          sourceNumber: row.erp_goods_receipts?.gr_number ?? null,
          sourceDate: row.erp_goods_receipts?.receipt_date ?? null,
          budgetSubChapter: row.budget_sub_chapter as string,
          resourceId: row.resource_id as string,
          amount: Number(row.total_price ?? 0),
        })),
        ...(invoiceLinesRes.data ?? []).map((row: any) => ({
          sourceType: "VENDOR_INVOICE" as const,
          sourceId: row.vendor_invoice_id as string,
          sourceLineId: row.id as string,
          sourceNumber: row.erp_vendor_invoices?.invoice_number ?? null,
          sourceDate: row.erp_vendor_invoices?.invoice_date ?? null,
          budgetSubChapter: row.budget_sub_chapter as string,
          resourceId: row.resource_id as string,
          amount: Number(row.total_price ?? 0),
        })),
      ].filter((seed) => seed.amount > 0)

      if (seeds.length > 0) {
        const subBillRows = seeds.map((seed) => ({
          company_id: activeCompanyId,
          project_id: contractLookup.data.project_id,
          supplier_id: contractLookup.data.supplier_id,
          source_type: seed.sourceType,
          source_id: seed.sourceId,
          source_line_id: seed.sourceLineId,
          document_number: seed.sourceNumber,
          budget_sub_chapter: seed.budgetSubChapter,
          resource_id: seed.resourceId,
          submitted_amount: seed.amount,
          linked_progress_bill_id: inserted.data.id,
        }))
        const upsertedSubBills = await supabase
          .from("erp_subcontractor_bills")
          .upsert(subBillRows, { onConflict: "company_id,source_type,source_id,source_line_id" })
        if (upsertedSubBills.error) {
          return NextResponse.json({ error: upsertedSubBills.error.message }, { status: 500 })
        }

        const groupedOffsets = new Map<
          string,
          { sourceType: string; sourceId: string; sourceNumber: string | null; sourceDate: string | null; base: number }
        >()
        for (const seed of seeds) {
          const key = `${seed.sourceType}:${seed.sourceId}`
          const current = groupedOffsets.get(key)
          if (!current) {
            groupedOffsets.set(key, {
              sourceType: seed.sourceType,
              sourceId: seed.sourceId,
              sourceNumber: seed.sourceNumber,
              sourceDate: seed.sourceDate,
              base: seed.amount,
            })
            continue
          }
          current.base += seed.amount
        }

        const offsetRows = Array.from(groupedOffsets.values()).map((grouped) => {
          const commissionAmount = Number(((grouped.base * commissionPct) / 100).toFixed(2))
          const offsetAmount = Number((grouped.base + commissionAmount).toFixed(2))
          return {
            company_id: activeCompanyId,
            progress_bill_id: inserted.data.id,
            project_id: contractLookup.data.project_id,
            supplier_id: contractLookup.data.supplier_id,
            source_type: grouped.sourceType,
            source_id: grouped.sourceId,
            source_number: grouped.sourceNumber,
            source_date: grouped.sourceDate,
            base_amount: grouped.base,
            commission_pct: commissionPct,
            commission_amount: commissionAmount,
            offset_amount: offsetAmount,
          }
        })

        const upsertedOffsets = await supabase
          .from("erp_client_progress_bill_offsets")
          .upsert(offsetRows, {
            onConflict: "company_id,progress_bill_id,source_type,source_id",
          })
        if (upsertedOffsets.error) {
          return NextResponse.json({ error: upsertedOffsets.error.message }, { status: 500 })
        }
      }
    }
  }

  return NextResponse.json({ data: mapProgressBillRow(inserted.data) }, { status: 201 })
}

