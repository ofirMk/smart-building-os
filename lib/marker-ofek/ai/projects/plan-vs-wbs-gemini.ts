import type { WbsNodeRow } from "@/lib/marker-ofek/wbs-structure-actions"

import {
  parseLooseNumber,
  parseWbsMetadataQuantity,
} from "@/lib/marker-ofek/ai/projects/plan-vs-wbs-quantities"
import { geminiGenerateJsonFromInlineFile } from "@/lib/marker-ofek/ai/shared/gemini-json"

export type PlanTakeoffItem = {
  name: string
  /** כמות מספרית מהתוכנית; null אם לא ניתן לחלץ */
  quantity: number | null
  quantity_hint?: string | null
  unit?: string | null
  notes?: string | null
}

export type PlanVsWbsGeminiResult = {
  plan_components: PlanTakeoffItem[]
  matches: Array<{
    plan_component: string
    wbs_node_id: string | null
    wbs_label?: string | null
    confidence: number
    rationale?: string | null
  }>
  missing_in_wbs: string[]
  missing_in_plan: string[]
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return v != null && typeof v === "object" && !Array.isArray(v)
}

export function normalizePlanVsWbsPayload(raw: unknown): PlanVsWbsGeminiResult {
  if (!isRecord(raw)) {
    throw new Error("פלט המודל אינו אובייקט")
  }
  const plan_components = Array.isArray(raw.plan_components)
    ? (raw.plan_components as unknown[])
        .map((x) => {
          if (!isRecord(x)) return null
          const name = String(x.name ?? "").trim()
          if (!name) return null
          const qNum =
            x.quantity != null && x.quantity !== ""
              ? Number(x.quantity)
              : null
          const quantity =
            qNum != null && Number.isFinite(qNum) ? qNum : null
          return {
            name,
            quantity,
            quantity_hint:
              x.quantity_hint != null ? String(x.quantity_hint) : null,
            unit: x.unit != null ? String(x.unit).trim() || null : null,
            notes: x.notes != null ? String(x.notes) : null,
          } satisfies PlanTakeoffItem
        })
        .filter(Boolean) as PlanTakeoffItem[]
    : []

  const matches = Array.isArray(raw.matches)
    ? (raw.matches as unknown[])
        .map((x) => {
          if (!isRecord(x)) return null
          const plan_component = String(x.plan_component ?? "").trim()
          if (!plan_component) return null
          const wbs_node_id =
            x.wbs_node_id != null && String(x.wbs_node_id).trim() !== ""
              ? String(x.wbs_node_id)
              : null
          const conf = Number(x.confidence)
          return {
            plan_component,
            wbs_node_id,
            wbs_label:
              x.wbs_label != null ? String(x.wbs_label) : null,
            confidence: Number.isFinite(conf) ? conf : 0,
            rationale:
              x.rationale != null ? String(x.rationale) : null,
          }
        })
        .filter(Boolean) as PlanVsWbsGeminiResult["matches"]
    : []

  const missing_in_wbs = Array.isArray(raw.missing_in_wbs)
    ? (raw.missing_in_wbs as unknown[]).map((s) => String(s))
    : []
  const missing_in_plan = Array.isArray(raw.missing_in_plan)
    ? (raw.missing_in_plan as unknown[]).map((s) => String(s))
    : []

  return {
    plan_components,
    matches,
    missing_in_wbs,
    missing_in_plan,
  }
}

function buildWbsContext(nodes: WbsNodeRow[]): string {
  return JSON.stringify(
    nodes.map((n) => ({
      id: n.id,
      label: n.label,
      wbs_code: n.wbs_code,
      planned_quantity: parseWbsMetadataQuantity(n.metadata),
    })),
    null,
    2
  )
}

export async function analyzeElectricalPlanAgainstWbs(input: {
  pdfBase64: string
  mimeType: string
  wbsNodes: WbsNodeRow[]
}): Promise<PlanVsWbsGeminiResult> {
  const wbsJson = buildWbsContext(input.wbsNodes)
  const prompt = `You are a construction plan quantity surveyor (MEP / electrical or general). The attached file is a plan (PDF or image).

1) Extract a structured takeoff: list principal installable items with NUMERIC quantities when visible on the drawing or in a legend/schedule (sockets, fixtures, panels, meters, cable runs if counted, etc.). Use Hebrew or text as on the drawing.
   Field "plan_components": array of { "name": string, "quantity": number|null, "quantity_hint": string|null (if quantity uncertain), "unit": string|null, "notes": string|null }.
   Prefer integers for countables. If only approximate, put null in "quantity" and explain in quantity_hint.

2) WBS nodes JSON is below. Each has "id", "label", "wbs_code", "planned_quantity" (from BOQ metadata — may be null).
   Match each plan line to at most one WBS node id when the label/scope aligns. Use planned_quantity to reason about quantity gaps when matching.

3) Output STRICT JSON only (no markdown):
{
  "plan_components": [...],
  "matches": [ { "plan_component": string (must match a plan_components[].name), "wbs_node_id": string|null, "wbs_label": string|null, "confidence": number 0-1, "rationale": string } ],
  "missing_in_wbs": string[],
  "missing_in_plan": string[]
}
- "missing_in_wbs": plan items with no acceptable WBS match.
- "missing_in_plan": WBS lines that the plan does not visibly cover (best-effort).

WBS_NODES_JSON:
${wbsJson}
`

  const raw = await geminiGenerateJsonFromInlineFile({
    prompt,
    mimeType: input.mimeType,
    base64Data: input.pdfBase64,
  })
  const parsed = normalizePlanVsWbsPayload(raw)

  for (const row of parsed.plan_components) {
    if (row.quantity == null && row.quantity_hint) {
      const fromHint = parseLooseNumber(row.quantity_hint)
      if (fromHint != null) row.quantity = fromHint
    }
  }

  return parsed
}
