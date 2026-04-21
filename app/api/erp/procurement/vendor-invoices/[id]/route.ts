import { type NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import {
  mapVendorInvoiceRow,
  normalizeRouteParams,
  requireProcurementApiContext,
} from "@/lib/erp/procurement-api"

const updateVendorInvoiceSchema = z.object({
  status: z.enum(["DRAFT", "FINAL", "CANCELLED"]).optional(),
  invoiceDate: z.string().trim().nullable().optional(),
  notes: z.string().trim().nullable().optional(),
})

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  const { id } = await normalizeRouteParams(params)
  const ctx = await requireProcurementApiContext(req)
  if (!ctx.ok) return ctx.response
  const { supabase, activeCompanyId } = ctx

  const { data, error } = await supabase
    .from("erp_vendor_invoices")
    .select("*")
    .eq("id", id)
    .eq("company_id", activeCompanyId)
    .maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: "Vendor invoice not found" }, { status: 404 })
  return NextResponse.json({ data: mapVendorInvoiceRow(data) })
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  const { id } = await normalizeRouteParams(params)
  const ctx = await requireProcurementApiContext(req)
  if (!ctx.ok) return ctx.response
  const { supabase, activeCompanyId } = ctx

  const body = await req.json().catch(() => null)
  const parsed = updateVendorInvoiceSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid payload" }, { status: 400 })

  const patch: Record<string, string | null> = {}
  if (parsed.data.status !== undefined) patch.status = parsed.data.status
  if (parsed.data.invoiceDate !== undefined) patch.invoice_date = parsed.data.invoiceDate
  if (parsed.data.notes !== undefined) patch.notes = parsed.data.notes
  if (Object.keys(patch).length === 0) return NextResponse.json({ error: "No fields supplied" }, { status: 400 })

  const { error } = await supabase
    .from("erp_vendor_invoices")
    .update(patch)
    .eq("id", id)
    .eq("company_id", activeCompanyId)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  const variance = await supabase.rpc("erp_recalculate_invoice_variance", {
    p_company_id: activeCompanyId,
    p_invoice_id: id,
  })
  if (variance.error) return NextResponse.json({ error: variance.error.message }, { status: 500 })

  const loaded = await supabase
    .from("erp_vendor_invoices")
    .select("*")
    .eq("id", id)
    .eq("company_id", activeCompanyId)
    .maybeSingle()
  if (loaded.error) return NextResponse.json({ error: loaded.error.message }, { status: 500 })
  if (!loaded.data) return NextResponse.json({ error: "Vendor invoice not found" }, { status: 404 })
  return NextResponse.json({ data: mapVendorInvoiceRow(loaded.data), variance: variance.data })
}

