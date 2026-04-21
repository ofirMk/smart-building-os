import { type NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import { mapVendorInvoiceRow, requireProcurementApiContext } from "@/lib/erp/procurement-api"

const createVendorInvoiceSchema = z.object({
  supplierId: z.string().uuid(),
  invoiceNumber: z.string().trim().min(1),
  invoiceDate: z.string().trim().optional().nullable(),
  notes: z.string().trim().optional().nullable(),
})

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  const ctx = await requireProcurementApiContext(req)
  if (!ctx.ok) return ctx.response
  const { supabase, activeCompanyId } = ctx

  const status = req.nextUrl.searchParams.get("status")
  let query = supabase
    .from("erp_vendor_invoices")
    .select("*")
    .eq("company_id", activeCompanyId)
    .order("created_at", { ascending: false })
  if (status) query = query.eq("status", status)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data: (data ?? []).map(mapVendorInvoiceRow) })
}

export async function POST(req: NextRequest) {
  const ctx = await requireProcurementApiContext(req)
  if (!ctx.ok) return ctx.response
  const { supabase, activeCompanyId } = ctx

  const body = await req.json().catch(() => null)
  const parsed = createVendorInvoiceSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid payload" }, { status: 400 })

  const { data, error } = await supabase
    .from("erp_vendor_invoices")
    .insert({
      company_id: activeCompanyId,
      supplier_id: parsed.data.supplierId,
      invoice_number: parsed.data.invoiceNumber,
      invoice_date: parsed.data.invoiceDate ?? null,
      notes: parsed.data.notes ?? null,
      status: "DRAFT",
    })
    .select("*")
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ data: mapVendorInvoiceRow(data) }, { status: 201 })
}

