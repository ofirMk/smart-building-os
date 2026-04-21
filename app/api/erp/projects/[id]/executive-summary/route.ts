import { type NextRequest, NextResponse } from "next/server"

import { requireMasterDataApiContext } from "@/lib/erp/master-data-api"
import { normalizeRouteParams } from "@/lib/erp/procurement-api"
import { renderExecutiveSummaryPdf } from "@/lib/erp/executive-summary-pdf"
import { projectProfitabilitySchema } from "@/lib/erp/project-profitability-schema"
import { parseApiData } from "@/lib/utils/api-client"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  const { id: projectId } = await normalizeRouteParams(params)
  const gate = await requireMasterDataApiContext(req)
  if (!gate.ok) return gate.response
  const { supabase, activeCompanyId } = gate.ctx

  const projectRes = await supabase
    .from("erp_proj_projects")
    .select("id,name")
    .eq("id", projectId)
    .eq("company_id", activeCompanyId)
    .maybeSingle()
  if (projectRes.error) {
    return NextResponse.json({ error: projectRes.error.message }, { status: 500 })
  }
  if (!projectRes.data) {
    return NextResponse.json({ error: "Project not found for active company" }, { status: 404 })
  }

  let pdfBuffer: Buffer
  try {
    const sourceResponse = await fetch(
      new URL(`/api/erp/projects/${projectId}/profitability`, req.url),
      {
        method: "GET",
        cache: "no-store",
        headers: {
          cookie: req.headers.get("cookie") ?? "",
          "x-company-id": activeCompanyId,
          "x-active-company-id": activeCompanyId,
        },
      }
    )
    const profitability = await parseApiData(sourceResponse, {
      schema: projectProfitabilitySchema,
    })

    pdfBuffer = await renderExecutiveSummaryPdf({
      projectId,
      projectName: (projectRes.data as { name?: string | null }).name ?? "Project",
      generatedAtIso: new Date().toISOString(),
      data: profitability,
    })
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to build executive summary PDF",
      },
      { status: 500 }
    )
  }

  const filename = `executive-summary-${projectId.slice(0, 8)}.pdf`
  return new NextResponse(new Uint8Array(pdfBuffer), {
    status: 200,
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="${filename}"`,
      "cache-control": "no-store",
    },
  })
}
