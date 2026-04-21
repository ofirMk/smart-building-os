import { type NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import { normalizeRouteParams, requireProcurementApiContext } from "@/lib/erp/procurement-api"
import { sendTransactionalEmail } from "@/lib/infrastructure/email-service"

const sendPoEmailSchema = z.object({
  to: z.string().trim().email(),
  subject: z.string().trim().min(2),
  message: z.string().trim().min(2),
  pdfBase64: z.string().trim().min(8),
  fileName: z.string().trim().min(3),
})

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;")
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  const { id } = await normalizeRouteParams(params)
  const ctx = await requireProcurementApiContext(req)
  if (!ctx.ok) return ctx.response
  const { supabase, activeCompanyId } = ctx

  const po = await supabase
    .from("erp_purchase_orders")
    .select("id,po_number,title")
    .eq("id", id)
    .eq("company_id", activeCompanyId)
    .maybeSingle()
  if (po.error) return NextResponse.json({ error: po.error.message }, { status: 500 })
  if (!po.data) return NextResponse.json({ error: "Purchase order not found" }, { status: 404 })

  const body = await req.json().catch(() => null)
  const parsed = sendPoEmailSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid payload" }, { status: 400 })

  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;line-height:1.6;color:#0f172a;">
      <h2 style="margin:0 0 12px;">Purchase Order</h2>
      <p style="margin:0 0 12px;">PO ${escapeHtml(po.data.po_number)} - ${escapeHtml(po.data.title)}</p>
      <div style="white-space:pre-wrap">${escapeHtml(parsed.data.message)}</div>
    </div>
  `

  const sent = await sendTransactionalEmail({
    to: parsed.data.to,
    subject: parsed.data.subject,
    html,
    attachments: [
      {
        filename: parsed.data.fileName,
        contentBase64: parsed.data.pdfBase64,
        contentType: "application/pdf",
      },
    ],
  })

  if (!sent.ok) return NextResponse.json({ error: sent.error }, { status: 500 })
  return NextResponse.json({ ok: true, provider: sent.provider, id: sent.id ?? null })
}

