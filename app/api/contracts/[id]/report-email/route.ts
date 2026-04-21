import { type NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import { requireMasterDataApiContext } from "@/lib/erp/master-data-api"
import { sendTransactionalEmail } from "@/lib/infrastructure/email-service"

const sendContractReportSchema = z.object({
  to: z.string().trim().email("Invalid recipient email"),
  subject: z.string().trim().min(2, "Subject is required"),
  message: z.string().trim().min(2, "Message is required"),
  pdfBase64: z.string().trim().min(8, "PDF attachment is required"),
  fileName: z.string().trim().min(3, "Filename is required"),
})

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function normalizeParams(params: Promise<{ id: string }> | { id: string }): Promise<{ id: string }> {
  return Promise.resolve(params)
}

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
  const { id: contractId } = await normalizeParams(params)
  const gate = await requireMasterDataApiContext(req)
  if (!gate.ok) return gate.response
  const { supabase, activeCompanyId } = gate.ctx

  const contractResult = await supabase
    .from("erp_contracts")
    .select("id,contract_number,title")
    .eq("id", contractId)
    .eq("company_id", activeCompanyId)
    .maybeSingle()
  if (contractResult.error) {
    return NextResponse.json({ error: contractResult.error.message }, { status: 500 })
  }
  if (!contractResult.data) {
    return NextResponse.json({ error: "Contract not found" }, { status: 404 })
  }

  const body = await req.json().catch(() => null)
  const parsed = sendContractReportSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid payload" }, { status: 400 })
  }

  const html = `
    <div style="font-family: Arial, Helvetica, sans-serif; line-height:1.6; color:#0f172a;">
      <h2 style="margin:0 0 12px;">Contract Report</h2>
      <p style="margin:0 0 12px;">Contract ${escapeHtml(contractResult.data.contract_number)} - ${escapeHtml(contractResult.data.title)}</p>
      <div style="white-space:pre-wrap; font-size:14px;">${escapeHtml(parsed.data.message)}</div>
    </div>
  `

  const emailResult = await sendTransactionalEmail({
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

  if (!emailResult.ok) {
    return NextResponse.json({ error: emailResult.error }, { status: 500 })
  }

  return NextResponse.json({ ok: true, provider: emailResult.provider, messageId: emailResult.id ?? null })
}

