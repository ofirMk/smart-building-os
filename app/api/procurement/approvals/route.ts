/**
 * `/api/procurement/approvals` — Phase 8.1.2
 *
 * מחזיר את "תיבת האישורים": כל ה-POs בסטטוס PENDING_APPROVAL לחברה הפעילה,
 * עם הפרטים שצריך כדי להציג שורה בדשבורד אישורים — בלי לדרוש מהקליינט
 * לעשות 4 round-trips נפרדים.
 *
 * ## מקורות נתונים
 *   • `erp_purchase_orders` — שורת ה-PO + flags של escalation
 *     (requires_po_escalation, urgency_level, current_approval_level).
 *   • `erp_md_suppliers` — JOIN דרך supplier_id ל-name + supplier_number.
 *   • `erp_proj_projects` — JOIN דרך project_id ל-name (תצוגה).
 *   • `erp_purchase_order_lines` — סופרים כמה שורות עם requires_escalation=true
 *     כדי לחשב escalation reason מתאים.
 *   • `erp_po_approvals` — שולפים את ה-pending לאותו level (current_approval_level)
 *     כדי לדעת איזה role/user מצפה לאישור עכשיו.
 *
 * ## אכיפה
 *   `requireProcurementApiContext` כבר מוודא membership ל-active company.
 *   בנוסף, ה-RLS על כל אחת מהטבלאות שולל גישה למשתמש שאינו בחברה. שכבת
 *   אבטחה כפולה (defense in depth).
 */

import { type NextRequest, NextResponse } from "next/server"

import { requireProcurementApiContext } from "@/lib/erp/procurement-api"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** שורת תיבת אישורים — DTO שטוח לקליינט. */
export type ApprovalInboxRowDto = {
  id: string
  poNumber: string
  title: string
  totalAmountGross: number
  currency: string
  createdAt: string
  /** רמה נוכחית בשרשרת האישורים (1, 2, 3…). */
  currentLevel: number
  urgency: string
  supplier: { id: string; name: string; supplierNum: string | null } | null
  project: { id: string; name: string } | null
  /** סיבות החריגה — מילוליות, מוכנות לתצוגה ב-UI. */
  escalationReasons: string[]
  /** מי אמור לאשר עכשיו (role או user). */
  pendingApprover: {
    approvalId: string
    requiredRole: string | null
    approverUserId: string | null
  } | null
}

type SupplierEmbed = {
  id: string
  name: string
  supplier_number: string | null
} | null
type ProjectEmbed = { id: string; name: string } | null

type PoRow = {
  id: string
  po_number: string
  title: string | null
  status: string
  total_amount: number | string | null
  total_amount_gross: number | string | null
  currency: string | null
  created_at: string
  current_approval_level: number | null
  urgency_level: string | null
  requires_po_escalation: boolean | null
  project_id: string | null
  supplier: SupplierEmbed | SupplierEmbed[]
  project: ProjectEmbed | ProjectEmbed[]
}

function pickOne<T>(value: T | T[] | null | undefined): T | null {
  if (value == null) return null
  return Array.isArray(value) ? (value[0] ?? null) : value
}

export async function GET(req: NextRequest) {
  const ctx = await requireProcurementApiContext(req)
  if (!ctx.ok) return ctx.response
  const { supabase, activeCompanyId } = ctx

  // 1) PO Headers בסטטוס PENDING_APPROVAL — עם supplier + project כ-FK embed.
  const { data: poData, error: poErr } = await supabase
    .from("erp_purchase_orders")
    .select(
      `id,po_number,title,status,total_amount,total_amount_gross,currency,created_at,
       current_approval_level,urgency_level,requires_po_escalation,project_id,
       supplier:erp_md_suppliers!supplier_id(id,name,supplier_number),
       project:erp_proj_projects!project_id(id,name)`,
    )
    .eq("company_id", activeCompanyId)
    .eq("status", "PENDING_APPROVAL")
    .order("created_at", { ascending: false })

  if (poErr) {
    return NextResponse.json({ error: poErr.message }, { status: 500 })
  }

  const rows = (poData ?? []) as PoRow[]
  if (rows.length === 0) {
    return NextResponse.json({ data: [] })
  }

  const poIds = rows.map((r) => r.id)

  // 2) שאילתות נלוות במקביל — line escalation counts + pending approvals.
  const [lineRes, approvalRes] = await Promise.all([
    supabase
      .from("erp_purchase_order_lines")
      .select("purchase_order_id,requires_escalation")
      .in("purchase_order_id", poIds)
      .eq("requires_escalation", true),
    supabase
      .from("erp_po_approvals")
      .select("id,purchase_order_id,level,required_role,approver_user_id,status")
      .in("purchase_order_id", poIds)
      .eq("status", "PENDING"),
  ])

  if (lineRes.error) {
    return NextResponse.json({ error: lineRes.error.message }, { status: 500 })
  }
  if (approvalRes.error) {
    return NextResponse.json(
      { error: approvalRes.error.message },
      { status: 500 },
    )
  }

  // count שורות חורגות פר-PO.
  const lineEscalationByPo = new Map<string, number>()
  for (const l of lineRes.data ?? []) {
    const k = (l as { purchase_order_id: string }).purchase_order_id
    lineEscalationByPo.set(k, (lineEscalationByPo.get(k) ?? 0) + 1)
  }

  // approval ראשון פר PO ברמה הנוכחית — ייחודי לפי (po_id, level).
  type ApprovalRow = {
    id: string
    purchase_order_id: string
    level: number
    required_role: string | null
    approver_user_id: string | null
  }
  const pendingApprovalsByPo = new Map<string, ApprovalRow>()
  for (const raw of (approvalRes.data ?? []) as ApprovalRow[]) {
    const existing = pendingApprovalsByPo.get(raw.purchase_order_id)
    if (!existing || raw.level < existing.level) {
      pendingApprovalsByPo.set(raw.purchase_order_id, raw)
    }
  }

  const dto: ApprovalInboxRowDto[] = rows.map((r) => {
    const supplier = pickOne(r.supplier)
    const project = pickOne(r.project)
    const lineEscCount = lineEscalationByPo.get(r.id) ?? 0
    const pendingApproval = pendingApprovalsByPo.get(r.id) ?? null

    // בניית "סיבות חריגה" קריאות — שלוש קטגוריות: PO-level, lines, urgency.
    const reasons: string[] = []
    if (r.requires_po_escalation) reasons.push("ההזמנה סומנה כדורשת אסקלציה")
    if (lineEscCount > 0)
      reasons.push(
        lineEscCount === 1
          ? "שורה אחת חורגת מסף תקציב"
          : `${lineEscCount} שורות חורגות מסף תקציב`,
      )
    if (r.urgency_level === "HIGH" || r.urgency_level === "CRITICAL")
      reasons.push(
        r.urgency_level === "CRITICAL" ? "דחיפות קריטית" : "דחיפות גבוהה",
      )

    return {
      id: r.id,
      poNumber: r.po_number,
      title: r.title ?? "",
      totalAmountGross: Number(r.total_amount_gross ?? r.total_amount ?? 0),
      currency: r.currency ?? "ILS",
      createdAt: r.created_at,
      currentLevel: r.current_approval_level ?? 1,
      urgency: r.urgency_level ?? "NORMAL",
      supplier: supplier
        ? {
            id: supplier.id,
            name: supplier.name,
            supplierNum: supplier.supplier_number,
          }
        : null,
      project: project ? { id: project.id, name: project.name } : null,
      escalationReasons: reasons,
      pendingApprover: pendingApproval
        ? {
            approvalId: pendingApproval.id,
            requiredRole: pendingApproval.required_role,
            approverUserId: pendingApproval.approver_user_id,
          }
        : null,
    }
  })

  return NextResponse.json({ data: dto })
}
