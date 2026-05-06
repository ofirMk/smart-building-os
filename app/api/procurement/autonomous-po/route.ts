/**
 * `/api/procurement/autonomous-po` — Phase B
 *
 * POST — מקבל פרמטרי הפעלה ידניים (assembly + qty + project + location), מפעיל
 * את ה-RPC הדטרמיניסטי `erp_generate_draft_po_from_bom` ומחזיר את ה-PO החדש.
 *
 * ## חוזה
 * - input: { projectId, locationId?, assemblyId, requestedQty, supplierIdOverride? }
 * - success: { data: { purchaseOrderId, poNumber, status, totalAmountNet, violations[],
 *                       bomRequestId, linesCount } }
 * - errors:
 *   - 400 — payload לא תקין
 *   - 403 — אין הרשאה לחברה (RLS)
 *   - 409 — חריגה הנדסית מסוג BLOCK (errcode=P0001)
 *   - 500 — שגיאת DB אחרת
 *
 * ## הערה ארכיטקטונית
 * ה-RPC הוא Security Definer ושומר על tenant isolation דרך user_has_company_access.
 * אנחנו עדיין מאמתים `x-active-company-id` כאן כשכבת הגנה כפולה (defense in depth).
 *
 * ## אין AI כאן
 * Phase B מבסס את ה-pipeline הדטרמיניסטי. ב-Phase C ייווצר נתיב נפרד
 * `/api/procurement/ai-bom-request` שיקרא ל-LLM ויעטוף את אותו RPC כ-tool.
 */

import { type NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import { requireProcurementApiContext } from "@/lib/erp/procurement-api"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const inputSchema = z.object({
  projectId: z.string().uuid("projectId חייב להיות uuid"),
  locationId: z.string().uuid().nullable().optional(),
  assemblyId: z.string().uuid("assemblyId חייב להיות uuid"),
  requestedQty: z.number().positive("requestedQty חייב להיות חיובי"),
  supplierIdOverride: z.string().uuid().nullable().optional(),
})

type RpcRow = {
  purchase_order_id: string
  po_number: string
  po_status: string
  total_amount_net: number | string
  violations: unknown
  bom_request_id: string
  lines_count: number | string
}

/**
 * GET — מחזיר את 3 הקולקציות הדרושות לטופס:
 *   • projects   — פרויקטים פעילים בחברה
 *   • assemblies — קיטים פעילים (Phase A: erp_md_product_assemblies)
 *   • locations  — מיקומים פעילים (אופציונלי, מסונן ע"י projectId אם סופק)
 *
 * שילוב לאנדפוינט אחד חוסך 3 round-trips ל-UI.
 */
type ProjectOption = {
  id: string
  projectNumber: string
  name: string
  status: string
}
type AssemblyOption = {
  id: string
  code: string
  name: string
  category: string
  unitOfMeasure: string
}
type LocationOption = {
  id: string
  projectId: string
  code: string
  name: string
  levelType: string
  lengthM: number | null
  areaSqm: number | null
}
type AutonomousPoOptionsDto = {
  projects: ProjectOption[]
  assemblies: AssemblyOption[]
  locations: LocationOption[]
}

export async function GET(req: NextRequest) {
  const ctx = await requireProcurementApiContext(req)
  if (!ctx.ok) return ctx.response
  const { supabase, activeCompanyId } = ctx

  const projectIdFilter = req.nextUrl.searchParams.get("projectId")?.trim() || null

  const [projectsRes, assembliesRes, locationsRes] = await Promise.all([
    supabase
      .from("erp_proj_projects")
      .select("id,project_number,name,status")
      .eq("company_id", activeCompanyId)
      .order("project_number", { ascending: true }),
    supabase
      .from("erp_md_product_assemblies")
      .select("id,code,name,category,unit_of_measure,is_active")
      .eq("company_id", activeCompanyId)
      .eq("is_active", true)
      .order("code", { ascending: true }),
    (() => {
      let q = supabase
        .from("erp_proj_locations")
        .select("id,project_id,code,name,level_type,length_m,area_sqm,is_active")
        .eq("company_id", activeCompanyId)
        .eq("is_active", true)
        .order("code", { ascending: true })
      if (projectIdFilter) q = q.eq("project_id", projectIdFilter)
      return q
    })(),
  ])

  if (projectsRes.error || assembliesRes.error || locationsRes.error) {
    return NextResponse.json(
      {
        error:
          projectsRes.error?.message ??
          assembliesRes.error?.message ??
          locationsRes.error?.message ??
          "Query failed",
      },
      { status: 500 }
    )
  }

  const dto: AutonomousPoOptionsDto = {
    projects: (projectsRes.data ?? []).map((r: any) => ({
      id: r.id,
      projectNumber: r.project_number,
      name: r.name,
      status: r.status,
    })),
    assemblies: (assembliesRes.data ?? []).map((r: any) => ({
      id: r.id,
      code: r.code,
      name: r.name,
      category: r.category,
      unitOfMeasure: r.unit_of_measure,
    })),
    locations: (locationsRes.data ?? []).map((r: any) => ({
      id: r.id,
      projectId: r.project_id,
      code: r.code,
      name: r.name,
      levelType: r.level_type,
      lengthM: r.length_m === null ? null : Number(r.length_m),
      areaSqm: r.area_sqm === null ? null : Number(r.area_sqm),
    })),
  }

  return NextResponse.json({ data: dto })
}

export async function POST(req: NextRequest) {
  const ctx = await requireProcurementApiContext(req)
  if (!ctx.ok) return ctx.response
  const { supabase, activeCompanyId, userId } = ctx

  const body = await req.json().catch(() => null)
  const parsed = inputSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid payload" },
      { status: 400 }
    )
  }
  const input = parsed.data

  const { data, error } = await supabase.rpc("erp_generate_draft_po_from_bom", {
    p_company_id: activeCompanyId,
    p_project_id: input.projectId,
    p_assembly_id: input.assemblyId,
    p_requested_qty: input.requestedQty,
    p_location_id: input.locationId ?? null,
    p_created_by: userId ?? null,
    p_supplier_id_override: input.supplierIdOverride ?? null,
  })

  if (error) {
    // P0001 = אנו זרקנו ידנית ב-BLOCK violation; הפכנו ל-409 עם פירוט.
    // P0002 = no_data_found (assembly/project לא קיים)
    // 22023 = invalid_parameter_value
    // 42501 = insufficient_privilege (RLS)
    const code = error.code
    if (code === "P0001") {
      // הפרטים נמצאים ב-error.details (העברנו את v_violations כ-text)
      let parsedDetails: unknown = null
      try {
        parsedDetails = JSON.parse((error.details as string) ?? "[]")
      } catch {
        parsedDetails = error.details ?? null
      }
      return NextResponse.json(
        {
          error: "engineering_block",
          message: error.message,
          violations: parsedDetails,
          hint: error.hint ?? null,
        },
        { status: 409 }
      )
    }
    if (code === "42501") {
      return NextResponse.json({ error: error.message }, { status: 403 })
    }
    const status =
      code === "P0002" ? 404 : code === "22023" ? 400 : 500
    return NextResponse.json({ error: error.message, code }, { status })
  }

  const rows = (data ?? []) as RpcRow[]
  const row = rows[0]
  if (!row) {
    return NextResponse.json(
      { error: "RPC לא החזיר תוצאה" },
      { status: 500 }
    )
  }

  return NextResponse.json(
    {
      data: {
        purchaseOrderId: row.purchase_order_id,
        poNumber: row.po_number,
        status: row.po_status,
        totalAmountNet: Number(row.total_amount_net),
        violations: Array.isArray(row.violations) ? row.violations : [],
        bomRequestId: row.bom_request_id,
        linesCount: Number(row.lines_count),
      },
    },
    { status: 201 }
  )
}
