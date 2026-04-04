import type { WbsNodeRow } from "@/lib/marker-ofek/wbs-structure-actions"

import type { PlanVsWbsGeminiResult } from "@/lib/marker-ofek/ai/projects/plan-vs-wbs-gemini"
import {
  parseLooseNumber,
  parseWbsMetadataQuantity,
} from "@/lib/marker-ofek/ai/projects/plan-vs-wbs-quantities"

export type PlanWbsDiscrepancyRow = {
  plan_item_name: string
  plan_quantity: number | null
  plan_unit: string | null
  wbs_node_id: string | null
  wbs_label: string | null
  wbs_code: string | null
  wbs_planned_quantity: number | null
  gap: number | null
  /** תיאור קצר, למשל "תוכנית: 50, WBS: 40, פער: +10" */
  summary_he: string
  severity: "none" | "info" | "warn" | "critical"
}

function severityForGap(
  planQty: number,
  wbsQty: number
): PlanWbsDiscrepancyRow["severity"] {
  if (wbsQty <= 0) return "warn"
  const rel = Math.abs(planQty - wbsQty) / Math.max(planQty, wbsQty, 1)
  if (rel >= 0.25) return "critical"
  if (rel >= 0.08) return "warn"
  return "info"
}

/**
 * דוח פערים כמותיים: תוכנית מול ערכי WBS (metadata) לפי התאמות Gemini.
 */
export function buildPlanVsWbsDiscrepancyReport(
  gemini: PlanVsWbsGeminiResult,
  nodes: WbsNodeRow[]
): PlanWbsDiscrepancyRow[] {
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const rows: PlanWbsDiscrepancyRow[] = []

  for (const m of gemini.matches) {
    const comp = gemini.plan_components.find(
      (c) => c.name.trim() === m.plan_component.trim()
    )
    const planQty =
      comp?.quantity != null && Number.isFinite(comp.quantity)
        ? comp.quantity
        : parseLooseNumber(comp?.quantity_hint)

    const node = m.wbs_node_id ? byId.get(m.wbs_node_id) : undefined
    const wbsQty = node ? parseWbsMetadataQuantity(node.metadata) : null

    const label = node?.label ?? m.wbs_label ?? null
    const code = node?.wbs_code ?? null

    let gap: number | null = null
    let summary_he: string
    let severity: PlanWbsDiscrepancyRow["severity"] = "none"

    if (
      planQty != null &&
      wbsQty != null &&
      m.wbs_node_id &&
      Number.isFinite(planQty) &&
      Number.isFinite(wbsQty)
    ) {
      gap = planQty - wbsQty
      const sign = gap > 0 ? "+" : ""
      summary_he = `תוכנית: ${planQty}, WBS: ${wbsQty}, פער: ${sign}${gap}`
      severity = severityForGap(planQty, wbsQty)
    } else if (planQty != null && (wbsQty == null || !m.wbs_node_id)) {
      summary_he =
        m.wbs_node_id == null
          ? `תוכנית: ${planQty} — אין התאמת WBS לאימות כמות`
          : `תוכנית: ${planQty} — ב-WBS אין שדה כמות (metadata)`
      severity = "warn"
    } else if (planQty == null && wbsQty != null && m.wbs_node_id) {
      summary_he = `WBS: ${wbsQty} — בתוכנית לא חולצה כמות מספרית`
      severity = "info"
    } else {
      summary_he =
        planQty != null
          ? `תוכנית: ${planQty} (השוואה מלאה דורשת כמות בשני הצדדים)`
          : "אין נתוני כמות להשוואה"
      severity = "none"
    }

    rows.push({
      plan_item_name: m.plan_component,
      plan_quantity: planQty,
      plan_unit: comp?.unit ?? null,
      wbs_node_id: m.wbs_node_id,
      wbs_label: label,
      wbs_code: code,
      wbs_planned_quantity: wbsQty,
      gap,
      summary_he,
      severity,
    })
  }

  return rows
}
